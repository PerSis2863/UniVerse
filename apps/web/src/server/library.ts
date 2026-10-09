import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { notify, notifyMany } from './email';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from './http';
import { can, need } from './permissions';

// The library (Stage 5 · B15.4). Librarians (admins, or staff with library.manage) add books (by
// ISBN, looked up on Open Library: free, no key) with their copies, each with a barcode; lend a
// copy by scanning it and choosing the borrower; take it back by scanning it, with a fine when it's
// late (the library's rate, capped). Students and teachers search the catalogue, see what's on the
// shelf, reserve (hold) books that are all out, renew their own loans (when nobody is waiting)
// and see their fines. A returned copy is kept for the first person waiting for a few days, then
// goes to the next one. Notices in the app only.

const ISBN_RE = /^(97[89])?\d{9}[\dX]$/;
const MAX_HOLDS = 5, REMIND_EVERY_MS = 3 * 86_400_000;
const BORROWERS = ['STUDENT', 'TEACHER'];
const DAY = 86_400_000;
const member = (u: SessionUser) => { if (!BORROWERS.includes(u.role) && u.role !== 'ADMIN') throw new ForbiddenException('The library is for students and staff.'); };

// ── ISBNs ───────────────────────────────────────────────────────────────────────────────────

/** "978-0-14-310755-2" → "9780143107552"; null unless it's a valid ISBN-10 or ISBN-13. */
export function cleanIsbn(v: unknown): string | null {
  const s = typeof v === 'string' ? v.toUpperCase().replace(/[^0-9X]/g, '') : '';
  if (!ISBN_RE.test(s)) return null;
  if (s.length === 10) {
    const sum = [...s].reduce((acc, ch, i) => acc + (ch === 'X' ? 10 : Number(ch)) * (10 - i), 0);
    return sum % 11 === 0 && !s.slice(0, 9).includes('X') ? s : null;
  }
  if (s.includes('X')) return null;
  const sum = [...s].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 ? 3 : 1), 0);
  return sum % 10 === 0 ? s : null;
}

/** A book's details from Open Library, or null when it doesn't know the ISBN (or is unreachable). */
export async function lookupIsbn(isbn: string) {
  try {
    const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`, { signal: AbortSignal.timeout(6000), headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, { title?: string; subtitle?: string; authors?: { name?: string }[]; publishers?: { name?: string }[]; publish_date?: string; subjects?: { name?: string }[]; cover?: { medium?: string } }>;
    const b = body[`ISBN:${isbn}`];
    if (!b?.title) return null;
    const year = Number(/(\d{4})/.exec(b.publish_date ?? '')?.[1]) || null;
    const cover = typeof b.cover?.medium === 'string' && b.cover.medium.startsWith('https://covers.openlibrary.org/') ? b.cover.medium : null;
    return {
      isbn, title: `${b.title}${b.subtitle ? `: ${b.subtitle}` : ''}`.slice(0, 300),
      authors: (b.authors ?? []).map((a) => a.name).filter(Boolean).join(', ').slice(0, 300) || null,
      publisher: b.publishers?.[0]?.name?.slice(0, 150) ?? null, year,
      subjects: (b.subjects ?? []).map((x) => x.name).filter(Boolean).slice(0, 6).join(', ').slice(0, 300) || null,
      coverUrl: cover,
    };
  } catch {
    return null;
  }
}

// ── Rules ───────────────────────────────────────────────────────────────────────────────────

export async function librarySettings() {
  return (await prisma.librarySettings.findUnique({ where: { id: 'default' } })) ?? { id: 'default', loanDays: 14, maxRenewals: 2, maxLoans: 4, finePerDay: 0, fineCap: 0, currency: 'INR', holdDays: 3, updatedAt: new Date() };
}

/** The fine for a copy returned at `returned` that was due at `due`: whole days late × the rate, capped. */
export function fineFor(due: Date, returned: Date, perDay: number, cap: number) {
  const late = Math.max(0, Math.ceil((returned.getTime() - due.getTime() - 3600_000) / DAY)); // an hour's grace
  const fine = late * Math.max(0, perDay);
  return cap > 0 ? Math.min(fine, cap) : fine;
}

/** Holds whose kept copy wasn't collected in time: they expire and the copy goes to the next person (up to 20 at a time). */
async function expireHolds() {
  const late = await prisma.libraryHold.findMany({ where: { status: 'READY', readyUntil: { lt: new Date() } }, take: 20, select: { id: true, copyId: true, bookId: true } });
  for (const h of late) {
    await prisma.libraryHold.update({ where: { id: h.id }, data: { status: 'EXPIRED' } });
    if (h.copyId) await passOn(h.copyId, h.bookId);
  }
}

/** A copy back on the shelf: kept for the first person waiting, or available. Returns who it's kept for. */
async function passOn(copyId: string, bookId: string) {
  const s = await librarySettings();
  const next = await prisma.libraryHold.findFirst({ where: { bookId, status: 'WAITING' }, orderBy: { createdAt: 'asc' }, select: { id: true, userId: true, book: { select: { title: true } }, user: { select: { name: true } } } });
  if (!next) {
    await prisma.libraryCopy.update({ where: { id: copyId }, data: { status: 'AVAILABLE', heldForId: null, heldUntil: null } });
    return null;
  }
  const until = new Date(Date.now() + s.holdDays * DAY);
  await prisma.libraryHold.update({ where: { id: next.id }, data: { status: 'READY', copyId, readyUntil: until } });
  await prisma.libraryCopy.update({ where: { id: copyId }, data: { status: 'HELD', heldForId: next.userId, heldUntil: until } });
  await notify(next.userId, { type: 'library', title: `Ready to collect: ${next.book.title}`, body: `It’s kept for you at the library until ${until.toISOString().slice(0, 10)}.`, link: '/library', email: false });
  return next.user.name;
}

// ── Catalogue (everyone) ────────────────────────────────────────────────────────────────────

/** GET /api/library?q=: books matching a title, author, subject or ISBN (newest first without a search), with what's on the shelf. */
export async function catalogue(user: SessionUser, q: string) {
  member(user);
  await expireHolds();
  const text = q.trim().slice(0, 80);
  const isbn = cleanIsbn(text);
  const books = await prisma.libraryBook.findMany({
    where: isbn ? { isbn } : text ? { OR: [{ title: { contains: text } }, { authors: { contains: text } }, { subjects: { contains: text } }, { isbn: { contains: text.replace(/[^0-9X]/gi, '') || '#' } }] } : {},
    orderBy: text ? { title: 'asc' } : { createdAt: 'desc' }, take: 60,
    select: { id: true, isbn: true, title: true, authors: true, year: true, coverUrl: true, shelf: true, copies: { select: { status: true, heldForId: true } }, holds: { where: { status: { in: ['WAITING', 'READY'] } }, select: { userId: true, status: true } } },
  });
  return {
    books: books.map((b) => ({
      id: b.id, isbn: b.isbn, title: b.title, authors: b.authors, year: b.year, coverUrl: b.coverUrl, shelf: b.shelf,
      copies: b.copies.length, available: b.copies.filter((c) => c.status === 'AVAILABLE').length,
      waiting: b.holds.filter((h) => h.status === 'WAITING').length, myHold: b.holds.find((h) => h.userId === user.id)?.status ?? null,
    })),
  };
}

/** GET /api/library/books/:id: a book; librarians also get every copy and who has it. */
export async function bookDetail(user: SessionUser, id: string) {
  member(user);
  const b = await prisma.libraryBook.findUnique({
    where: { id },
    select: {
      id: true, isbn: true, title: true, authors: true, publisher: true, year: true, subjects: true, coverUrl: true, shelf: true,
      copies: { orderBy: { barcode: 'asc' }, select: { id: true, barcode: true, status: true, heldUntil: true, note: true, heldForId: true, loans: { where: { returnedAt: null }, take: 1, select: { dueAt: true, borrower: { select: { id: true, name: true } } } } } },
      holds: { where: { status: { in: ['WAITING', 'READY'] } }, orderBy: { createdAt: 'asc' }, select: { id: true, status: true, userId: true, readyUntil: true, user: { select: { name: true } } } },
    },
  });
  if (!b) throw new NotFoundException('That book isn’t in the library.');
  const librarian = await canRun(user);
  const myLoan = b.copies.find((c) => c.loans[0]?.borrower.id === user.id);
  const nextDue = b.copies.map((c) => c.loans[0]?.dueAt).filter((d): d is Date => !!d).sort((x, y) => x.getTime() - y.getTime())[0] ?? null;
  return {
    ...b, librarian,
    available: b.copies.filter((c) => c.status === 'AVAILABLE').length, copyCount: b.copies.length, nextDue,
    myHold: b.holds.find((h) => h.userId === user.id) ?? null, myLoan: myLoan ? { dueAt: myLoan.loans[0].dueAt } : null,
    queue: b.holds.filter((h) => h.status === 'WAITING').length,
    copies: librarian ? b.copies.map((c) => ({ id: c.id, barcode: c.barcode, status: c.status, note: c.note, heldUntil: c.heldUntil, loan: c.loans[0] ? { dueAt: c.loans[0].dueAt, borrower: c.loans[0].borrower } : null })) : [],
    holds: librarian ? b.holds.map((h) => ({ id: h.id, status: h.status, name: h.user.name, readyUntil: h.readyUntil })) : [],
  };
}

const canRun = (user: SessionUser) => can(user, 'library.manage');

// ── My library (students and teachers) ──────────────────────────────────────────────────────

/** GET /api/library/me: my loans (out now and the last 20 returned), holds and fines owed. */
export async function myLibrary(user: SessionUser) {
  member(user);
  await expireHolds();
  const [s, loans, holds] = await Promise.all([
    librarySettings(),
    prisma.libraryLoan.findMany({ where: { borrowerId: user.id }, orderBy: { issuedAt: 'desc' }, take: 40, select: { id: true, issuedAt: true, dueAt: true, returnedAt: true, renewals: true, fine: true, fineStatus: true, copy: { select: { bookId: true, book: { select: { id: true, title: true, authors: true, coverUrl: true } } } } } }),
    prisma.libraryHold.findMany({ where: { userId: user.id, status: { in: ['WAITING', 'READY'] } }, orderBy: { createdAt: 'asc' }, select: { id: true, status: true, readyUntil: true, createdAt: true, bookId: true, book: { select: { title: true, authors: true, coverUrl: true } } } }),
  ]);
  const waiting = await prisma.libraryHold.groupBy({ by: ['bookId'], where: { status: 'WAITING', bookId: { in: [...new Set(loans.filter((l) => !l.returnedAt).map((l) => l.copy.bookId))] } }, _count: { _all: true } });
  const out = loans.filter((l) => !l.returnedAt);
  const owed = loans.filter((l) => l.fineStatus === 'OWED').reduce((a, l) => a + l.fine, 0);
  return {
    rules: { loanDays: s.loanDays, maxRenewals: s.maxRenewals, maxLoans: s.maxLoans, finePerDay: s.finePerDay, currency: s.currency },
    out: out.map((l) => ({ id: l.id, book: l.copy.book, issuedAt: l.issuedAt, dueAt: l.dueAt, renewals: l.renewals, canRenew: l.renewals < s.maxRenewals && !waiting.some((w) => w.bookId === l.copy.bookId) })),
    returned: loans.filter((l) => l.returnedAt).slice(0, 20).map((l) => ({ id: l.id, book: l.copy.book, returnedAt: l.returnedAt, fine: l.fine, fineStatus: l.fineStatus })),
    holds: holds.map((h) => ({ id: h.id, status: h.status, readyUntil: h.readyUntil, createdAt: h.createdAt, book: { id: h.bookId, ...h.book } })),
    owed, currency: s.currency,
  };
}

/** POST /api/library/me { action: 'hold', bookId } | { action: 'cancel-hold', holdId } | { action: 'renew', loanId } */
export async function myLibraryAction(user: SessionUser, b: Record<string, unknown>) {
  member(user);
  if (b.action === 'hold') {
    const bookId = typeof b.bookId === 'string' ? b.bookId : '';
    const book = await prisma.libraryBook.findUnique({ where: { id: bookId }, select: { title: true, copies: { select: { status: true, loans: { where: { returnedAt: null, borrowerId: user.id }, select: { id: true } } } } } });
    if (!book) throw new NotFoundException('That book isn’t in the library.');
    if (!book.copies.length) throw new BadRequestException('The library has no copies of this book.');
    if (book.copies.some((c) => c.loans.length)) throw new BadRequestException('You have this book already.');
    if (book.copies.some((c) => c.status === 'AVAILABLE')) throw new BadRequestException('A copy is on the shelf: ask for it at the library.');
    const mine = await prisma.libraryHold.findMany({ where: { userId: user.id, status: { in: ['WAITING', 'READY'] } }, select: { bookId: true } });
    if (mine.some((h) => h.bookId === bookId)) throw new ConflictException('You’re already waiting for this book.');
    if (mine.length >= MAX_HOLDS) throw new BadRequestException(`Up to ${MAX_HOLDS} books reserved at a time.`);
    await prisma.libraryHold.create({ data: { bookId, userId: user.id } });
    const place = await prisma.libraryHold.count({ where: { bookId, status: 'WAITING' } });
    return { held: true, place };
  }
  if (b.action === 'cancel-hold') {
    const h = await prisma.libraryHold.findUnique({ where: { id: typeof b.holdId === 'string' ? b.holdId : '' }, select: { id: true, userId: true, status: true, copyId: true, bookId: true } });
    if (!h || h.userId !== user.id || !['WAITING', 'READY'].includes(h.status)) throw new NotFoundException('That reservation doesn’t exist.');
    await prisma.libraryHold.update({ where: { id: h.id }, data: { status: 'CANCELLED' } });
    if (h.status === 'READY' && h.copyId) await passOn(h.copyId, h.bookId);
    return { cancelled: true };
  }
  if (b.action === 'renew') return renew(user, typeof b.loanId === 'string' ? b.loanId : '', false);
  throw new BadRequestException('Unknown action.');
}

async function renew(user: SessionUser, loanId: string, byLibrarian: boolean) {
  const s = await librarySettings();
  const loan = await prisma.libraryLoan.findUnique({ where: { id: loanId }, select: { id: true, borrowerId: true, dueAt: true, returnedAt: true, renewals: true, copy: { select: { bookId: true } } } });
  if (!loan || (!byLibrarian && loan.borrowerId !== user.id) || loan.returnedAt) throw new NotFoundException('That loan doesn’t exist.');
  if (!byLibrarian && loan.renewals >= s.maxRenewals) throw new BadRequestException(`Books can be renewed ${s.maxRenewals} times. Bring it to the library.`);
  if (!byLibrarian && (await prisma.libraryHold.count({ where: { bookId: loan.copy.bookId, status: 'WAITING' } }))) throw new BadRequestException('Someone is waiting for this book, so it can’t be renewed.');
  const from = Math.max(Date.now(), loan.dueAt.getTime());
  const dueAt = new Date(from + s.loanDays * DAY);
  await prisma.libraryLoan.update({ where: { id: loan.id }, data: { dueAt, renewals: { increment: 1 }, remindedAt: null } });
  return { dueAt };
}

// ── The desk (librarians) ───────────────────────────────────────────────────────────────────

/** GET /api/library/desk: counts, the rules, and loans out now that are late. */
export async function libraryDesk(user: SessionUser) {
  await need(user, 'library.manage');
  await expireHolds();
  const now = new Date();
  const [s, books, copies, out, overdue, holds, fines] = await Promise.all([
    librarySettings(),
    prisma.libraryBook.count(),
    prisma.libraryCopy.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.libraryLoan.count({ where: { returnedAt: null } }),
    prisma.libraryLoan.findMany({ where: { returnedAt: null, dueAt: { lt: now } }, orderBy: { dueAt: 'asc' }, take: 200, select: { id: true, dueAt: true, remindedAt: true, borrower: { select: { id: true, name: true, email: true } }, copy: { select: { barcode: true, book: { select: { title: true } } } } } }),
    prisma.libraryHold.groupBy({ by: ['status'], where: { status: { in: ['WAITING', 'READY'] } }, _count: { _all: true } }),
    prisma.libraryLoan.findMany({ where: { fineStatus: 'OWED' }, orderBy: { returnedAt: 'desc' }, take: 200, select: { id: true, fine: true, returnedAt: true, borrower: { select: { name: true } }, copy: { select: { book: { select: { title: true } } } } } }),
  ]);
  const count = (st: string) => copies.find((c) => c.status === st)?._count._all ?? 0;
  return {
    settings: s,
    counts: { books, copies: copies.reduce((a, c) => a + c._count._all, 0), available: count('AVAILABLE'), out, overdue: overdue.length, held: count('HELD'), waiting: holds.find((h) => h.status === 'WAITING')?._count._all ?? 0 },
    overdue: overdue.map((l) => ({ id: l.id, dueAt: l.dueAt, remindedAt: l.remindedAt, borrower: l.borrower, barcode: l.copy.barcode, title: l.copy.book.title })),
    fines: fines.map((f) => ({ id: f.id, fine: f.fine, returnedAt: f.returnedAt, name: f.borrower.name, title: f.copy.book.title })),
  };
}

/** GET /api/library/desk/copy?barcode=: what a scanned copy is and where it stands (for the desk). */
export async function scanCopy(user: SessionUser, barcode: string | null) {
  await need(user, 'library.manage');
  const code = (barcode ?? '').trim().slice(0, 60);
  if (!code) throw new BadRequestException('Scan or type a barcode.');
  const c = await prisma.libraryCopy.findUnique({
    where: { barcode: code },
    select: { id: true, barcode: true, status: true, heldUntil: true, heldForId: true, book: { select: { id: true, title: true, authors: true, coverUrl: true } }, loans: { where: { returnedAt: null }, take: 1, select: { id: true, dueAt: true, borrower: { select: { id: true, name: true } } } } },
  });
  if (!c) throw new NotFoundException(`No copy has the barcode ${code}.`);
  const heldFor = c.heldForId ? await prisma.user.findUnique({ where: { id: c.heldForId }, select: { id: true, name: true } }) : null;
  return { id: c.id, barcode: c.barcode, status: c.status, book: c.book, loan: c.loans[0] ?? null, heldFor, heldUntil: c.heldUntil };
}

/** GET /api/library/desk/people?q=: students and staff to lend to, with how many books they have and anything late. */
export async function findBorrowers(user: SessionUser, q: string) {
  await need(user, 'library.manage');
  const text = q.trim().slice(0, 60);
  if (text.length < 2) return { people: [] };
  const people = await prisma.user.findMany({ where: { role: { in: ['STUDENT', 'TEACHER'] }, status: { not: 'SUSPENDED' }, OR: [{ name: { contains: text } }, { email: { contains: text.toLowerCase() } }] }, orderBy: { name: 'asc' }, take: 10, select: { id: true, name: true, email: true, avatar: true, role: true } });
  const loans = people.length ? await prisma.libraryLoan.findMany({ where: { borrowerId: { in: people.map((p) => p.id) }, OR: [{ returnedAt: null }, { fineStatus: 'OWED' }] }, select: { borrowerId: true, returnedAt: true, dueAt: true, fine: true, fineStatus: true } }) : [];
  const now = Date.now();
  return {
    people: people.map((p) => {
      const mine = loans.filter((l) => l.borrowerId === p.id);
      return { ...p, out: mine.filter((l) => !l.returnedAt).length, late: mine.filter((l) => !l.returnedAt && l.dueAt.getTime() < now).length, owed: mine.filter((l) => l.fineStatus === 'OWED').reduce((a, l) => a + l.fine, 0) };
    }),
  };
}

/**
 * POST /api/library/desk. Actions: 'issue' { barcode, borrowerId, days? }, 'return' { barcode },
 * 'renew' { loanId }, 'fine' { loanId, to: 'PAID' | 'WAIVED' }, 'remind' (late loans, each at most
 * every 3 days), 'settings' { loanDays, maxRenewals, maxLoans, finePerDay, fineCap, currency, holdDays }.
 */
export async function deskAction(user: SessionUser, b: Record<string, unknown>) {
  await need(user, 'library.manage');
  switch (b.action) {
    case 'issue': {
      const s = await librarySettings();
      const copy = await prisma.libraryCopy.findUnique({ where: { barcode: String(b.barcode ?? '').trim() }, select: { id: true, status: true, heldForId: true, bookId: true, book: { select: { title: true } } } });
      if (!copy) throw new NotFoundException('No copy has that barcode.');
      const borrower = await prisma.user.findUnique({ where: { id: String(b.borrowerId ?? '') }, select: { id: true, name: true, role: true, status: true } });
      if (!borrower || !BORROWERS.includes(borrower.role) || borrower.status === 'SUSPENDED') throw new BadRequestException('Choose a student or staff member.');
      if (copy.status === 'ON_LOAN') throw new ConflictException('This copy is out. Return it first.');
      if (copy.status === 'HELD' && copy.heldForId !== borrower.id) throw new ConflictException('This copy is kept for someone who reserved it.');
      if (copy.status === 'LOST' || copy.status === 'REPAIR') throw new ConflictException(`This copy is marked ${copy.status === 'LOST' ? 'lost' : 'in repair'}.`);
      const active = await prisma.libraryLoan.findMany({ where: { borrowerId: borrower.id, returnedAt: null }, select: { dueAt: true } });
      if (active.length >= s.maxLoans) throw new BadRequestException(`${borrower.name} has ${active.length} books already (the limit is ${s.maxLoans}).`);
      if (active.some((l) => l.dueAt.getTime() < Date.now())) throw new BadRequestException(`${borrower.name} has a late book. Return it first.`);
      const days = Number.isInteger(Number(b.days)) && Number(b.days) >= 1 && Number(b.days) <= 120 ? Number(b.days) : s.loanDays;
      const dueAt = new Date(Date.now() + days * DAY);
      const loan = await prisma.libraryLoan.create({ data: { copyId: copy.id, borrowerId: borrower.id, issuedById: user.id, dueAt }, select: { id: true } });
      await prisma.libraryCopy.update({ where: { id: copy.id }, data: { status: 'ON_LOAN', heldForId: null, heldUntil: null } });
      if (copy.status === 'HELD') await prisma.libraryHold.updateMany({ where: { copyId: copy.id, userId: borrower.id, status: 'READY' }, data: { status: 'FULFILLED' } });
      await notify(borrower.id, { type: 'library', title: `Borrowed: ${copy.book.title}`, body: `Please bring it back by ${dueAt.toISOString().slice(0, 10)}.`, link: '/library', email: false });
      return { loanId: loan.id, title: copy.book.title, borrower: borrower.name, dueAt };
    }
    case 'return': {
      const s = await librarySettings();
      const copy = await prisma.libraryCopy.findUnique({ where: { barcode: String(b.barcode ?? '').trim() }, select: { id: true, bookId: true, book: { select: { title: true } }, loans: { where: { returnedAt: null }, take: 1, select: { id: true, dueAt: true, borrowerId: true, borrower: { select: { name: true } } } } } });
      if (!copy) throw new NotFoundException('No copy has that barcode.');
      const loan = copy.loans[0];
      if (!loan) throw new BadRequestException('This copy isn’t out.');
      const now = new Date();
      const fine = fineFor(loan.dueAt, now, s.finePerDay, s.fineCap);
      await prisma.libraryLoan.update({ where: { id: loan.id }, data: { returnedAt: now, fine, fineStatus: fine > 0 ? 'OWED' : null } });
      const heldFor = await passOn(copy.id, copy.bookId);
      return { title: copy.book.title, borrower: loan.borrower.name, fine, currency: s.currency, heldFor };
    }
    case 'renew': return renew(user, String(b.loanId ?? ''), true);
    case 'fine': {
      const to = b.to === 'PAID' || b.to === 'WAIVED' ? b.to : null;
      if (!to) throw new BadRequestException('Paid or waived?');
      const res = await prisma.libraryLoan.updateMany({ where: { id: String(b.loanId ?? ''), fineStatus: 'OWED' }, data: { fineStatus: to } });
      if (!res.count) throw new NotFoundException('There’s no fine owed on that loan.');
      return { fineStatus: to };
    }
    case 'remind': {
      const late = await prisma.libraryLoan.findMany({
        where: { returnedAt: null, dueAt: { lt: new Date() }, OR: [{ remindedAt: null }, { remindedAt: { lt: new Date(Date.now() - REMIND_EVERY_MS) } }] },
        take: 80, select: { id: true, borrowerId: true, dueAt: true, copy: { select: { book: { select: { title: true } } } } },
      });
      if (!late.length) return { reminded: 0 };
      // One notice per person, listing their late books.
      const byPerson = new Map<string, string[]>();
      for (const l of late) byPerson.set(l.borrowerId, [...(byPerson.get(l.borrowerId) ?? []), l.copy.book.title]);
      for (const [id, titles] of byPerson) await notify(id, { type: 'library', title: titles.length === 1 ? `Please return: ${titles[0]}` : `Please return ${titles.length} library books`, body: `${titles.slice(0, 3).join(', ')}${titles.length > 3 ? '…' : ''} ${titles.length === 1 ? 'is' : 'are'} past the due date.`, link: '/library', email: false });
      await prisma.libraryLoan.updateMany({ where: { id: { in: late.map((l) => l.id) } }, data: { remindedAt: new Date() } });
      return { reminded: byPerson.size, loans: late.length };
    }
    case 'settings': {
      const int = (v: unknown, min: number, max: number, fallback: number) => (Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : fallback);
      const cur = await librarySettings();
      const minor = (v: unknown) => { const n = Math.round(Number(v) * 100); return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? n : null; };
      const data = {
        loanDays: int(b.loanDays, 1, 120, cur.loanDays), maxRenewals: int(b.maxRenewals, 0, 10, cur.maxRenewals), maxLoans: int(b.maxLoans, 1, 50, cur.maxLoans),
        holdDays: int(b.holdDays, 1, 14, cur.holdDays), finePerDay: minor(b.finePerDay) ?? cur.finePerDay, fineCap: minor(b.fineCap) ?? cur.fineCap,
        currency: typeof b.currency === 'string' && /^[A-Z]{3}$/.test(b.currency) ? b.currency : cur.currency, updatedAt: new Date(),
      };
      await prisma.librarySettings.upsert({ where: { id: 'default' }, update: data, create: { id: 'default', ...data } });
      return { saved: true };
    }
    default: throw new BadRequestException('Unknown action.');
  }
}

// ── Books and copies (librarians) ───────────────────────────────────────────────────────────

/** GET /api/library/isbn?isbn=: Open Library's details for an ISBN, and whether it's in the library already. */
export async function isbnInfo(user: SessionUser, raw: string | null) {
  await need(user, 'library.manage');
  const isbn = cleanIsbn(raw);
  if (!isbn) throw new BadRequestException('That isn’t a valid ISBN.');
  const [found, existing] = await Promise.all([lookupIsbn(isbn), prisma.libraryBook.findFirst({ where: { isbn }, select: { id: true, title: true } })]);
  return { isbn, found, existing };
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) || null : null);

/** A barcode for a new copy when the librarian doesn't scan one: L + 7 digits, unused. */
async function newBarcode() {
  for (let i = 0; i < 10; i++) {
    const code = `L${Math.floor(1_000_000 + Math.random() * 9_000_000)}`;
    if (!(await prisma.libraryCopy.findUnique({ where: { barcode: code }, select: { id: true } }))) return code;
  }
  throw new ConflictException('Couldn’t make a barcode. Try again.');
}

/** POST /api/library/books { isbn?, title, authors?, publisher?, year?, subjects?, coverUrl?, shelf?, copies?: n, barcodes?: string[] } */
export async function addBook(user: SessionUser, b: Record<string, unknown>) {
  await need(user, 'library.manage');
  const title = text(b.title, 300);
  if (!title) throw new BadRequestException('Give the book a title.');
  const isbn = b.isbn ? cleanIsbn(b.isbn) : null;
  if (b.isbn && !isbn) throw new BadRequestException('That ISBN isn’t valid.');
  const year = b.year ? Number(b.year) : null;
  const coverUrl = typeof b.coverUrl === 'string' && b.coverUrl.startsWith('https://covers.openlibrary.org/') ? b.coverUrl.slice(0, 300) : null;
  const scanned = Array.isArray(b.barcodes) ? [...new Set(b.barcodes.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean))].slice(0, 50) : [];
  const count = Math.min(50, Math.max(scanned.length, Number.isInteger(Number(b.copies)) ? Number(b.copies) : 1));
  if (scanned.length) {
    const taken = await prisma.libraryCopy.findMany({ where: { barcode: { in: scanned } }, select: { barcode: true } });
    if (taken.length) throw new ConflictException(`These barcodes are used already: ${taken.map((t) => t.barcode).join(', ')}.`);
  }
  const book = await prisma.libraryBook.create({
    data: { isbn, title, authors: text(b.authors, 300), publisher: text(b.publisher, 150), year: year && year > 1400 && year < 2200 ? Math.round(year) : null, subjects: text(b.subjects, 300), coverUrl, shelf: text(b.shelf, 60) },
    select: { id: true, title: true },
  });
  const codes = [...scanned];
  while (codes.length < count) codes.push(await newBarcode());
  await prisma.libraryCopy.createMany({ data: codes.map((barcode) => ({ bookId: book.id, barcode })) });
  return { id: book.id, title: book.title, barcodes: codes };
}

/** POST /api/library/books/:id { action: 'save', …fields } | { action: 'copies', copies?, barcodes? } | { action: 'copy', copyId, status: 'AVAILABLE' | 'LOST' | 'REPAIR', note? } | { action: 'remove-copy', copyId } | { action: 'delete' } */
export async function bookAction(user: SessionUser, id: string, b: Record<string, unknown>) {
  await need(user, 'library.manage');
  const book = await prisma.libraryBook.findUnique({ where: { id }, select: { id: true, title: true, copies: { select: { id: true, status: true } } } });
  if (!book) throw new NotFoundException('That book isn’t in the library.');
  switch (b.action) {
    case 'save': {
      const title = text(b.title, 300);
      if (!title) throw new BadRequestException('Give the book a title.');
      const year = b.year ? Number(b.year) : null;
      await prisma.libraryBook.update({ where: { id }, data: { title, authors: text(b.authors, 300), publisher: text(b.publisher, 150), year: year && year > 1400 && year < 2200 ? Math.round(year) : null, subjects: text(b.subjects, 300), shelf: text(b.shelf, 60), updatedAt: new Date() } });
      return { saved: true };
    }
    case 'copies': {
      const scanned = Array.isArray(b.barcodes) ? [...new Set(b.barcodes.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean))].slice(0, 50) : [];
      const count = Math.min(50, Math.max(scanned.length, Number.isInteger(Number(b.copies)) ? Number(b.copies) : 1));
      if (scanned.length && (await prisma.libraryCopy.count({ where: { barcode: { in: scanned } } }))) throw new ConflictException('One of those barcodes is used already.');
      const codes = [...scanned];
      while (codes.length < count) codes.push(await newBarcode());
      await prisma.libraryCopy.createMany({ data: codes.map((barcode) => ({ bookId: id, barcode })) });
      // People waiting get the new copies first.
      const fresh = await prisma.libraryCopy.findMany({ where: { barcode: { in: codes } }, select: { id: true } });
      for (const c of fresh) await passOn(c.id, id);
      return { barcodes: codes };
    }
    case 'copy': {
      const copy = book.copies.find((c) => c.id === b.copyId);
      if (!copy) throw new NotFoundException('That copy isn’t this book’s.');
      if (copy.status === 'ON_LOAN' && b.status !== 'LOST') throw new BadRequestException('This copy is out. Return it first.');
      const status = b.status === 'LOST' || b.status === 'REPAIR' ? b.status : 'AVAILABLE';
      if (copy.status === 'ON_LOAN' && status === 'LOST') await prisma.libraryLoan.updateMany({ where: { copyId: copy.id, returnedAt: null }, data: { returnedAt: new Date() } });
      await prisma.libraryCopy.update({ where: { id: copy.id }, data: { status, note: text(b.note, 200), heldForId: null, heldUntil: null } });
      if (status === 'AVAILABLE') await passOn(copy.id, id);
      return { status };
    }
    case 'remove-copy': {
      const copy = book.copies.find((c) => c.id === b.copyId);
      if (!copy) throw new NotFoundException('That copy isn’t this book’s.');
      if (copy.status === 'ON_LOAN') throw new BadRequestException('This copy is out. Return it first.');
      await prisma.libraryCopy.delete({ where: { id: copy.id } });
      return { removed: true };
    }
    case 'delete': {
      if (book.copies.some((c) => c.status === 'ON_LOAN')) throw new BadRequestException('Some copies are out. Return them first.');
      const waiting = await prisma.libraryHold.findMany({ where: { bookId: id, status: { in: ['WAITING', 'READY'] } }, select: { userId: true } });
      await prisma.libraryBook.delete({ where: { id } });
      if (waiting.length) await notifyMany(waiting.map((w) => w.userId), { type: 'library', title: `Reservation cancelled: ${book.title}`, body: 'The library no longer has this book.', link: '/library', email: false });
      return { deleted: true };
    }
    default: throw new BadRequestException('Unknown action.');
  }
}

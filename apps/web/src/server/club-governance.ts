import { createHash, randomBytes } from 'node:crypto';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { isAppFileUrl } from '@/lib/storage';
import { ballotListText, budgetSummary, cleanCandidates, electionState, tally, type Candidate } from '@/lib/student-life';
import type { Body } from './body';
import { notifyMany } from './email';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from './http';

// Clubs (Stage 5 · Q17): elections and the budget.
// Elections are anonymous: who voted (club_voters) and what was voted (club_ballots) are stored
// apart with nothing linking them, and neither table keeps the order rows arrived in (see migration
// 0160). Each voter gets a receipt; when the election closes every ballot is published as
// "receipt:choice" with the list's SHA-256 fingerprint, so voters can find theirs and anyone can recount.

async function access(user: SessionUser, clubId: string) {
  const club = await prisma.association.findUnique({ where: { id: clubId }, select: { id: true, name: true, budget: true } });
  if (!club) throw new NotFoundException('Club not found.');
  const m = await prisma.associationMembership.findFirst({ where: { associationId: clubId, userId: user.id }, select: { role: true } });
  if (!m && user.role !== 'ADMIN') throw new ForbiddenException('Only the club’s members can see this.');
  return { club, member: !!m, runs: m?.role === 'FOUNDER' || user.role === 'ADMIN' };
}

const candidatesOf = (raw: string): Candidate[] => { try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; } };
const RECEIPT = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** A receipt like "K7QM-2XPA-9DTE": random, so it says nothing about who or when. */
const newReceipt = () => [...randomBytes(12)].map((b) => RECEIPT[b % RECEIPT.length]).join('').replace(/(.{4})(?=.)/g, '$1-');

// ── Elections ──────────────────────────────────────────────────────────

/** GET /api/campus/clubs/[id]/elections: the club's elections; results once closed. */
export async function clubElections(user: SessionUser, clubId: string) {
  const { club, member, runs } = await access(user, clubId);
  const rows = await prisma.clubElection.findMany({ where: { associationId: clubId }, orderBy: { closesAt: 'desc' }, take: 30 });
  const voted = rows.length ? await prisma.clubVoter.findMany({ where: { userId: user.id, electionId: { in: rows.map((r) => r.id) } }, select: { electionId: true } }) : [];
  const turnout = rows.length ? await prisma.clubVoter.groupBy({ by: ['electionId'], where: { electionId: { in: rows.map((r) => r.id) } }, _count: { _all: true } }) : [];
  const members = await prisma.associationMembership.count({ where: { associationId: clubId } });
  const elections = await Promise.all(rows.map(async (e) => {
    const state = electionState(e);
    const candidates = candidatesOf(e.candidates);
    let results = null;
    if (state === 'CLOSED') {
      const ballots = await prisma.clubBallot.findMany({ where: { electionId: e.id }, select: { receipt: true, choice: true } });
      const list = ballotListText(ballots);
      results = { ...tally(candidates, ballots), ballots: ballots.sort((a, b) => a.receipt.localeCompare(b.receipt)), fingerprint: createHash('sha256').update(list).digest('hex') };
    }
    return {
      id: e.id, title: e.title, candidates, opensAt: e.opensAt, closesAt: e.closesAt, state,
      voted: voted.some((v) => v.electionId === e.id), turnout: turnout.find((t) => t.electionId === e.id)?._count._all ?? 0, results,
    };
  }));
  return { club: { id: club.id, name: club.name }, member, runs, members, elections };
}

/** POST /api/campus/clubs/[id]/elections { title, candidates: string[], opensAt?, closesAt } (the founder or an admin). */
export async function createElection(user: SessionUser, clubId: string, b: Body) {
  const { club, runs } = await access(user, clubId);
  if (!runs) throw new ForbiddenException('Only the club’s founder or an admin can call an election.');
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, 100) : '';
  if (title.length < 3) throw new BadRequestException('Say what the election is for, e.g. “President 2026”.');
  const candidates = cleanCandidates(b.candidates);
  if (!candidates) throw new BadRequestException('Add 2 to 10 different candidates.');
  const opensAt = b.opensAt ? new Date(String(b.opensAt)) : new Date();
  const closesAt = new Date(String(b.closesAt ?? ''));
  if (Number.isNaN(opensAt.getTime()) || Number.isNaN(closesAt.getTime())) throw new BadRequestException('Pick when voting opens and closes.');
  if (closesAt.getTime() < Math.max(opensAt.getTime(), Date.now()) + 3_600_000) throw new BadRequestException('Keep voting open for at least an hour.');
  if (closesAt.getTime() > Date.now() + 31 * 86_400_000) throw new BadRequestException('Close it within a month.');
  await prisma.clubElection.create({ data: { associationId: clubId, title, candidates: JSON.stringify(candidates), opensAt, closesAt, createdById: user.id } });
  const members = await prisma.associationMembership.findMany({ where: { associationId: clubId, userId: { not: user.id } }, select: { userId: true }, take: 500 });
  if (members.length) await notifyMany(members.map((m) => m.userId), { type: 'event', title: `${club.name}: vote in “${title}”`, body: `Voting closes ${closesAt.toISOString().slice(0, 16).replace('T', ' ')} UTC. Your vote is secret.`, link: `/student/life/associations/club?club=${clubId}`, email: false });
  return clubElections(user, clubId);
}

/** POST /api/campus/elections/[id]/vote { choice }: one secret vote per member; returns the receipt. */
export async function castVote(user: SessionUser, electionId: string, choice: unknown) {
  const e = await prisma.clubElection.findUnique({ where: { id: electionId } });
  if (!e) throw new NotFoundException('Election not found.');
  const member = await prisma.associationMembership.findFirst({ where: { associationId: e.associationId, userId: user.id }, select: { id: true } });
  if (!member) throw new ForbiddenException('Only the club’s members can vote.');
  if (electionState(e) !== 'OPEN') throw new BadRequestException('Voting isn’t open.');
  if (typeof choice !== 'string' || !candidatesOf(e.candidates).some((c) => c.id === choice)) throw new BadRequestException('Pick a candidate.');
  // Who voted first (one row per person: a second vote is refused), then what, with no link between them.
  try {
    await prisma.clubVoter.create({ data: { electionId, userId: user.id } });
  } catch (err) {
    if (/unique|constraint/i.test(String((err as Error).message))) throw new ConflictException('You’ve already voted.');
    throw err;
  }
  const receipt = newReceipt();
  try {
    await prisma.clubBallot.create({ data: { receipt, electionId, choice } });
  } catch (err) {
    await prisma.clubVoter.delete({ where: { electionId_userId: { electionId, userId: user.id } } }).catch(() => {});
    throw err;
  }
  return { receipt };
}

/** DELETE /api/campus/elections/[id]: the founder or an admin, before anyone has voted. */
export async function deleteElection(user: SessionUser, electionId: string) {
  const e = await prisma.clubElection.findUnique({ where: { id: electionId }, select: { associationId: true } });
  if (!e) throw new NotFoundException('Election not found.');
  const { runs } = await access(user, e.associationId);
  if (!runs) throw new ForbiddenException('Only the club’s founder or an admin can remove an election.');
  if (await prisma.clubVoter.count({ where: { electionId } })) throw new BadRequestException('People have voted: it can’t be removed.');
  await prisma.clubElection.delete({ where: { id: electionId } });
  return clubElections(user, e.associationId);
}

// ── Budget ─────────────────────────────────────────────────────────────

/** GET /api/campus/clubs/[id]/budget: the budget, what came in and went out. */
export async function clubBudget(user: SessionUser, clubId: string) {
  const { club, runs } = await access(user, clubId);
  const entries = await prisma.clubBudgetEntry.findMany({ where: { associationId: clubId }, orderBy: { occurredAt: 'desc' }, take: 300 });
  const by = entries.length ? await prisma.user.findMany({ where: { id: { in: [...new Set(entries.map((e) => e.createdById).filter((x): x is string => !!x))] } }, select: { id: true, name: true } }) : [];
  return {
    club: { id: club.id, name: club.name }, runs, canSetBudget: user.role === 'ADMIN',
    summary: budgetSummary(Math.round((club.budget ?? 0) * 100), entries),
    entries: entries.map((e) => ({ id: e.id, kind: e.kind, amount: e.amount, description: e.description, occurredAt: e.occurredAt, receiptUrl: e.receiptUrl, by: by.find((u) => u.id === e.createdById)?.name ?? null })),
  };
}

/** POST /api/campus/clubs/[id]/budget { kind, amount, description, occurredAt?, receiptUrl? } (the founder or an admin). */
export async function addBudgetEntry(user: SessionUser, clubId: string, b: Body) {
  const { runs } = await access(user, clubId);
  if (!runs) throw new ForbiddenException('Only the club’s founder or an admin can record money.');
  const kind = b.kind === 'INCOME' ? 'INCOME' : b.kind === 'EXPENSE' ? 'EXPENSE' : null;
  if (!kind) throw new BadRequestException('Money in or out?');
  const amount = Math.round(Number(String(b.amount ?? '').replace(/[,\s]/g, '')) * 100);
  if (!(amount > 0 && amount <= 1_000_000_000)) throw new BadRequestException('Enter an amount above 0.');
  const description = typeof b.description === 'string' ? b.description.trim().slice(0, 140) : '';
  if (!description) throw new BadRequestException('Say what it was for.');
  const at = b.occurredAt ? new Date(String(b.occurredAt)) : new Date();
  if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 86_400_000 || at.getTime() < Date.now() - 400 * 86_400_000) throw new BadRequestException('Pick a date within the last year.');
  const receiptUrl = typeof b.receiptUrl === 'string' && b.receiptUrl ? (isAppFileUrl(b.receiptUrl) || /^https:\/\/\S+$/.test(b.receiptUrl) ? b.receiptUrl.slice(0, 500) : null) : null;
  if (b.receiptUrl && !receiptUrl) throw new BadRequestException('The receipt must be an uploaded file or an https link.');
  await prisma.clubBudgetEntry.create({ data: { associationId: clubId, kind, amount, description, occurredAt: at, receiptUrl, createdById: user.id } });
  return clubBudget(user, clubId);
}

/** PATCH /api/campus/clubs/[id]/budget { budget } (admins): the club's budget for the year, whole units. */
export async function setClubBudget(user: SessionUser, clubId: string, b: Body) {
  if (user.role !== 'ADMIN') throw new ForbiddenException('Only admins set a club’s budget.');
  const v = Number(String(b.budget ?? '').replace(/[,\s]/g, ''));
  if (!(v >= 0 && v <= 10_000_000)) throw new BadRequestException('Enter a budget of 0 or more.');
  await prisma.association.update({ where: { id: clubId }, data: { budget: Math.round(v * 100) / 100 } });
  return clubBudget(user, clubId);
}

/** DELETE /api/campus/clubs/[id]/budget?entry= (the founder or an admin). */
export async function deleteBudgetEntry(user: SessionUser, clubId: string, entryId: string) {
  const { runs } = await access(user, clubId);
  if (!runs) throw new ForbiddenException('Only the club’s founder or an admin can change the budget.');
  await prisma.clubBudgetEntry.deleteMany({ where: { id: entryId, associationId: clubId } });
  return clubBudget(user, clubId);
}

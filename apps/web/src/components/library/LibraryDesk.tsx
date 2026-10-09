'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { BellRing, BookPlus, BookUp, Check, Loader2, Plus, Search, Trash2, Undo2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Sheet } from '@/components/ui/Sheet';
import { Field, SearchField } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LoadError } from '@/components/ui/LoadError';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fadeUp, list } from '@/lib/motion';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { money, major } from '@/components/fees/shared';
import { ScanField } from './ScanField';
import { Cover } from './LibraryHome';

// The library desk for librarians (Stage 5 · B15.4; src/server/library.ts): lend (scan the copy,
// find the borrower), take back (scan; any fine and whether it's kept for a reservation are
// shown), books (add by ISBN with copies, manage copies), late books and fines, and the rules.

type View = 'desk' | 'books' | 'late' | 'rules';
interface Settings { loanDays: number; maxRenewals: number; maxLoans: number; finePerDay: number; fineCap: number; currency: string; holdDays: number }
interface Desk {
  settings: Settings;
  counts: { books: number; copies: number; available: number; out: number; overdue: number; held: number; waiting: number };
  overdue: { id: string; dueAt: string; remindedAt: string | null; borrower: { id: string; name: string; email: string }; barcode: string; title: string }[];
  fines: { id: string; fine: number; returnedAt: string; name: string; title: string }[];
}
interface Scanned { id: string; barcode: string; status: string; book: { id: string; title: string; authors: string | null; coverUrl: string | null }; loan: { id: string; dueAt: string; borrower: { id: string; name: string } } | null; heldFor: { id: string; name: string } | null; heldUntil: string | null }
interface Person { id: string; name: string; email: string; avatar: string | null; role: string; out: number; late: number; owed: number }

const card = 'rounded-3xl tone-panel border border-zinc-200 dark:border-white/10';
const STATUS: Record<string, string> = { AVAILABLE: 'On the shelf', ON_LOAN: 'Out', HELD: 'Kept for a reservation', LOST: 'Lost', REPAIR: 'In repair' };

export function LibraryDesk() {
  const [view, setView] = useState<View>('desk');
  const desk = useSWR<Desk>('/api/library/desk', authedJson);
  if (desk.error && !desk.data) return <LoadError onRetry={() => desk.mutate()} />;
  if (!desk.data) return <ContentSkeleton variant="list" />;
  const c = desk.data.counts;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[['Books', c.books, `${c.copies} copies`], ['On the shelf', c.available, `${c.held} kept for reservations`], ['Out', c.out, `${c.waiting} waiting`], ['Late', c.overdue, 'past the due date']].map(([k, v, note], i) => (
          <div key={k as string} className={cn(card, 'p-3', i === 3 && Number(v) > 0 && 'border-rose-500/30 bg-rose-500/5')}>
            <p className="text-2xl font-black tabular-nums text-zinc-900 dark:text-white">{v as number}</p>
            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{k as string}</p>
            <p className="text-[11px] text-zinc-500">{note as string}</p>
          </div>
        ))}
      </div>
      <Segmented<View> label="Show" value={view} onChange={setView} className="w-full sm:w-auto" segments={[
        { value: 'desk', label: 'Desk' }, { value: 'books', label: 'Books' }, { value: 'late', label: `Late & fines${c.overdue || desk.data.fines.length ? ` (${c.overdue + desk.data.fines.length})` : ''}` }, { value: 'rules', label: 'Rules' },
      ]} />
      <motion.div key={view} variants={fadeUp} initial="hidden" animate="show">
        {view === 'desk' ? <DeskView settings={desk.data.settings} onChanged={() => void desk.mutate()} />
          : view === 'books' ? <BooksView onChanged={() => void desk.mutate()} />
          : view === 'late' ? <LateView desk={desk.data} onChanged={() => void desk.mutate()} />
          : <RulesView settings={desk.data.settings} onSaved={() => void desk.mutate()} />}
      </motion.div>
    </div>
  );
}

const post = <T,>(body: Record<string, unknown>) => authedJson<T>('/api/library/desk', { method: 'POST', body: JSON.stringify(body) });

function DeskView({ settings, onChanged }: { settings: Settings; onChanged: () => void }) {
  const [mode, setMode] = useState<'lend' | 'return'>('lend');
  return (
    <div className="space-y-3">
      <Segmented<'lend' | 'return'> label="At the desk" value={mode} onChange={setMode} large className="w-full" segments={[{ value: 'lend', label: <span className="inline-flex items-center gap-1.5"><BookUp className="w-4 h-4" aria-hidden />Lend</span> }, { value: 'return', label: <span className="inline-flex items-center gap-1.5"><Undo2 className="w-4 h-4" aria-hidden />Take back</span> }]} />
      {mode === 'lend' ? <Lend key="lend" settings={settings} onChanged={onChanged} /> : <TakeBack key="return" onChanged={onChanged} />}
    </div>
  );
}

function Lend({ settings, onChanged }: { settings: Settings; onChanged: () => void }) {
  const [code, setCode] = useState('');
  const [copy, setCopy] = useState<Scanned | null>(null);
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [who, setWho] = useState<Person | null>(null);
  const [days, setDays] = useState(settings.loanDays);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const people = useSWR<{ people: Person[] }>(!who && dq.length >= 2 ? `/api/library/desk/people?q=${encodeURIComponent(dq)}` : null, authedJson);
  const scan = async (c: string) => {
    try { setCopy(await authedJson<Scanned>(`/api/library/desk/copy?barcode=${encodeURIComponent(c)}`)); }
    catch (e) { setCopy(null); toast.error(errorMessage(e, 'Couldn’t find that copy.')); }
  };
  const lend = async () => {
    if (!copy || !who) return;
    setBusy(true);
    try {
      const r = await post<{ title: string; borrower: string; dueAt: string }>({ action: 'issue', barcode: copy.barcode, borrowerId: who.id, days });
      haptic('success');
      toast.success(`Lent to ${r.borrower}`, { description: `${r.title} · due ${format(new Date(r.dueAt), 'EEE d MMM')}` });
      setCode(''); setCopy(null); setWho(null); setQ('');
      onChanged();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t lend it.')); }
    finally { setBusy(false); }
  };
  const blocked = copy && (copy.status === 'ON_LOAN' || copy.status === 'LOST' || copy.status === 'REPAIR' || (copy.status === 'HELD' && who && copy.heldFor?.id !== who.id));
  return (
    <div className={`${card} p-4 space-y-4`}>
      <ScanField label="Copy barcode" value={code} onChange={setCode} onScan={(c) => void scan(c)} autoFocus />
      {copy && (
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="flex gap-3 rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] p-3">
          <Cover url={copy.book.coverUrl} title={copy.book.title} className="w-10 h-14 shrink-0" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-zinc-900 dark:text-white">{copy.book.title}</p>
            <p className={cn('text-xs', copy.status === 'AVAILABLE' ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300')}>
              {copy.loan ? `Out with ${copy.loan.borrower.name}, due ${format(new Date(copy.loan.dueAt), 'd MMM')}` : copy.status === 'HELD' ? `Kept for ${copy.heldFor?.name ?? 'a reservation'}${copy.heldUntil ? ` until ${format(new Date(copy.heldUntil), 'd MMM')}` : ''}` : STATUS[copy.status] ?? copy.status}
            </p>
          </div>
        </motion.div>
      )}
      {who ? (
        <div className="flex items-center gap-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-3">
          <Avatar name={who.name} src={who.avatar} size={36} />
          <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{who.name}</span><span className="block text-xs text-zinc-500">{who.out} out{who.late ? ` · ${who.late} late` : ''}{who.owed ? ` · owes ${money(who.owed, settings.currency)}` : ''}</span></span>
          <button type="button" onClick={() => setWho(null)} className="btn-ghost btn-sm">Change</button>
        </div>
      ) : (
        <div>
          <SearchField value={q} onChange={setQ} placeholder="Borrower: name or email" />
          {dq.length >= 2 && (
            <ul className="mt-2 divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
              {!people.data ? <li className="py-2 text-sm text-zinc-500">Searching…</li> : people.data.people.length === 0 ? <li className="py-2 text-sm text-zinc-500">Nobody matches.</li> : people.data.people.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setWho(p)} className="w-full flex items-center gap-3 py-2 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04] rounded-xl px-1">
                    <Avatar name={p.name} src={p.avatar} size={32} />
                    <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{p.name}</span><span className="block text-xs text-zinc-500 truncate">{p.role === 'TEACHER' ? 'Staff' : 'Student'} · {p.out} out{p.late ? ` · ${p.late} late` : ''}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex items-end gap-3">
        <Field label="For (days)" className="w-28">{(p) => <input {...p} type="number" min={1} max={120} value={days} onChange={(e) => setDays(Number(e.target.value) || settings.loanDays)} className="input" />}</Field>
        <button type="button" onClick={() => void lend()} disabled={busy || !copy || !who || !!blocked} className="btn-primary flex-1">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookUp className="w-4 h-4" />} Lend</button>
      </div>
      {blocked && <p className="text-xs text-rose-600 dark:text-rose-400">{copy?.status === 'HELD' ? 'This copy is kept for someone who reserved it.' : 'This copy can’t be lent now.'}</p>}
    </div>
  );
}

function TakeBack({ onChanged }: { onChanged: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ title: string; borrower: string; fine: number; currency: string; heldFor: string | null } | null>(null);
  const back = async (c: string) => {
    setBusy(true);
    try {
      const r = await post<{ title: string; borrower: string; fine: number; currency: string; heldFor: string | null }>({ action: 'return', barcode: c });
      haptic('success');
      setLast(r);
      setCode('');
      onChanged();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t take it back.')); }
    finally { setBusy(false); }
  };
  return (
    <div className={`${card} p-4 space-y-4`}>
      <ScanField label="Copy barcode" value={code} onChange={setCode} onScan={(c) => void back(c)} autoFocus busy={busy} placeholder="Scan the book coming back" />
      {last && (
        <motion.div key={last.title + last.borrower} variants={fadeUp} initial="hidden" animate="show" className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm space-y-1">
          <p className="font-semibold text-zinc-900 dark:text-white"><Check className="inline w-4 h-4 -mt-0.5 text-emerald-600" aria-hidden /> {last.title} is back from {last.borrower}</p>
          {last.fine > 0 && <p className="text-rose-700 dark:text-rose-300">Late: fine {money(last.fine, last.currency)} (under Late & fines)</p>}
          <p className="text-zinc-600 dark:text-zinc-300">{last.heldFor ? `Put it aside for ${last.heldFor}: they reserved it and have been told.` : 'It can go back on the shelf.'}</p>
        </motion.div>
      )}
    </div>
  );
}

function BooksView({ onChanged }: { onChanged: () => void }) {
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const { data, mutate } = useSWR<{ books: { id: string; title: string; authors: string | null; coverUrl: string | null; copies: number; available: number; waiting: number; shelf: string | null }[] }>(`/api/library?q=${encodeURIComponent(dq)}`, authedJson, { keepPreviousData: true });
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const changed = () => { void mutate(); onChanged(); };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <SearchField value={q} onChange={setQ} placeholder="Title, author or ISBN" className="flex-1" />
        <button type="button" onClick={() => setAdding(true)} className="btn-primary shrink-0"><BookPlus className="w-4 h-4" /> <span className="hidden sm:inline">Add a book</span><span className="sm:hidden">Add</span></button>
      </div>
      {!data ? <ContentSkeleton variant="list" /> : data.books.length === 0 ? <p className={`${card} p-8 text-center text-sm text-zinc-500`}>{dq ? 'No books match.' : 'No books yet. Add the first one by its ISBN.'}</p> : (
        <motion.ul variants={list} initial="hidden" animate="show" className={`${card} p-2 sm:p-3 divide-y divide-zinc-200/70 dark:divide-white/[0.06]`}>
          {data.books.map((b) => (
            <motion.li key={b.id} variants={fadeUp}>
              <button type="button" onClick={() => setOpen(b.id)} className="w-full flex items-center gap-3 px-2 py-2 rounded-2xl text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                <Cover url={b.coverUrl} title={b.title} className="w-9 h-12 shrink-0" />
                <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{b.title}</span><span className="block text-xs text-zinc-500 truncate">{b.authors ?? ''}{b.shelf ? ` · shelf ${b.shelf}` : ''}</span></span>
                <span className="text-xs text-zinc-500 tabular-nums shrink-0">{b.available}/{b.copies} in{b.waiting ? ` · ${b.waiting} waiting` : ''}</span>
              </button>
            </motion.li>
          ))}
        </motion.ul>
      )}
      {adding && <AddBook onClose={() => setAdding(false)} onAdded={(id) => { setAdding(false); changed(); setOpen(id); }} />}
      {open && <ManageBook key={open} id={open} onClose={() => setOpen(null)} onChanged={changed} />}
    </div>
  );
}

function AddBook({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const [isbn, setIsbn] = useState('');
  const [f, setF] = useState({ title: '', authors: '', publisher: '', year: '', subjects: '', shelf: '', coverUrl: '' });
  const [copies, setCopies] = useState(1);
  const [barcodes, setBarcodes] = useState('');
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const look = async (code: string) => {
    setLooking(true); setNote(null);
    try {
      const r = await authedJson<{ isbn: string; found: { title: string; authors: string | null; publisher: string | null; year: number | null; subjects: string | null; coverUrl: string | null } | null; existing: { id: string; title: string } | null }>(`/api/library/isbn?isbn=${encodeURIComponent(code)}`);
      setIsbn(r.isbn);
      if (r.existing) setNote(`Already in the library as “${r.existing.title}”: open it to add copies instead.`);
      if (r.found) setF((cur) => ({ ...cur, title: r.found!.title, authors: r.found!.authors ?? '', publisher: r.found!.publisher ?? '', year: r.found!.year ? String(r.found!.year) : '', subjects: r.found!.subjects ?? '', coverUrl: r.found!.coverUrl ?? '' }));
      else if (!r.existing) setNote('Open Library doesn’t know this ISBN: type the details.');
    } catch (e) { setNote(errorMessage(e, 'Couldn’t look it up.')); }
    finally { setLooking(false); }
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const codes = barcodes.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
      const r = await authedJson<{ id: string; barcodes: string[] }>('/api/library/books', { method: 'POST', body: JSON.stringify({ isbn: isbn || undefined, ...f, copies, barcodes: codes }) });
      haptic('success');
      toast.success('Book added', { description: `Barcodes: ${r.barcodes.join(', ')}` });
      onAdded(r.id);
    } catch (err) { toast.error(errorMessage(err, 'Couldn’t add the book.')); setBusy(false); }
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((cur) => ({ ...cur, [k]: e.target.value }));
  return (
    <Sheet title="Add a book" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <ScanField label="ISBN (on the back, above the barcode)" value={isbn} onChange={setIsbn} onScan={(c) => void look(c)} placeholder="Scan or type, then Enter" autoFocus busy={looking} />
        {looking && <p className="text-xs text-zinc-500"><Search className="inline w-3 h-3 -mt-0.5" aria-hidden /> Looking it up on Open Library…</p>}
        {note && <p className="text-xs text-amber-800 dark:text-amber-300" role="status">{note}</p>}
        <div className="flex gap-3">
          <Cover url={f.coverUrl || null} title={f.title || 'Book'} className="w-14 h-20 shrink-0" />
          <Field label="Title" className="flex-1">{(p) => <input {...p} required maxLength={300} value={f.title} onChange={set('title')} className="input" />}</Field>
        </div>
        <Field label="Authors">{(p) => <input {...p} maxLength={300} value={f.authors} onChange={set('authors')} className="input" />}</Field>
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label="Publisher">{(p) => <input {...p} maxLength={150} value={f.publisher} onChange={set('publisher')} className="input" />}</Field>
          <Field label="Year">{(p) => <input {...p} inputMode="numeric" maxLength={4} value={f.year} onChange={set('year')} className="input" />}</Field>
        </div>
        <Field label="Subjects">{(p) => <input {...p} maxLength={300} value={f.subjects} onChange={set('subjects')} className="input" />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Shelf">{(p) => <input {...p} maxLength={60} value={f.shelf} onChange={set('shelf')} className="input" placeholder="B3" />}</Field>
          <Field label="Copies">{(p) => <input {...p} type="number" min={1} max={50} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className="input" />}</Field>
        </div>
        <Field label="Barcodes of the copies (optional)" hint="Scan the stickers already on the books, or leave empty and the app makes barcodes to print.">
          {(p) => <textarea {...p} rows={2} value={barcodes} onChange={(e) => setBarcodes(e.target.value)} className="input font-mono text-sm" />}
        </Field>
        <button type="submit" disabled={busy || !f.title.trim()} className="btn-primary w-full">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookPlus className="w-4 h-4" />} Add to the library</button>
      </form>
    </Sheet>
  );
}

interface Manage { id: string; title: string; authors: string | null; coverUrl: string | null; shelf: string | null; copies: { id: string; barcode: string; status: string; note: string | null; loan: { dueAt: string; borrower: { name: string } } | null; heldUntil: string | null }[]; holds: { id: string; status: string; name: string; readyUntil: string | null }[] }

function ManageBook({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const key = `/api/library/books/${id}`;
  const { data, mutate } = useSWR<Manage>(key, authedJson);
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (body: Record<string, unknown>, done: string, tag: string) => {
    setBusy(tag);
    try {
      const r = await authedJson<{ barcodes?: string[]; deleted?: boolean }>(key, { method: 'POST', body: JSON.stringify(body) });
      toast.success(done, { description: r.barcodes ? `Barcodes: ${r.barcodes.join(', ')}` : undefined });
      if (r.deleted) { onChanged(); onClose(); return; }
      await mutate(); onChanged();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); }
    finally { setBusy(null); }
  };
  return (
    <Sheet title={data?.title ?? 'Book'} onClose={onClose}>
      {!data ? <ContentSkeleton variant="list" /> : (
        <div className="space-y-4">
          <p className="text-sm text-zinc-500">{data.authors}{data.shelf ? ` · shelf ${data.shelf}` : ''}</p>
          <section aria-label="Copies">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Copies · {data.copies.length}</p>
              <button type="button" disabled={!!busy} onClick={() => void act({ action: 'copies', copies: 1 }, 'Copy added', 'add')} className="btn-ghost btn-sm">{busy === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add a copy</button>
            </div>
            <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
              {data.copies.map((c) => (
                <li key={c.id} className="py-2 flex items-center gap-3">
                  <span className="font-mono text-sm text-zinc-900 dark:text-white w-24 shrink-0">{c.barcode}</span>
                  <span className="flex-1 min-w-0 text-xs text-zinc-600 dark:text-zinc-300">{c.loan ? `Out: ${c.loan.borrower.name}, due ${format(new Date(c.loan.dueAt), 'd MMM')}` : STATUS[c.status] ?? c.status}</span>
                  <select aria-label={`Copy ${c.barcode} status`} value={c.status === 'LOST' || c.status === 'REPAIR' ? c.status : 'AVAILABLE'} disabled={!!busy || c.status === 'ON_LOAN' || c.status === 'HELD'} onChange={(e) => void act({ action: 'copy', copyId: c.id, status: e.target.value }, 'Copy updated', c.id)} className="input w-auto text-xs py-1">
                    <option value="AVAILABLE">Fine</option><option value="REPAIR">In repair</option><option value="LOST">Lost</option>
                  </select>
                  {c.status !== 'ON_LOAN' && <button type="button" aria-label={`Remove copy ${c.barcode}`} disabled={!!busy} onClick={async () => { if (await confirmDialog({ title: `Remove copy ${c.barcode}?`, confirmLabel: 'Remove', destructive: true })) void act({ action: 'remove-copy', copyId: c.id }, 'Copy removed', c.id); }} className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>}
                </li>
              ))}
            </ul>
          </section>
          {data.holds.length > 0 && (
            <section aria-label="Reservations">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1">Reservations</p>
              <ol className="text-sm space-y-0.5">{data.holds.map((h, i) => <li key={h.id} className="text-zinc-700 dark:text-zinc-200">{i + 1}. {h.name}{h.status === 'READY' && h.readyUntil ? <span className="text-emerald-700 dark:text-emerald-300"> · copy kept until {format(new Date(h.readyUntil), 'd MMM')}</span> : ''}</li>)}</ol>
            </section>
          )}
          <button type="button" disabled={!!busy} onClick={async () => { if (await confirmDialog({ title: `Delete “${data.title}”?`, message: 'Its copies and reservations go too. People waiting are told.', confirmLabel: 'Delete book', destructive: true })) void act({ action: 'delete' }, 'Book deleted', 'delete'); }} className="btn-ghost btn-sm text-rose-600 dark:text-rose-400"><Trash2 className="w-4 h-4" /> Delete book</button>
        </div>
      )}
    </Sheet>
  );
}

function LateView({ desk, onChanged }: { desk: Desk; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (body: Record<string, unknown>, done: (r: Record<string, unknown>) => string, tag: string) => {
    setBusy(tag);
    try { const r = await post<Record<string, unknown>>(body); haptic('success'); toast.success(done(r)); onChanged(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); }
    finally { setBusy(null); }
  };
  const cur = desk.settings.currency;
  return (
    <div className="space-y-4">
      <section className={`${card} p-2 sm:p-3`} aria-labelledby="late-title">
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <h2 id="late-title" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Late books · {desk.overdue.length}</h2>
          {desk.overdue.length > 0 && <button type="button" disabled={!!busy} onClick={() => void act({ action: 'remind' }, (r) => (Number(r.reminded) ? `Reminded ${r.reminded} ${Number(r.reminded) === 1 ? 'person' : 'people'}` : 'Everyone was reminded in the last 3 days'), 'remind')} className="btn-secondary btn-sm">{busy === 'remind' ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />} Remind</button>}
        </div>
        {desk.overdue.length === 0 ? <p className="px-3 pb-3 text-sm text-zinc-500">Nothing late.</p> : (
          <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
            {desk.overdue.map((l) => (
              <li key={l.id} className="px-3 py-2 text-sm">
                <p className="font-semibold text-zinc-900 dark:text-white truncate">{l.title} <span className="font-mono text-xs text-zinc-500">{l.barcode}</span></p>
                <p className="text-xs text-zinc-500">{l.borrower.name} · due {format(new Date(l.dueAt), 'd MMM')} ({formatDistanceToNowStrict(new Date(l.dueAt))} late){l.remindedAt ? ` · reminded ${format(new Date(l.remindedAt), 'd MMM')}` : ''}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={`${card} p-2 sm:p-3`} aria-labelledby="fines-title">
        <h2 id="fines-title" className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Fines owed · {money(desk.fines.reduce((a, f) => a + f.fine, 0), cur)}</h2>
        {desk.fines.length === 0 ? <p className="px-3 pb-3 text-sm text-zinc-500">None.</p> : (
          <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
            {desk.fines.map((f) => (
              <li key={f.id} className="px-3 py-2 flex items-center gap-3">
                <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{f.name} · {money(f.fine, cur)}</span><span className="block text-xs text-zinc-500 truncate">{f.title} · back {format(new Date(f.returnedAt), 'd MMM')}</span></span>
                <button type="button" disabled={!!busy} onClick={() => void act({ action: 'fine', loanId: f.id, to: 'PAID' }, () => 'Marked paid', f.id)} className="btn-secondary btn-sm">Paid</button>
                <button type="button" disabled={!!busy} onClick={() => void act({ action: 'fine', loanId: f.id, to: 'WAIVED' }, () => 'Waived', f.id)} className="btn-ghost btn-sm">Waive</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RulesView({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [f, setF] = useState({ loanDays: settings.loanDays, maxRenewals: settings.maxRenewals, maxLoans: settings.maxLoans, holdDays: settings.holdDays, finePerDay: major(settings.finePerDay), fineCap: major(settings.fineCap), currency: settings.currency });
  const [busy, setBusy] = useState(false);
  const num = (k: 'loanDays' | 'maxRenewals' | 'maxLoans' | 'holdDays') => (e: React.ChangeEvent<HTMLInputElement>) => setF((c) => ({ ...c, [k]: Number(e.target.value) }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await post({ action: 'settings', ...f }); toast.success('Rules saved'); onSaved(); }
    catch (err) { toast.error(errorMessage(err, 'Couldn’t save.')); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className={`${card} p-4 grid grid-cols-2 gap-4`}>
      <Field label="Lend for (days)">{(p) => <input {...p} type="number" min={1} max={120} value={f.loanDays} onChange={num('loanDays')} className="input" />}</Field>
      <Field label="Books at once">{(p) => <input {...p} type="number" min={1} max={50} value={f.maxLoans} onChange={num('maxLoans')} className="input" />}</Field>
      <Field label="Renewals">{(p) => <input {...p} type="number" min={0} max={10} value={f.maxRenewals} onChange={num('maxRenewals')} className="input" />}</Field>
      <Field label="Keep reserved copies (days)">{(p) => <input {...p} type="number" min={1} max={14} value={f.holdDays} onChange={num('holdDays')} className="input" />}</Field>
      <Field label={`Fine per late day (${f.currency})`} hint="0 for no fines">{(p) => <input {...p} inputMode="decimal" value={f.finePerDay} onChange={(e) => setF((c) => ({ ...c, finePerDay: e.target.value.replace(/[^\d.]/g, '') }))} className="input" />}</Field>
      <Field label={`Most a fine can be (${f.currency})`} hint="0 for no limit">{(p) => <input {...p} inputMode="decimal" value={f.fineCap} onChange={(e) => setF((c) => ({ ...c, fineCap: e.target.value.replace(/[^\d.]/g, '') }))} className="input" />}</Field>
      <Field label="Currency">{(p) => <select {...p} value={f.currency} onChange={(e) => setF((c) => ({ ...c, currency: e.target.value }))} className="input">{['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'ZAR', 'KES', 'NGN'].map((x) => <option key={x}>{x}</option>)}</select>}</Field>
      <div className="col-span-2"><button type="submit" disabled={busy} className="btn-primary">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save rules</button></div>
    </form>
  );
}

'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { BookMarked, BookOpen, Clock, Loader2, MapPin, RefreshCw, X } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { SearchField } from '@/components/ui/Field';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LoadError } from '@/components/ui/LoadError';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fadeUp, list } from '@/lib/motion';
import { haptic } from '@/lib/haptics';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import { money } from '@/components/fees/shared';

// The library for students and staff (Stage 5 · B15.4; src/server/library.ts): search the
// catalogue, see what's on the shelf, reserve books that are all out, and my books (due dates,
// renewing, reservations, fines).

interface BookRow { id: string; isbn: string | null; title: string; authors: string | null; year: number | null; coverUrl: string | null; shelf: string | null; copies: number; available: number; waiting: number; myHold: string | null }
interface Mine {
  rules: { loanDays: number; maxRenewals: number; maxLoans: number };
  out: { id: string; book: { id: string; title: string; authors: string | null; coverUrl: string | null }; dueAt: string; renewals: number; canRenew: boolean }[];
  returned: { id: string; book: { title: string }; returnedAt: string; fine: number; fineStatus: string | null }[];
  holds: { id: string; status: string; readyUntil: string | null; book: { id: string; title: string; authors: string | null; coverUrl: string | null } }[];
  owed: number; currency: string;
}
interface Detail { id: string; isbn: string | null; title: string; authors: string | null; publisher: string | null; year: number | null; subjects: string | null; coverUrl: string | null; shelf: string | null; available: number; nextDue: string | null; queue: number; myHold: { id: string; status: string; readyUntil: string | null } | null; myLoan: { dueAt: string } | null; copyCount: number }

const card = 'rounded-3xl tone-panel border border-zinc-200 dark:border-white/10';

export function Cover({ url, title, className }: { url: string | null; title: string; className?: string }) {
  return url ? <img src={url} alt="" loading="lazy" className={cn('object-cover rounded-lg bg-zinc-100 dark:bg-white/5', className)} />
    : <span aria-hidden className={cn('rounded-lg bg-gradient-to-br from-indigo-500/20 to-teal-500/20 flex items-center justify-center text-[10px] font-bold text-indigo-700 dark:text-indigo-300 text-center p-1 leading-tight overflow-hidden', className)}>{title.slice(0, 30)}</span>;
}

export function LibraryHome() {
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const { data, error, mutate, isLoading } = useSWR<{ books: BookRow[] }>(`/api/library?q=${encodeURIComponent(dq)}`, authedJson, { keepPreviousData: true });
  const mine = useSWR<Mine>('/api/library/me', authedJson);
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () => { void mutate(); void mine.mutate(); };

  return (
    <div className="space-y-4">
      <MyBooks data={mine.data} onChanged={refresh} onOpen={setOpen} />
      <section className="space-y-3" aria-labelledby="catalogue-title">
        <h2 id="catalogue-title" className="font-bold text-zinc-900 dark:text-white">Find a book</h2>
        <SearchField value={q} onChange={setQ} placeholder="Title, author, subject or ISBN" />
        {error && !data ? <LoadError onRetry={() => mutate()} />
          : !data ? <ContentSkeleton variant="grid" />
          : data.books.length === 0 ? <p className={`${card} p-8 text-center text-sm text-zinc-500`}>{dq ? 'No books match.' : 'The library hasn’t added any books yet.'}</p>
          : (
            <motion.ul variants={list} initial="hidden" animate="show" className={cn('grid grid-cols-1 sm:grid-cols-2 gap-2 transition-opacity', isLoading && 'opacity-60')}>
              {data.books.map((b) => (
                <motion.li key={b.id} variants={fadeUp}>
                  <button type="button" onClick={() => { haptic('tap'); setOpen(b.id); }} className={`${card} w-full p-3 flex gap-3 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors`}>
                    <Cover url={b.coverUrl} title={b.title} className="w-12 h-16 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-zinc-900 dark:text-white line-clamp-2">{b.title}</span>
                      {b.authors && <span className="block text-xs text-zinc-500 truncate">{b.authors}{b.year ? ` · ${b.year}` : ''}</span>}
                      <span className={cn('mt-1 inline-flex items-center gap-1 text-[11px] font-semibold', b.available ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300')}>
                        {b.available ? `${b.available} on the shelf` : b.copies ? `All out${b.waiting ? ` · ${b.waiting} waiting` : ''}` : 'No copies'}
                        {b.myHold && <span className="text-indigo-700 dark:text-indigo-300"> · {b.myHold === 'READY' ? 'ready for you' : 'reserved'}</span>}
                      </span>
                    </span>
                  </button>
                </motion.li>
              ))}
            </motion.ul>
          )}
      </section>
      {open && <BookSheet key={open} id={open} onClose={() => setOpen(null)} onChanged={refresh} />}
    </div>
  );
}

function MyBooks({ data, onChanged, onOpen }: { data?: Mine; onChanged: () => void; onOpen: (id: string) => void }) {
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);
  if (!data || (!data.out.length && !data.holds.length && !data.owed)) return null;
  const act = async (body: Record<string, unknown>, done: string, id: string) => {
    setBusy(id);
    try {
      const r = await authedJson<{ dueAt?: string }>('/api/library/me', { method: 'POST', body: JSON.stringify(body) });
      haptic('success');
      toast.success(done, { description: r.dueAt ? `Now due ${format(new Date(r.dueAt), 'd MMM')}` : undefined });
      onChanged();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); }
    finally { setBusy(null); }
  };
  return (
    <motion.section variants={fadeUp} initial="hidden" animate="show" className={`${card} p-2 sm:p-3`} aria-labelledby="mine-title">
      <h2 id="mine-title" className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">My books</h2>
      {data.owed > 0 && <p className="mx-3 mb-2 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">You owe {money(data.owed, data.currency)} in late fines. Pay at the library.</p>}
      <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
        {data.out.map((l) => {
          const due = new Date(l.dueAt).getTime();
          const late = now > 0 && due < now, soon = now > 0 && !late && due - now < 3 * 86_400_000;
          return (
            <li key={l.id} className="px-3 py-2.5 flex items-center gap-3">
              <button type="button" onClick={() => onOpen(l.book.id)} className="shrink-0" aria-label={`About ${l.book.title}`}><Cover url={l.book.coverUrl} title={l.book.title} className="w-10 h-14" /></button>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{l.book.title}</span>
                <span className={cn('block text-xs', late ? 'text-rose-700 dark:text-rose-300 font-semibold' : soon ? 'text-amber-800 dark:text-amber-300' : 'text-zinc-500')}>
                  <Clock className="inline w-3 h-3 -mt-0.5" aria-hidden /> {late ? `Late: due ${format(due, 'd MMM')}` : `Due ${format(due, 'EEE d MMM')}`}
                </span>
              </span>
              {l.canRenew && !late && <button type="button" disabled={busy === l.id} onClick={() => void act({ action: 'renew', loanId: l.id }, 'Renewed', l.id)} className="btn-secondary btn-sm shrink-0">{busy === l.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Renew</button>}
            </li>
          );
        })}
        {data.holds.map((h) => (
          <li key={h.id} className="px-3 py-2.5 flex items-center gap-3">
            <button type="button" onClick={() => onOpen(h.book.id)} className="shrink-0" aria-label={`About ${h.book.title}`}><Cover url={h.book.coverUrl} title={h.book.title} className="w-10 h-14" /></button>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{h.book.title}</span>
              <span className={cn('block text-xs', h.status === 'READY' ? 'text-emerald-700 dark:text-emerald-300 font-semibold' : 'text-zinc-500')}>
                <BookMarked className="inline w-3 h-3 -mt-0.5" aria-hidden /> {h.status === 'READY' && h.readyUntil ? `Ready to collect until ${format(new Date(h.readyUntil), 'd MMM')}` : 'Reserved: you’ll be told when it’s back'}
              </span>
            </span>
            <button type="button" disabled={busy === h.id} onClick={() => void act({ action: 'cancel-hold', holdId: h.id }, 'Reservation cancelled', h.id)} aria-label={`Cancel the reservation of ${h.book.title}`} className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:text-rose-600 hover:bg-rose-500/10 shrink-0"><X className="w-4 h-4" /></button>
          </li>
        ))}
      </ul>
      <p className="px-3 pb-1 pt-1 text-[11px] text-zinc-500">Up to {data.rules.maxLoans} books for {data.rules.loanDays} days; renew up to {data.rules.maxRenewals} times when nobody is waiting.</p>
    </motion.section>
  );
}

function BookSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const key = `/api/library/books/${id}`;
  const { data, error, mutate } = useSWR<Detail>(key, authedJson);
  const [busy, setBusy] = useState(false);
  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      const r = await authedJson<{ place?: number }>('/api/library/me', { method: 'POST', body: JSON.stringify(body) });
      haptic('success');
      toast.success(done, { description: r.place ? (r.place === 1 ? 'You’re first in the queue.' : `You’re number ${r.place} in the queue.`) : undefined });
      await mutate();
      onChanged();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); }
    finally { setBusy(false); }
  };
  return (
    <Sheet title={data?.title ?? 'Book'} onClose={onClose}>
      {error && !data ? <LoadError onRetry={() => mutate()} /> : !data ? <ContentSkeleton variant="list" /> : (
        <div className="space-y-4">
          <div className="flex gap-4">
            <Cover url={data.coverUrl} title={data.title} className="w-20 h-28 shrink-0" />
            <div className="min-w-0 text-sm space-y-0.5">
              {data.authors && <p className="font-semibold text-zinc-900 dark:text-white">{data.authors}</p>}
              <p className="text-zinc-500">{[data.publisher, data.year].filter(Boolean).join(' · ')}</p>
              {data.isbn && <p className="text-xs text-zinc-500 font-mono">ISBN {data.isbn}</p>}
              {data.shelf && <p className="text-xs text-zinc-600 dark:text-zinc-300"><MapPin className="inline w-3 h-3 -mt-0.5" aria-hidden /> Shelf {data.shelf}</p>}
            </div>
          </div>
          {data.subjects && <p className="text-xs text-zinc-500">{data.subjects}</p>}
          <div className={cn('rounded-2xl p-3 text-sm', data.available ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200' : 'bg-amber-500/10 text-amber-900 dark:text-amber-200')}>
            {data.myLoan ? `You have it: due ${format(new Date(data.myLoan.dueAt), 'EEE d MMM')}.`
              : data.available ? `${data.available} cop${data.available === 1 ? 'y is' : 'ies are'} on the shelf. Ask for it at the library desk.`
              : data.copyCount === 0 ? 'The library has no copies of this book yet.'
              : `All copies are out${data.nextDue ? `; the next is due back ${formatDistanceToNowStrict(new Date(data.nextDue), { addSuffix: true })}` : ''}.${data.queue ? ` ${data.queue} waiting.` : ''}`}
          </div>
          {!data.myLoan && (data.myHold ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-zinc-700 dark:text-zinc-200"><BookOpen className="inline w-4 h-4 -mt-0.5 text-indigo-500" aria-hidden /> {data.myHold.status === 'READY' && data.myHold.readyUntil ? `Ready for you until ${format(new Date(data.myHold.readyUntil), 'd MMM')}` : 'You reserved it.'}</p>
              <button type="button" disabled={busy} onClick={() => void act({ action: 'cancel-hold', holdId: data.myHold!.id }, 'Reservation cancelled')} className="btn-ghost btn-sm text-rose-600 dark:text-rose-400">Cancel</button>
            </div>
          ) : !data.available && (
            <button type="button" disabled={busy} onClick={() => void act({ action: 'hold', bookId: data.id }, 'Reserved: you’ll be told when it’s back')} className="btn-primary w-full">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookMarked className="w-4 h-4" />} Reserve it</button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

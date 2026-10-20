'use client';

import { Suspense, useState } from 'react';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowRight, BedDouble, Camera, Car, Flag, Loader2, MapPin, MessageSquare, Plus, ShoppingBag, Trash2, Users } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, LIFE_TABS } from '@/components/layout/SectionTabs';
import { Avatar } from '@/components/ui/Avatar';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, SearchField } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { confirmDialog, promptDialog } from '@/components/ui/Dialogs';
import { money } from '@/components/fees/shared';
import { uploadChatFile } from '@/components/chat/chat-client';
import { authedJson } from '@/lib/authed-fetch';
import { BOARD_SECTIONS, KIND_LABEL, MARKET_CATEGORIES, type BoardSection } from '@/lib/student-life';
import { fadeUp, list } from '@/lib/motion';

// Stage 5 · Q17: the campus board. Students sell, swap, give away or ask for things, offer and find
// rides, and rooms. Message the poster (a one-to-one chat), report anything wrong (three reports
// hide a post until an admin looks). Posts expire by themselves (src/server/campus-board.ts).

interface Listing {
  id: string; kind: string; title: string; description: string | null; category: string | null; price: number | null; photoUrl: string | null;
  fromPlace: string | null; toPlace: string | null; departAt: string | null; seats: number | null; area: string | null; availableFrom: string | null;
  status: string; expiresAt: string; createdAt: string; mine: boolean; reported: boolean; user: { id: string; name: string; avatar: string | null };
}
type View = BoardSection | 'mine';
const VIEWS: { value: View; label: string }[] = [{ value: 'market', label: 'Marketplace' }, { value: 'rides', label: 'Rides' }, { value: 'housing', label: 'Housing' }, { value: 'mine', label: 'My posts' }];
const ICON = { market: ShoppingBag, rides: Car, housing: BedDouble } as const;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const localInput = (ms: number) => new Date(ms - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

function NewPost({ section, onClose, onSaved }: { section: BoardSection; onClose: () => void; onSaved: () => void }) {
  const kinds = BOARD_SECTIONS[section].kinds;
  const [f, setF] = useState<Record<string, string>>({ kind: kinds[0], category: 'Books', departAt: localInput(Date.now() + 86_400_000), seats: '3' });
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      const photoUrl = photo ? await uploadChatFile(photo) : null;
      await authedJson('/api/campus/board', { method: 'POST', body: JSON.stringify({ ...f, photoUrl, departAt: f.departAt ? new Date(f.departAt).toISOString() : null, availableFrom: f.availableFrom ? new Date(`${f.availableFrom}T12:00`).toISOString() : null }) });
      toast.success('Posted');
      onSaved();
      onClose();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const input = (k: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => function FieldInput(p: { id: string }) {
    return <input {...p} {...extra} className="input" value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)} />;
  };
  return (
    <Sheet title={`New post: ${BOARD_SECTIONS[section].label}`} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy || (f.title ?? '').trim().length < 3} onClick={save}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Post</button></div>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Kind" className="sm:col-span-2">{(p) => <select {...p} className="input" value={f.kind} onChange={(e) => set('kind', e.target.value)}>{kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>}</Field>
        <Field label="Title" className="sm:col-span-2">{input('title', { maxLength: 100, placeholder: section === 'market' ? 'Calculus textbook, 3rd edition' : section === 'rides' ? 'Campus to the airport, Friday' : 'Room in a 3-bed flat near Gate 2' })}</Field>
        {section === 'market' && <>
          <Field label="Category">{(p) => <select {...p} className="input" value={f.category} onChange={(e) => set('category', e.target.value)}>{MARKET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>}</Field>
          {f.kind === 'SELL' && <Field label="Price (₹)">{input('price', { inputMode: 'decimal' })}</Field>}
        </>}
        {section === 'rides' && <>
          <Field label="From">{input('fromPlace', { maxLength: 80 })}</Field>
          <Field label="To">{input('toPlace', { maxLength: 80 })}</Field>
          <Field label="When">{input('departAt', { type: 'datetime-local' })}</Field>
          {f.kind === 'RIDE_OFFER' && <Field label="Free seats">{input('seats', { type: 'number', min: 1, max: 8 })}</Field>}
          <Field label="Cost share per person (₹, optional)">{input('price', { inputMode: 'decimal' })}</Field>
        </>}
        {section === 'housing' && <>
          <Field label="Area">{input('area', { maxLength: 80, placeholder: 'Neighbourhood or street' })}</Field>
          <Field label={f.kind === 'ROOM_OFFER' ? 'Rent a month (₹)' : 'Budget a month (₹, optional)'}>{input('price', { inputMode: 'decimal' })}</Field>
          <Field label="Available from (optional)">{input('availableFrom', { type: 'date' })}</Field>
        </>}
        <Field label="Details (optional)" className="sm:col-span-2" count={(f.description ?? '').length} max={1000}>{(p) => <textarea {...p} className="input min-h-[80px]" maxLength={1000} value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} />}</Field>
        {section === 'market' && (
          <div className="sm:col-span-2">
            <input type="file" accept="image/*" className="sr-only" id="board-photo" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            <label htmlFor="board-photo" className="btn-ghost btn-sm cursor-pointer"><Camera className="w-4 h-4" aria-hidden /> {photo ? photo.name : 'Add a photo'}</label>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function Card({ l, onChanged }: { l: Listing; onChanged: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try { await fn(); if (ok) toast.success(ok); onChanged(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const message = () => act(async () => {
    const r = await authedJson<{ conversationId: string }>(`/api/campus/board/${l.id}/contact`, { method: 'POST' });
    router.push(`/student/inbox?c=${encodeURIComponent(r.conversationId)}`);
  });
  const report = async () => {
    const reason = await promptDialog({ title: 'Report this post', message: 'What’s wrong with it? Admins see your reason, not your name.', placeholder: 'e.g. a scam, not allowed on campus', maxLength: 300, confirmLabel: 'Report' });
    if (reason) await act(() => authedJson(`/api/campus/board/${l.id}/report`, { method: 'POST', body: JSON.stringify({ reason }) }), 'Reported. Thank you.');
  };
  const remove = async () => {
    if (await confirmDialog({ title: `Delete “${l.title}”?`, confirmLabel: 'Delete', destructive: true })) await act(() => authedJson(`/api/campus/board/${l.id}`, { method: 'DELETE' }));
  };
  const price = l.price ? money(l.price, 'INR') : null;
  return (
    <motion.li variants={fadeUp} className="panel overflow-hidden flex flex-col min-w-0">
      {l.photoUrl && <div className="relative h-40 bg-zinc-100 dark:bg-white/5"><Image src={l.photoUrl} alt={l.title} fill unoptimized sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" /></div>}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start gap-2">
          <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 shrink-0">{KIND_LABEL[l.kind]}</span>
          {l.status === 'DONE' && <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-zinc-100 text-zinc-700 dark:bg-white/[0.08] dark:text-zinc-200">Done</span>}
          <span className="flex-1" />
          {price && <span className="font-bold tabular-nums text-zinc-900 dark:text-white">{price}{l.kind === 'ROOM_OFFER' || l.kind === 'ROOM_WANT' ? '/mo' : l.kind.startsWith('RIDE') ? ' each' : ''}</span>}
        </div>
        <h3 className="font-bold text-zinc-900 dark:text-white break-words">{l.title}</h3>
        {(l.fromPlace || l.area) && (
          <p className="text-sm text-zinc-700 dark:text-zinc-200 flex flex-wrap items-center gap-x-2 gap-y-1">
            {l.fromPlace && <span className="inline-flex items-center gap-1 min-w-0 break-words">{l.fromPlace} <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-label="to" /> {l.toPlace}</span>}
            {l.departAt && <span className="text-zinc-600 dark:text-zinc-400">{when(l.departAt)}</span>}
            {l.seats ? <span className="inline-flex items-center gap-1 text-zinc-600 dark:text-zinc-400"><Users className="w-3.5 h-3.5" aria-hidden /> {l.seats} seat{l.seats === 1 ? '' : 's'}</span> : null}
            {l.area && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" aria-hidden /> {l.area}</span>}
            {l.availableFrom && <span className="text-zinc-600 dark:text-zinc-400">from {day(l.availableFrom)}</span>}
          </p>
        )}
        {l.description && <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-line break-words line-clamp-4">{l.description}</p>}
        <div className="mt-auto pt-3 border-t border-zinc-200 dark:border-white/10 flex items-center gap-2">
          <Avatar name={l.user.name} src={l.user.avatar} size={28} />
          <span className="text-xs text-zinc-600 dark:text-zinc-400 flex-1 min-w-0 truncate">{l.user.name.split(' ')[0]} · {day(l.createdAt)}{l.category ? ` · ${l.category}` : ''}</span>
          {l.mine ? (
            <>
              <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => act(() => authedJson(`/api/campus/board/${l.id}`, { method: 'PATCH', body: JSON.stringify({ status: l.status === 'DONE' ? 'ACTIVE' : 'DONE' }) }))}>{l.status === 'DONE' ? 'Put back up' : 'Mark as done'}</button>
              <button type="button" className="btn-ghost btn-icon btn-sm" aria-label={`Delete ${l.title}`} disabled={busy} onClick={remove}><Trash2 className="w-4 h-4" aria-hidden /></button>
            </>
          ) : (
            <>
              <button type="button" className="btn-ghost btn-icon btn-sm" aria-label={l.reported ? 'You reported this post' : `Report ${l.title}`} disabled={busy || l.reported} onClick={report}><Flag className="w-4 h-4" aria-hidden /></button>
              <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={message}><MessageSquare className="w-4 h-4" aria-hidden /> Message</button>
            </>
          )}
        </div>
      </div>
    </motion.li>
  );
}

function Board() {
  const q = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const view = (VIEWS.some((v) => v.value === q.get('section')) ? q.get('section') : 'market') as View;
  const key = view === 'mine' ? '/api/campus/board?mine=1' : `/api/campus/board?section=${view}`;
  const { data, error, isLoading, mutate } = useSWR<{ listings: Listing[] }>(key, authedJson);
  const [search, setSearch] = useState('');
  const [posting, setPosting] = useState(false);
  const needle = search.trim().toLowerCase();
  const rows = (data?.listings ?? []).filter((l) => !needle || [l.title, l.description, l.fromPlace, l.toPlace, l.area, l.category].some((v) => v?.toLowerCase().includes(needle)));
  const section: BoardSection = view === 'mine' ? 'market' : view;
  const Icon = ICON[section];
  return (
    <>
      <Topbar title="Campus board" subtitle="Buy, sell and swap; share rides; find a room" />
      <SectionTabs tabs={LIFE_TABS} />
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-8 max-w-5xl mx-auto w-full min-w-0 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Segmented label="Show" value={view} onChange={(v) => router.replace(`${path}?section=${v}`, { scroll: false })} segments={VIEWS} className="self-start" />
            <span className="flex-1" />
            {view !== 'mine' && <button type="button" className="btn-primary self-start" onClick={() => setPosting(true)}><Plus className="w-4 h-4" aria-hidden /> Post</button>}
          </div>
          <SearchField value={search} onChange={setSearch} placeholder={view === 'rides' ? 'Search places' : 'Search'} />
          {error ? <div className="panel p-5"><p className="text-sm text-rose-600 dark:text-rose-400">{(error as Error).message || 'Couldn’t load the board.'}</p><button type="button" className="btn-secondary btn-sm mt-3" onClick={() => mutate()}>Try again</button></div>
            : isLoading || !data ? <ContentSkeleton variant="grid" />
            : rows.length ? (
              <motion.ul key={view} variants={list} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rows.map((l) => <Card key={l.id} l={l} onChanged={() => void mutate()} />)}
              </motion.ul>
            ) : <div className="panel"><EmptyState icon={Icon} title={view === 'mine' ? 'You haven’t posted yet' : needle ? 'Nothing matches' : 'Nothing here yet'} hint={view === 'mine' ? 'Your posts appear here, to mark as done or delete.' : 'Be the first: tap Post.'} action={view !== 'mine' && !needle ? { label: 'Post', onClick: () => setPosting(true), icon: Plus } : undefined} /></div>}
          <p className="text-xs text-zinc-500">Only students can see and post. Meet in public places on campus, and never pay before you’ve seen the item. Posts come down by themselves after 60 days (rides, the day after they leave).</p>
        </div>
      </div>
      {posting && view !== 'mine' && <NewPost section={section} onClose={() => setPosting(false)} onSaved={() => void mutate()} />}
    </>
  );
}

export default function Page() {
  return <Suspense><Board /></Suspense>;
}

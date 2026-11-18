'use client';

import { useState } from 'react';
import { ACCESS_KEYS, type AccessKey, type AccessNote } from '@/lib/travel-access';
import useSWR, { mutate as refresh } from 'swr';
import { toast } from 'sonner';
import { Accessibility, Flag, Home, Loader2, Star, Trash2 } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { cn } from '@/lib/utils';

// A place's reviews on Travel's map (M209): UniVerse's own people, with what locals say (those who ticked
// "I live here") apart from visitors; mine to write, change or delete; others' to report.

interface Part { count: number; average: number | null }
interface Answer {
  summary: Part & { locals: Part; visitors: Part };
  /** M322: what visitors said about getting in and around. */
  access?: { things: { key: AccessKey; label: string; yes: number; of: number }[]; notes: string[]; visitors: number };
  reviews: { id: string; name: string; rating: number; text: string | null; local: boolean; visited: string | null; at: string; mine: boolean }[];
  mine: { id: string; rating: number; text: string | null; local: boolean; visited: string | null; access?: AccessNote | null } | null;
}

export function Stars({ value, size = 'h-4 w-4' }: { value: number; size?: string }) {
  return (
    <span className="inline-flex" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={cn(size, n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-zinc-300 dark:text-zinc-600')} />)}
    </span>
  );
}

export function Reviews({ place, name, lat, lon }: { place: string; name: string; lat: number; lon: number }) {
  const key = `/travel/reviews?place=${encodeURIComponent(place)}`;
  const { data, mutate } = useSWR<Answer>(key, fetcher);
  const [who, setWho] = useState<'all' | 'locals' | 'visitors'>('all');
  const [writing, setWriting] = useState(false);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [local, setLocal] = useState(false);
  const [access, setAccess] = useState<AccessNote>({});
  const [busy, setBusy] = useState(false);
  const edit = () => { setRating(data?.mine?.rating ?? 0); setText(data?.mine?.text ?? ''); setLocal(data?.mine?.local ?? false); setAccess(data?.mine?.access ?? {}); setWriting(true); };
  const save = async () => {
    setBusy(true);
    try {
      await api.post('/travel/reviews', { place, name, lat, lon, rating, text, local, access });
      setWriting(false); toast.success('Thanks: your review is up.');
      await mutate(); void refresh((k) => typeof k === 'string' && k.startsWith('/travel/reviews/near'));
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t save your review.')); } finally { setBusy(false); }
  };
  const act = async (call: () => Promise<unknown>, ok: string) => { try { await call(); toast.success(ok); await mutate(); void refresh((k) => typeof k === 'string' && k.startsWith('/travel/reviews/near')); } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); } };

  const s = data?.summary, shown = (data?.reviews ?? []).filter((r) => who === 'all' || (who === 'locals') === r.local);
  return (
    <section aria-labelledby={`rv-${place}`} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={`rv-${place}`} className="font-semibold text-zinc-900 dark:text-white">Reviews</h4>
        {!writing && <button type="button" onClick={edit} className="btn-secondary btn-sm">{data?.mine ? 'Change my review' : 'Write a review'}</button>}
      </div>
      {s && s.count > 0 && (
        <div className="grid grid-cols-2 gap-2 text-sm">
          {[{ label: 'Locals', p: s.locals, icon: true }, { label: 'Visitors', p: s.visitors, icon: false }].map((x) => (
            <div key={x.label} className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-white/[0.04]">
              <p className="flex items-center gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">{x.icon && <Home className="h-3.5 w-3.5" aria-hidden />}{x.label} say</p>
              <p className="mt-0.5 flex items-center gap-1.5 font-semibold tabular-nums text-zinc-900 dark:text-white">{x.p.average ?? '–'}<Stars value={x.p.average ?? 0} size="h-3.5 w-3.5" /><span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">({x.p.count})</span></p>
            </div>
          ))}
        </div>
      )}
      {data?.access && data.access.things.length > 0 && (
        <div className="rounded-xl bg-sky-500/10 px-3 py-2 text-sm">
          <p className="flex items-center gap-1 text-xs font-semibold text-sky-800 dark:text-sky-200"><Accessibility className="h-3.5 w-3.5" aria-hidden />Getting in and around, from {data.access.visitors} {data.access.visitors === 1 ? 'visitor' : 'visitors'}</p>
          <ul className="mt-1 grid grid-cols-1 gap-x-3 sm:grid-cols-2">{data.access.things.map((t) => <li key={t.key} className="text-zinc-800 dark:text-zinc-100">{t.label}: <span className="tabular-nums">{t.yes} of {t.of}</span> say yes</li>)}</ul>
          {data.access.notes.map((n, i) => <p key={i} className="mt-1 text-xs text-zinc-700 dark:text-zinc-200" translate="no">“{n}”</p>)}
        </div>
      )}
      {writing && (
        <form className="space-y-2 rounded-xl bg-zinc-50 p-3 dark:bg-white/[0.04]" onSubmit={(e) => { e.preventDefault(); if (rating) void save(); }}>
          <div role="radiogroup" aria-label="Your stars" className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`} onClick={() => setRating(n)} className="rounded-md p-1 transition-transform duration-150 active:scale-90">
                <Star className={cn('h-7 w-7', n <= rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-300 dark:text-zinc-600')} aria-hidden />
              </button>
            ))}
          </div>
          <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300">What should people know?
            <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 2000))} rows={3} placeholder="What to order, when to go, what to skip…" className="mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white" />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={local} onChange={(e) => setLocal(e.target.checked)} className="h-4 w-4" />I live here</label>
          <fieldset className="rounded-xl border border-zinc-200 p-2 dark:border-white/10">
            <legend className="px-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">Getting in and around (optional)</legend>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {(Object.keys(ACCESS_KEYS) as AccessKey[]).map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                  <select aria-label={ACCESS_KEYS[k]} className="input w-auto py-0.5 text-xs" value={access[k] === undefined ? '' : access[k] ? 'yes' : 'no'} onChange={(e) => setAccess((a) => { const n = { ...a }; if (e.target.value === '') delete n[k]; else n[k] = e.target.value === 'yes'; return n; })}>
                    <option value="">–</option><option value="yes">Yes</option><option value="no">No</option>
                  </select>
                  {ACCESS_KEYS[k]}
                </label>
              ))}
            </div>
            <input aria-label="A note on access" maxLength={300} value={access.note ?? ''} onChange={(e) => setAccess((a) => ({ ...a, note: e.target.value }))} placeholder="e.g. a ramp at the side door" className="input mt-2 py-1 text-sm" />
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={!rating || busy} className="btn-primary btn-sm inline-flex items-center gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}Post review</button>
            <button type="button" onClick={() => setWriting(false)} className="btn-ghost btn-sm">Cancel</button>
            {data?.mine && <button type="button" onClick={() => void act(() => api.delete(`/travel/reviews/${data.mine!.id}`).then(() => setWriting(false)), 'Your review is deleted.')} className="btn-ghost btn-sm ms-auto inline-flex items-center gap-1 text-red-600 dark:text-red-400"><Trash2 className="h-4 w-4" aria-hidden />Delete</button>}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Shown with your first name. Be kind and stick to what you saw.</p>
        </form>
      )}
      {!data ? <p className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Loading reviews…</p>
        : !data.reviews.length ? <p className="text-sm text-zinc-600 dark:text-zinc-300">No reviews yet. Been here? Be the first, and tick “I live here” if you’re a local.</p>
        : (
          <>
            <Segmented<'all' | 'locals' | 'visitors'> label="Whose reviews" value={who} onChange={setWho} segments={[{ value: 'all', label: `All (${s!.count})` }, { value: 'locals', label: `Locals (${s!.locals.count})` }, { value: 'visitors', label: `Visitors (${s!.visitors.count})` }]} />
            <ul className="space-y-3">
              {shown.map((r) => (
                <li key={r.id} className="border-t border-zinc-200/70 pt-3 first:border-0 first:pt-0 dark:border-white/10">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-semibold text-zinc-900 dark:text-white" translate="no">{r.name}</span>
                    {r.local && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-px text-xs font-semibold text-emerald-700 dark:text-emerald-300"><Home className="h-3 w-3" aria-hidden />Lives here</span>}
                    <Stars value={r.rating} size="h-3.5 w-3.5" /><span className="sr-only">{r.rating} out of 5</span>
                    {r.visited && <span className="text-xs text-zinc-500 dark:text-zinc-400">went {new Date(`${r.visited}-15T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })}</span>}
                  </p>
                  {r.text && <p className="mt-1 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200" translate="no">{r.text}</p>}
                  {!r.mine && <button type="button" onClick={() => { const reason = prompt('What’s wrong with this review?'); if (reason !== null) void act(() => api.post(`/travel/reviews/${r.id}/report`, { reason }), 'Thanks: it’s reported. Three reports hide a review.'); }} className="btn-ghost btn-sm mt-1 inline-flex items-center gap-1 px-1.5 text-xs"><Flag className="h-3.5 w-3.5" aria-hidden />Report</button>}
                </li>
              ))}
              {!shown.length && <li className="text-sm text-zinc-600 dark:text-zinc-300">None from {who} yet.</li>}
            </ul>
          </>
        )}
    </section>
  );
}

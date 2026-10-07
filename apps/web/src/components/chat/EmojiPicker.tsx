'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EmojiGroup } from '@/lib/emoji-data';

// The emoji picker (Stage 4 · 1.2), for the message box and for reactions: search, groups, the
// ones you used last, and a community's own emoji in its channels. The emoji list loads when the
// picker first opens (src/lib/emoji-data.ts).

/** A community's own emoji: used as :name: in messages and reactions. */
export interface CustomEmoji { name: string; url: string }

const RECENT_KEY = 'universe:recent-emoji';
const readRecent = (): string[] => {
  try { const r = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(r) ? r.filter((x) => typeof x === 'string').slice(0, 24) : []; } catch { return []; }
};
/** Remembers an emoji as used (the "Recent" row). */
export function rememberEmoji(e: string) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...readRecent().filter((x) => x !== e)].slice(0, 24))); } catch { /* private mode */ }
}

type Item = { e: string; k: string; url?: string };

export function EmojiPicker({ onPick, custom = [], onClose, className }: {
  onPick: (emoji: string) => void;
  custom?: CustomEmoji[];
  onClose?: () => void;
  className?: string;
}) {
  const [groups, setGroups] = useState<{ id: string; label: string; icon: string; items: Item[] }[] | null>(null);
  const [recent] = useState(readRecent);
  const [q, setQ] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let off = false;
    void import('@/lib/emoji-data').then(({ EMOJI_GROUPS, emojiList }) => {
      if (!off) setGroups(EMOJI_GROUPS.map((g: EmojiGroup) => ({ id: g.id, label: g.label, icon: g.icon, items: emojiList(g) })));
    });
    return () => { off = true; };
  }, []);
  useEffect(() => {
    const t = setTimeout(() => search.current?.focus({ preventScroll: true }), 50);
    return () => clearTimeout(t);
  }, []);

  const customItems: Item[] = custom.map((c) => ({ e: `:${c.name}:`, k: c.name.replace(/_/g, ' '), url: c.url }));
  const urlOf = (e: string) => customItems.find((c) => c.e === e)?.url;
  const sections = useMemo(() => {
    if (!groups) return [];
    const recentItems: Item[] = recent.map((e) => ({ e, k: '', url: urlOf(e) })).filter((it) => !it.e.startsWith(':') || it.url);
    return [
      ...(recentItems.length ? [{ id: 'recent', label: 'Recent', icon: '🕘', items: recentItems }] : []),
      ...(customItems.length ? [{ id: 'custom', label: 'This community', icon: '⭐', items: customItems }] : []),
      ...groups,
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- custom and recent are stable per open
  }, [groups, custom.length]);
  const query = q.trim().toLowerCase();
  const results = query ? sections.filter((s) => s.id !== 'recent').flatMap((s) => s.items).filter((it) => it.k.includes(query) || it.e.toLowerCase().includes(query)).slice(0, 120) : null;

  const pick = (it: Item) => { rememberEmoji(it.e); onPick(it.e); };
  const jump = (id: string) => scroller.current?.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  const cell = (it: Item) => (
    <button key={it.e} type="button" onClick={() => pick(it)} title={it.k || it.e} aria-label={it.k ? `${it.e} ${it.k.split(' ')[0]}` : it.e}
      className="w-9 h-9 rounded-xl flex items-center justify-center text-[22px] leading-none hover:bg-zinc-100 dark:hover:bg-white/10 active:scale-90 transition-transform">
      {it.url ? <img src={it.url} alt={it.e} className="w-6 h-6 object-contain" draggable={false} /> : it.e}
    </button>
  );

  return (
    <div role="dialog" aria-label="Emoji" className={cn('w-[20.5rem] max-w-[calc(100vw-1.5rem)] h-[23rem] flex flex-col rounded-2xl bg-white dark:bg-[#121830] border border-zinc-200 dark:border-white/10 shadow-2xl overflow-hidden', className)}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); } }}>
      <div className="p-2 flex items-center gap-1.5">
        <label className="flex-1 flex items-center gap-2 h-9 px-3 rounded-xl bg-zinc-100 dark:bg-white/[0.06]">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search emoji" aria-label="Search emoji" className="flex-1 min-w-0 bg-transparent outline-none text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500" />
        </label>
        {onClose && <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>}
      </div>
      {!query && (
        <div className="flex px-1.5 gap-0.5 overflow-x-auto scrollbar-none border-b border-zinc-100 dark:border-white/[0.06]" role="tablist" aria-label="Emoji groups">
          {sections.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={false} onClick={() => jump(s.id)} title={s.label} aria-label={s.label} className="shrink-0 w-8 h-8 rounded-lg text-lg flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-white/10">{s.icon}</button>
          ))}
        </div>
      )}
      <div ref={scroller} className="flex-1 overflow-y-auto px-1.5 pb-2 overscroll-contain">
        {!groups ? (
          <div className="grid grid-cols-8 gap-0.5 pt-2">{Array.from({ length: 40 }, (_, i) => <span key={i} className="w-9 h-9 rounded-xl skeleton" />)}</div>
        ) : results ? (
          results.length ? <div className="grid grid-cols-8 gap-0.5 pt-2">{results.map(cell)}</div> : <p className="text-center text-sm text-zinc-500 pt-10">No emoji found</p>
        ) : (
          sections.map((s) => (
            <section key={s.id} data-section={s.id} className="scroll-mt-1">
              <p className="sticky top-0 z-[1] px-1.5 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 bg-white/95 dark:bg-[#121830]/95 backdrop-blur">{s.label}</p>
              <div className="grid grid-cols-8 gap-0.5">{s.items.map(cell)}</div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

/** A reaction or emoji as shown: a community's own emoji as its picture, anything else as text. */
export function EmojiGlyph({ emoji, custom, className }: { emoji: string; custom?: Record<string, string>; className?: string }) {
  const url = /^:[a-z0-9_]{2,32}:$/.test(emoji) ? custom?.[emoji.slice(1, -1)] : undefined;
  return url ? <img src={url} alt={emoji} title={emoji} className={cn('inline-block w-[1.15em] h-[1.15em] object-contain align-[-0.2em]', className)} draggable={false} /> : <span className={className}>{emoji}</span>;
}

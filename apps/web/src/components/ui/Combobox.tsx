'use client';

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Check, ChevronDown, Loader2, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComboOption {
  label: string;
  /** Shown to the right, e.g. the country. */
  hint?: string;
  /** A short leading glyph, e.g. a flag emoji. */
  icon?: string;
  /** Used to rank the visitor's own country first (see `preferGroup`). */
  group?: string;
  /** Other names people search for, space-separated (e.g. "mit"): an exact hit ranks first. */
  keywords?: string;
}

type Source = readonly string[] | readonly ComboOption[] | (() => Promise<ComboOption[]>);

interface Indexed extends ComboOption { n: string; initials: string; k: string }

const MAX_SHOWN = 40;
// Fixed class strings for the rows (no class merging per row per keystroke: it made typing lag).
const ROW_BASE = 'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer select-none transition-colors duration-75';
const ROW = `${ROW_BASE} text-zinc-700 dark:text-zinc-300`;
const ROW_ACTIVE = `${ROW_BASE} bg-indigo-500/10 text-zinc-900 dark:text-white`;
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const STOP = new Set(['of', 'the', 'de', 'la', 'le', 'des', 'du', 'and', 'et', 'for', 'di', 'del', 'da', 'y', 'e', 'für', 'an', 'at', 'in']);

function index(options: readonly ComboOption[]): Indexed[] {
  return options.map((o) => {
    const n = fold(o.label);
    const initials = n.split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w)).map((w) => w[0]).join('');
    return { ...o, n, initials, k: o.keywords ? ` ${fold(o.keywords)} ` : '' };
  });
}

function search(items: Indexed[], query: string, preferGroup?: string): Indexed[] {
  const q = fold(query.trim());
  if (!q) {
    if (!preferGroup) return items.slice(0, MAX_SHOWN);
    const local = items.filter((i) => i.group === preferGroup);
    return (local.length ? local : items).slice(0, MAX_SHOWN);
  }
  const tokens = q.split(/\s+/).filter(Boolean);
  // Typed in capitals ("MIT", "UCLA"): an acronym, so initials beat plain prefix matches.
  const acronym = /^[A-Z]{2,6}$/.test(query.trim());
  const spaced = ` ${q}`, paren = `(${q}`, multi = tokens.length > 1;
  // Keep only the best MAX_SHOWN (a short query like "u" matches thousands; sorting them all
  // made typing lag on phones). Rank: match quality, then shorter names.
  const best: { item: Indexed; key: number }[] = [];
  for (const item of items) {
    let score: number;
    const at = item.n.indexOf(q);
    if (item.k && item.k.includes(` ${q} `)) score = -1;
    else if (at === 0) score = item.n.length === q.length ? 0 : 1;
    else if (at > 0 && (item.n.includes(spaced) || item.n.includes(paren))) score = 2;
    else if (q.length >= 2 && !q.includes(' ') && item.initials.startsWith(q)) score = item.initials === q ? (acronym ? 0.5 : 1.5) : 2.5;
    else if (at > 0 || (multi && tokens.every((t) => item.n.includes(t)))) score = 3;
    else continue;
    if (preferGroup && item.group === preferGroup) score -= 0.6;
    const key = score * 10000 + Math.min(item.n.length, 999); // scores differ by >= 0.1, so 10000 keeps them apart
    if (best.length === MAX_SHOWN && key >= best[MAX_SHOWN - 1].key) continue;
    let i = best.length;
    while (i > 0 && best[i - 1].key > key) i--;
    best.splice(i, 0, { item, key });
    if (best.length > MAX_SHOWN) best.pop();
  }
  return best.map((b) => b.item);
}

/** Bolds the part of `label` that matches `query`, ignoring case and accents. */
function Highlight({ label, query }: { label: string; query: string }) {
  const q = fold(query.trim());
  if (!q) return <>{label}</>;
  if (/^[\x00-\x7f]*$/.test(label)) { // fast path: plain ASCII
    const i = label.toLowerCase().indexOf(q);
    if (i < 0) return <>{label}</>;
    return <>{label.slice(0, i)}<mark className="bg-transparent text-indigo-600 dark:text-indigo-300 font-semibold">{label.slice(i, i + q.length)}</mark>{label.slice(i + q.length)}</>;
  }
  let folded = '';
  const map: number[] = [];
  for (let i = 0; i < label.length; i++) {
    const f = fold(label[i]);
    for (let k = 0; k < f.length; k++) { folded += f[k]; map.push(i); }
  }
  const at = folded.indexOf(q);
  if (at < 0) return <>{label}</>;
  const start = map[at], end = (map[at + q.length - 1] ?? label.length - 1) + 1;
  return <>{label.slice(0, start)}<mark className="bg-transparent text-indigo-600 dark:text-indigo-300 font-semibold">{label.slice(start, end)}</mark>{label.slice(end)}</>;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: Source;
  placeholder?: string;
  maxLength?: number;
  /** Several values, shown as chips and stored comma-separated. */
  multiple?: boolean;
  preferGroup?: string;
  /** e.g. "10,000+ universities", shown while the list loads and when the field is empty. */
  sizeHint?: string;
  className?: string;
  id?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  'aria-label'?: string;
}

/**
 * A searchable pick list that also accepts anything typed ("Use “…”"), so a missing entry never
 * blocks anyone. Keyboard: ↑/↓ to move, Enter to pick, Esc to close, Backspace removes the last chip.
 */
export function Combobox({
  value, onChange, options, placeholder, maxLength = 150, multiple, preferGroup, sizeHint, className, id, autoFocus, onEnter, ...aria
}: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(multiple ? '' : value);
  const [active, setActive] = useState(0);
  // Typed since the list opened: filter by the text. Otherwise (just opened) show everything.
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState<Indexed[] | null>(() => (typeof options === 'function' ? null : index(options.map((o) => (typeof o === 'string' ? { label: o } : o)))));
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle');

  const chips = useMemo(() => (multiple ? value.split(',').map((s) => s.trim()).filter(Boolean) : []), [multiple, value]);

  // Keep the text in sync when the value changes from outside (e.g. a reset).
  const [lastValue, setLastValue] = useState(value);
  if (!multiple && value !== lastValue) {
    setLastValue(value);
    if (!open) setQuery(value);
  }

  const ensureLoaded = () => {
    if (loaded || typeof options !== 'function' || loadState === 'loading') return;
    setLoadState('loading');
    options().then((o) => { setLoaded(index(o)); setLoadState('idle'); }).catch(() => setLoadState('error'));
  };

  // The input repaints immediately; the (up to 10k-item) search follows at lower priority.
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(() => {
    if (!loaded) return [];
    const q = multiple || dirty ? deferredQuery : '';
    const r = search(loaded, q, preferGroup);
    return multiple ? r.filter((o) => !chips.some((c) => c.toLowerCase() === o.label.toLowerCase())) : r;
  }, [loaded, deferredQuery, preferGroup, multiple, chips, dirty]);

  const typed = multiple || dirty ? query.trim() : '';
  const exact = !!typed && results.some((r) => r.label.toLowerCase() === typed.toLowerCase());
  const offerCustom = !!typed && !exact && !(multiple && chips.some((c) => c.toLowerCase() === typed.toLowerCase()));
  const rowCount = results.length + (offerCustom ? 1 : 0);

  // Opening a filled field highlights the current choice.
  useEffect(() => {
    if (!open || multiple || !value) return;
    const i = results.findIndex((r) => r.label === value);
    if (i > 0) setActive(i); // eslint-disable-line react-hooks/set-state-in-effect -- once per open
  }, [open, loaded]); // eslint-disable-line react-hooks/exhaustive-deps -- only when the list appears

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const openList = () => { ensureLoaded(); if (!open) setDirty(false); setOpen(true); };
  const close = () => {
    setOpen(false);
    setActive(0);
    setDirty(false);
    if (multiple) setQuery('');
    else if (query.trim() !== query) { const v = query.trim(); onChange(v); setQuery(v); setLastValue(v); }
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) close(); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }); // re-bound each render so close() sees current state

  const pick = (label: string) => {
    const v = label.trim().slice(0, maxLength);
    if (!v) return;
    if (multiple) {
      const next = [...chips, v].join(', ');
      if (next.length > maxLength) return;
      onChange(next);
      setQuery('');
      setActive(0);
      inputRef.current?.focus();
    } else {
      onChange(v); setQuery(v); setLastValue(v);
      setOpen(false); setActive(0); setDirty(false);
    }
  };

  const removeChip = (i: number) => onChange(chips.filter((_, j) => j !== i).join(', '));

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) openList(); else setActive((a) => Math.min(a + 1, Math.max(rowCount - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      if (open && rowCount) {
        e.preventDefault();
        if (offerCustom && active === results.length) pick(typed);
        else if (results[active]) pick(results[active].label);
      } else if (onEnter) { e.preventDefault(); onEnter(); }
      else if (multiple && typed) { e.preventDefault(); pick(typed); }
    } else if (e.key === 'Escape') { if (open) { e.preventDefault(); e.stopPropagation(); close(); } }
    else if (e.key === 'Tab') { if (open) close(); }
    else if (e.key === 'Backspace' && multiple && !query && chips.length) removeChip(chips.length - 1);
    else if (e.key === ',' && multiple && typed) { e.preventDefault(); pick(typed); }
  };

  // Handlers reach the latest pick() through a ref so the memoised rows below stay valid.
  const pickRef = useRef(pick);
  useEffect(() => { pickRef.current = pick; });
  const hl = multiple || dirty ? deferredQuery : '';
  const current = multiple || dirty ? '' : value;
  const rows = useMemo(() => results.map((o, i) => {
    const selected = !!current && o.label === current;
    return (
      <div
        key={`${o.label}|${o.group ?? ''}`}
        id={`${listId}-${i}`}
        data-row={i}
        role="option"
        aria-selected={selected}
        onMouseMove={() => setActive((a) => (a === i ? a : i))}
        onClick={(e) => { e.preventDefault(); pickRef.current(o.label); }} // preventDefault: inside a <label>, the click would re-focus the input and reopen the list
        className={i === active ? ROW_ACTIVE : ROW}
      >
        {o.icon && <span className="text-base leading-none shrink-0" aria-hidden>{o.icon}</span>}
        <span className="min-w-0 flex-1 truncate"><Highlight label={o.label} query={hl} /></span>
        {o.hint && <span className="shrink-0 max-w-[40%] truncate text-xs text-zinc-400">{o.hint}</span>}
        {selected && <Check className="w-4 h-4 shrink-0 text-indigo-500" />}
      </div>
    );
  }), [results, active, current, hl, listId]);

  const activeId = open && rowCount ? `${listId}-${active}` : undefined;

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <div
        className={cn(
          'flex flex-wrap items-center gap-1.5 w-full rounded-xl border bg-white dark:bg-zinc-900/60 px-3 py-2 min-h-[42px] transition-[border-color,box-shadow] duration-150 cursor-text',
          open ? 'border-indigo-400 dark:border-indigo-500/60 ring-2 ring-indigo-500/30' : 'border-zinc-200 dark:border-white/10',
        )}
        onMouseDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); inputRef.current?.focus(); openList(); } }}
      >
        {multiple ? (
          <AnimatePresence initial={false}>
            {chips.map((c, i) => (
              <motion.span
                key={c}
                layout
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.14 }}
                className="inline-flex items-center gap-1 max-w-full rounded-lg bg-indigo-500/10 text-indigo-700 dark:text-indigo-200 border border-indigo-500/20 pl-2 pr-1 py-0.5 text-xs font-medium"
              >
                <span className="truncate">{c}</span>
                <button type="button" onClick={(e) => { e.preventDefault(); removeChip(i); }} aria-label={`Remove ${c}`} className="p-0.5 rounded hover:bg-indigo-500/20">
                  <X className="w-3 h-3" />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
        ) : (
          <Search className={cn('w-4 h-4 shrink-0 transition-colors', open ? 'text-indigo-500' : 'text-zinc-400')} aria-hidden />
        )}
        <input
          ref={inputRef}
          id={id}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-label={aria['aria-label']}
          autoComplete="off"
          spellCheck={false}
          value={query}
          maxLength={maxLength}
          placeholder={multiple && chips.length ? 'Add another…' : placeholder}
          onFocus={openList}
          onClick={openList}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v); setActive(0); setDirty(true);
            if (!multiple) { onChange(v); setLastValue(v); } // the form always sees what's typed
            if (!open) { ensureLoaded(); setOpen(true); }
          }}
          onKeyDown={onKeyDown}
          className="flex-1 min-w-[8rem] bg-transparent text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none py-0.5"
        />
        {!multiple && value && !open ? (
          <button type="button" aria-label="Clear" onClick={(e) => { e.preventDefault(); onChange(''); setQuery(''); inputRef.current?.focus(); }} className="p-0.5 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        ) : (
          <ChevronDown className={cn('w-4 h-4 shrink-0 text-zinc-400 transition-transform duration-200', open && 'rotate-180')} aria-hidden />
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-multiselectable={multiple || undefined}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
            style={{ transformOrigin: 'top center' }}
            onMouseDown={(e) => e.preventDefault()} // keep focus in the input
            className="absolute z-50 left-0 right-0 mt-1.5 max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-zinc-200 dark:border-white/10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-xl shadow-black/10 dark:shadow-black/40 p-1"
          >
            {loadState === 'loading' && (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-zinc-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading {sizeHint ?? 'options'}…</div>
            )}
            {loadState === 'error' && (
              <div className="px-3 py-3 text-sm text-zinc-500">Couldn’t load the list. Type the name and press Enter.</div>
            )}
            {rows}
            {offerCustom && (
              <div
                id={`${listId}-${results.length}`}
                data-row={results.length}
                role="option"
                aria-selected={false}
                onMouseMove={() => active !== results.length && setActive(results.length)}
                onClick={(e) => { e.preventDefault(); pick(typed); }}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer select-none transition-colors duration-75',
                  active === results.length ? 'bg-indigo-500/10 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400',
                  results.length > 0 && 'mt-1 border-t border-zinc-100 dark:border-white/5 rounded-t-none',
                )}
              >
                <Plus className="w-4 h-4 shrink-0 text-indigo-500" />
                <span className="min-w-0 truncate">Use “<span className="font-medium text-zinc-900 dark:text-white">{typed}</span>”</span>
              </div>
            )}
            {loadState === 'idle' && loaded && !rowCount && (
              <div className="px-3 py-3 text-sm text-zinc-500">{multiple && chips.length ? 'Type to add more.' : `Start typing to search${sizeHint ? ` ${sizeHint}` : ''}.`}</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

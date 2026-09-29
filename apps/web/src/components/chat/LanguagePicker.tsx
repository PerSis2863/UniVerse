'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LANGUAGES } from '@/lib/languages';

/**
 * A small searchable list of languages, shown in a popover next to its trigger. `offLabel` adds an
 * "off" choice at the top (picked as null). Closes on Escape or a click outside.
 */
export function LanguagePicker({ value, onPick, onClose, offLabel, title, placement = 'below', align = 'right', suggested = [] }: {
  value: string | null;
  onPick: (lang: string | null) => void;
  onClose: () => void;
  offLabel?: string;
  title: string;
  placement?: 'below' | 'above';
  align?: 'left' | 'right';
  /** Shown first (e.g. the app language). */
  suggested?: string[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // Next tick, so the click that opened the picker doesn't close it.
    const t = setTimeout(() => document.addEventListener('pointerdown', down));
    document.addEventListener('keydown', key);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [onClose]);

  const list = useMemo(() => {
    const all = Object.entries(LANGUAGES);
    const needle = q.trim().toLowerCase();
    const matches = needle ? all.filter(([code, l]) => code === needle || l.name.toLowerCase().includes(needle) || l.native.toLowerCase().includes(needle)) : all;
    const first = suggested.filter((c) => matches.some(([code]) => code === c));
    return [...first.map((c) => [c, LANGUAGES[c]] as const), ...matches.filter(([code]) => !first.includes(code))];
  }, [q, suggested]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={title}
      className={cn(
        'absolute z-40 w-64 max-w-[calc(100vw-2rem)] rounded-2xl bg-white dark:bg-[#161b2e] border border-zinc-200 dark:border-white/10 shadow-2xl overflow-hidden',
        placement === 'below' ? 'top-full mt-2' : 'bottom-full mb-2',
        align === 'right' ? 'right-0' : 'left-0',
      )}
    >
      <p className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</p>
      <div className="px-3 pb-2">
        <label className="flex items-center gap-2 rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-2.5">
          <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search languages"
            aria-label="Search languages"
            className="w-full bg-transparent py-1.5 text-sm outline-none text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400"
          />
        </label>
      </div>
      <div className="max-h-64 overflow-y-auto pb-1.5">
        {offLabel && !q && (
          <Row selected={value === null} onClick={() => onPick(null)} label={offLabel} />
        )}
        {list.map(([code, l]) => (
          <Row key={code} selected={value === code} onClick={() => onPick(code)} label={l.name} hint={l.native !== l.name ? l.native : undefined} />
        ))}
        {!list.length && <p className="px-3 py-3 text-sm text-zinc-500">No language matches “{q}”.</p>}
      </div>
    </div>
  );
}

function Row({ selected, onClick, label, hint }: { selected: boolean; onClick: () => void; label: string; hint?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={cn('w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-white/[0.06]', selected ? 'text-indigo-600 dark:text-indigo-300 font-semibold' : 'text-zinc-700 dark:text-zinc-200')}
    >
      <span className="flex-1 truncate">{label}{hint && <span className="ml-1.5 text-xs font-normal text-zinc-400">{hint}</span>}</span>
      {selected && <Check className="w-4 h-4 shrink-0" />}
    </button>
  );
}

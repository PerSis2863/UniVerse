'use client';

import { useId, useRef, useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { authedJson } from '@/lib/authed-fetch';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';

// A one-line input that suggests people after "@" (Stage 4 · 3.9): the people who can see this doc,
// task board or whiteboard (/api/mentions). Picking one writes "@First Last ", which the server
// turns into a notification (src/server/mentions.ts). Arrow keys, Enter or Tab pick; Escape closes.

type Person = { id: string; name: string; avatar: string | null };

export function MentionInput({ kind, id, value, onChange, onSubmit, className, ...rest }: {
  kind: 'doc' | 'tasks' | 'board'; id: string; value: string; onChange: (v: string) => void; onSubmit?: () => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onSubmit'>) {
  const ref = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  // Asked for the first time someone types "@".
  const { data } = useSWR<{ people: Person[] }>(query !== null ? `/api/mentions?kind=${kind}&id=${id}` : null, authedJson, { revalidateOnFocus: false });
  const list = query === null ? [] : (data?.people ?? []).filter((p) => p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(query)) || p.name.toLowerCase().startsWith(query)).slice(0, 6);

  const track = (v: string, caret: number | null) => {
    const upto = v.slice(0, caret ?? v.length);
    const m = /(?:^|\s)@([\p{L}\p{N}.'-]*)$/u.exec(upto);
    setQuery(m ? m[1].toLowerCase() : null);
    setActive(0);
  };
  const pick = (p: Person) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@[\p{L}\p{N}.'-]*$/u, `@${p.name} `);
    const next = before + value.slice(caret);
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); });
  };

  return (
    <div className="relative flex-1 min-w-0">
      <input
        ref={ref}
        {...rest}
        value={value}
        className={className}
        onChange={(e) => { onChange(e.target.value); track(e.target.value, e.target.selectionStart); }}
        onKeyDown={(e) => {
          if (list.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % list.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + list.length) % list.length); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(list[active]); return; }
            if (e.key === 'Escape') { setQuery(null); return; }
          }
          if (e.key === 'Enter' && onSubmit) { e.preventDefault(); onSubmit(); }
        }}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        role="combobox"
        aria-controls={listId}
        aria-expanded={list.length > 0}
        aria-autocomplete="list"
      />
      <AnimatePresence>
        {list.length > 0 && (
          <motion.ul id={listId} role="listbox" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={spring.snappy}
            className="absolute bottom-full mb-1 left-0 z-50 w-64 max-w-full py-1 rounded-xl bg-white dark:bg-[#121830] border border-zinc-200 dark:border-white/10 shadow-2xl">
            {list.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === active}>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(p); }} className={cn('w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-sm', i === active ? 'bg-indigo-500/10' : 'hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}>
                  <Avatar name={p.name} src={p.avatar} size={22} />
                  <span className="truncate text-zinc-800 dark:text-zinc-100">{p.name}</span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

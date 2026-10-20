'use client';

import { useEffect, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';

// Keyboard shortcuts (Stage 5 · Q23): "?" shows them all, "/" opens search, anywhere in the app
// except while typing. Loaded with the rest of the idle shell (DeferredShell).

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || !!el.closest?.('[role="dialog"], [contenteditable="true"]'));
};

function groups(mod: string): { title: string; keys: [string[], string][] }[] {
  return [
    { title: 'Everywhere', keys: [[[mod, 'K'], 'Search and go anywhere'], [['/'], 'Search'], [['?'], 'This list'], [['Esc'], 'Close a sheet or menu']] },
    { title: 'Messages', keys: [[['Enter'], 'Send'], [['Shift', 'Enter'], 'New line']] },
    { title: 'Writing and editing', keys: [[[mod, 'S'], 'Save a lesson page'], [[mod, 'Z'], 'Undo (slides, photos, whiteboards)'], [[mod, 'Shift', 'Z'], 'Redo'], [[mod, 'D'], 'Duplicate (slides)']] },
    { title: 'Sound and video editors', keys: [[['Space'], 'Play or pause'], [['K'], 'Play or pause']] },
    { title: 'Registers', keys: [[['Space'], 'Mark the selected student']] },
  ];
}

export default function KeyboardHelp() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || typing(e.target)) return;
      if (e.key === '?') { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === '/') { e.preventDefault(); window.dispatchEvent(new Event('universe:open-palette')); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  if (!open) return null;
  return (
    <Sheet title="Keyboard shortcuts" onClose={() => setOpen(false)}>
      <div className="space-y-5">
        {groups(isMac() ? '⌘' : 'Ctrl').map((g) => (
          <section key={g.title}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">{g.title}</h3>
            <dl className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {g.keys.map(([keys, what]) => (
                <div key={what + keys.join()} className="flex items-center justify-between gap-3 py-2">
                  <dt className="text-sm text-zinc-700 dark:text-zinc-200">{what}</dt>
                  <dd className="flex items-center gap-1 shrink-0">
                    {keys.map((k) => <kbd key={k} className="min-w-7 px-1.5 py-0.5 rounded-md border border-zinc-300 dark:border-white/15 bg-zinc-50 dark:bg-white/[0.06] text-xs font-semibold text-zinc-700 dark:text-zinc-200 text-center">{k}</kbd>)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Sheet>
  );
}

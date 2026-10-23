'use client';

import { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { ColorGrid, Popover } from '@/components/ui/Menu';
import { MenuList } from '@/components/ui/Menu';
import { cn } from '@/lib/utils';

// The sheet tabs under a spreadsheet (Office suite): switch, add, rename (double-click), copy,
// move, colour and delete sheets.

export interface TabInfo { id: string; name: string; color?: string }

export function SheetTabs({ tabs, active, canEdit, onPick, onAdd, onRename, onCopy, onMove, onColor, onDelete, status }: {
  tabs: TabInfo[]; active: string; canEdit: boolean;
  onPick: (id: string) => void; onAdd: () => void; onRename: (id: string, name: string) => void; onCopy: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void; onColor: (id: string, c: string | null) => void; onDelete: (id: string) => void;
  status?: React.ReactNode;
}) {
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const done = () => { if (renaming) { onRename(renaming.id, renaming.name); setRenaming(null); } };
  const index = tabs.findIndex((t) => t.id === active);
  const current = tabs[index];
  return (
    <div className="flex items-center gap-1 px-2 py-1 border-t border-zinc-200/70 dark:border-white/[0.06] bg-zinc-50/80 dark:bg-[#06141b]/80 min-h-10">
      {canEdit && <button type="button" onClick={onAdd} aria-label="Add a sheet" title="Add a sheet" className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-white/10"><Plus className="w-4 h-4" /></button>}
      <div role="tablist" aria-label="Sheets" className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] flex-1 min-w-0">
        {tabs.map((t) => renaming?.id === t.id ? (
          <input key={t.id} autoFocus value={renaming.name} maxLength={31} aria-label="Sheet name" onChange={(e) => setRenaming({ id: t.id, name: e.target.value })} onBlur={done}
            onKeyDown={(e) => { if (e.key === 'Enter') done(); if (e.key === 'Escape') setRenaming(null); }} className="h-8 w-32 px-2 rounded-lg border border-indigo-400 bg-white dark:bg-zinc-900 text-sm" />
        ) : (
          <button key={t.id} type="button" role="tab" aria-selected={t.id === active} onClick={() => onPick(t.id)} onDoubleClick={() => canEdit && setRenaming({ id: t.id, name: t.name })}
            className={cn('h-8 px-3 shrink-0 rounded-lg border-b-2 text-sm whitespace-nowrap', t.id === active ? 'bg-white dark:bg-[#11212d] shadow-sm font-semibold text-indigo-700 dark:text-indigo-200' : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-white/[0.06]')} style={{ borderBottomColor: t.color ?? 'transparent' }}>{t.name}</button>
        ))}
      </div>
      {canEdit && current && (
        <Popover label={`Options for ${current.name}`} button={<ChevronDown className="w-3.5 h-3.5" />} className="h-8 min-w-8 px-1 shrink-0">
          {(close) => (
            <div>
              <MenuList label={`Options for ${current.name}`} onDone={close} items={[
                { label: 'Rename', onSelect: () => setRenaming({ id: current.id, name: current.name }) },
                { label: 'Make a copy', onSelect: () => onCopy(current.id) },
                { label: 'Move left', onSelect: () => onMove(current.id, -1), disabled: index === 0 },
                { label: 'Move right', onSelect: () => onMove(current.id, 1), disabled: index === tabs.length - 1 },
                { label: 'Delete', onSelect: () => onDelete(current.id), disabled: tabs.length < 2 },
              ]} />
              <p className="px-3 pt-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Tab colour</p>
              <ColorGrid label="Tab colour" value={current.color} onPick={(c) => { onColor(current.id, c); close(); }} />
            </div>
          )}
        </Popover>
      )}
      {status}
    </div>
  );
}

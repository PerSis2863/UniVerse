'use client';

import { useState } from 'react';
import { Copy, Download, Maximize2, Minimize2, MoreHorizontal, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { downloadCsv } from '@/lib/csv-download';
import { cn } from '@/lib/utils';
import { Menu, type MenuItem } from './Menu';

// M139: the Ballast cards' header (title, a grey line under it, "···" at the end). The menu works on
// the card it sits in, whatever the card shows: full screen (where the browser can), copy its text,
// and download its table as a CSV file when it has one. A card can add its own actions first (`items`).

/** What counts as the card around the menu. */
const CARD = '[data-card], .panel, .card, .ins-board, section';

const cellText = (c: Element) => ((c as HTMLElement).innerText ?? c.textContent ?? '').replace(/\s+/g, ' ').trim();

/** A table's column names and rows, as shown on the screen. */
function tableData(t: HTMLTableElement) {
  const rows = [...t.rows];
  const first = rows[0];
  const headed = !!first && (first.parentElement?.tagName === 'THEAD' || [...first.cells].every((c) => c.tagName === 'TH'));
  return { head: headed ? [...first.cells].map(cellText) : [], body: rows.slice(headed ? 1 : 0).map((r) => [...r.cells].map(cellText)) };
}

const fileName = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'table';

/** The "···" button and its menu. */
export function CardMenu({ title, items = [], className }: { title: string; items?: MenuItem[]; className?: string }) {
  // The card, read when the menu is about to open (a press or focus), so the list fits it.
  const [seen, setSeen] = useState<{ card: HTMLElement | null; table: boolean; full: boolean; canFull: boolean }>({ card: null, table: false, full: false, canFull: false });
  const look = (e: React.SyntheticEvent<HTMLElement>) => {
    const c = e.currentTarget.closest<HTMLElement>(CARD);
    setSeen({ card: c, table: !!c?.querySelector('table'), full: !!c && document.fullscreenElement === c, canFull: !!c && document.fullscreenEnabled === true });
  };
  const c = seen.card;
  const own: MenuItem[] = [];
  if (seen.canFull) own.push({
    label: seen.full ? 'Exit full screen' : 'Full screen',
    icon: seen.full ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />,
    onSelect: () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else c?.requestFullscreen().catch(() => toast.error('Full screen isn’t available here.'));
    },
  });
  own.push({
    label: 'Copy', icon: <Copy className="w-4 h-4" />,
    onSelect: () => {
      if (!c) return;
      navigator.clipboard.writeText(c.innerText.trim()).then(() => toast.success('Copied'), () => toast.error('Copy didn’t work here: select the text instead.'));
    },
  });
  if (seen.table) own.push({
    label: 'Download as CSV', icon: <Download className="w-4 h-4" />,
    onSelect: () => {
      const t = c?.querySelector('table');
      if (!t) return;
      const { head, body } = tableData(t);
      downloadCsv(fileName(title), head, body);
    },
  });
  return (
    <span onPointerDown={look} onFocus={look} className={cn('inline-flex shrink-0 -my-1 -me-1.5', className)}>
      <Menu label={`More for ${title}`} button={<MoreHorizontal className="w-4 h-4" />} items={items.length ? [...items, 'sep', ...own] : own} className="text-zinc-500 dark:text-zinc-400" />
    </span>
  );
}

/**
 * A card's header in the Ballast style: the title (with an optional grey icon), a grey line under it,
 * the card's own controls (`children`), then "···".
 */
export function CardHead({ title, sub, icon: Icon, as: H = 'h2', items, children, className }: {
  title: string; sub?: React.ReactNode; icon?: LucideIcon; as?: 'h2' | 'h3'; items?: MenuItem[]; children?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('flex items-start gap-2 mb-4', className)}>
      <div className="min-w-0 flex-1">
        <H className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden />}
          {title}
        </H>
        {sub && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{sub}</p>}
      </div>
      {children}
      <CardMenu title={title} items={items} />
    </div>
  );
}

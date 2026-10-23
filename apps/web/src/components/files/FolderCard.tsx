'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { reducedMotion } from '@/lib/page-transition';

// A folder that opens (M5, the owner's folder video): a back panel with a tab on its top right, a
// frosted white front flap with a tab on its top left, and the folder's first files tucked between them.
// Pointing at it (or focusing it) tips the flap forward and the files rise out of it, fanned; the
// round button adds a file ("+", a new sheet peeks out as you point at it) or opens the folder's menu.
// On a touch screen a tap plays the opening, then opens the folder. Used for every folder of files:
// My files, spaces' files, scheduled reports, receipts. Styles: globals.css, "M5 · Folders".

export type FolderPeek = { name: string; meta?: string; image?: string; kind?: 'doc' | 'image' | 'sheet' | 'folder' };

// The two panels' outlines, as fractions of the box (so they stretch with it).
const BACK = 'M0,0.27 Q0,0.17 0.055,0.17 L0.43,0.17 C0.49,0.17 0.5,0 0.57,0 L0.945,0 Q1,0 1,0.09 L1,0.91 Q1,1 0.945,1 L0.055,1 Q0,1 0,0.91 Z';
const FRONT = 'M0,0.11 Q0,0 0.055,0 L0.36,0 C0.43,0 0.44,0.15 0.52,0.15 L0.945,0.15 Q1,0.15 1,0.26 L1,0.89 Q1,1 0.945,1 L0.055,1 Q0,1 0,0.89 Z';

// Streaks of colour for the back panel, in UniVerse's own colours (indigo, violet, fuchsia, and the
// blues and pinks beside them). A list gives each folder the next set, so folders side by side differ.
const PALETTES = [
  ['#1e1b4b', '#6366f1', '#e0e7ff', '#a855f7'],
  ['#2e1065', '#d946ef', '#fae8ff', '#7c3aed'],
  ['#172554', '#3b82f6', '#ede9fe', '#8b5cf6'],
  ['#3b0764', '#f43f5e', '#ffe4e6', '#c026d3'],
  ['#0c1a3a', '#06b6d4', '#e0f2fe', '#6366f1'],
  ['#2e1065', '#a78bfa', '#fdf2f8', '#ec4899'],
];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const palette = (seed: string, index?: number) => PALETTES[(index ?? hash(seed)) % PALETTES.length];
export const folderArt = (seed: string, index?: number) => {
  const [a, b, c, d] = palette(seed, index);
  const angle = 100 + (hash(`${seed}a`) % 40);
  return `linear-gradient(${angle}deg, ${a} 0%, ${a} 12%, ${b} 21%, ${c} 29%, ${d} 38%, ${a} 47%, ${b} 57%, ${c} 64%, ${d} 76%, ${a} 100%)`;
};
/** The haze the back's colours leave on the frosted front flap (soft glows: no blur filter, which Safari renders badly here). */
export const folderFrost = (seed: string, index?: number) => {
  const [, b, , d] = palette(seed, index);
  return `radial-gradient(70% 90% at 12% 0%, ${b}88, transparent 70%), radial-gradient(60% 80% at 88% 0%, ${d}77, transparent 72%), radial-gradient(50% 60% at 50% 10%, ${b}33, transparent 80%)`;
};

/** "PDF · 1.2 MB" for a file. */
export function fileMeta(name: string, size?: number) {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toUpperCase();
  const s = size === undefined ? '' : size < 1024 ? `${size} B` : size < 1024 ** 2 ? `${Math.round(size / 1024)} KB` : size < 1024 ** 3 ? `${(size / 1024 ** 2).toFixed(1)} MB` : `${(size / 1024 ** 3).toFixed(1)} GB`;
  return [ext, s].filter(Boolean).join(' · ');
}

const FAN = [
  { x: '-9%', y: '-34%', r: '-7deg' },
  { x: '1%', y: '-27%', r: '-1.5deg' },
  { x: '10%', y: '-19%', r: '5deg' },
];

export function FolderCard({ name, sub, peek, tone, seed, index, onOpen, action, label, className }: {
  name: string;
  /** Under the name: "3 items", or a date on dark folders ("Wed 19 Aug"). */
  sub: string;
  peek: FolderPeek[];
  tone?: 'art' | 'light' | 'dark';
  seed?: string;
  /** Its place in a list of folders: picks its colours, so neighbours never match. */
  index?: number;
  onOpen: () => void;
  action?: { kind: 'add' | 'more'; label: string; onClick: () => void; menu?: ReactNode };
  /** What a screen reader hears for the folder (default: "Open <name>, <sub>"). */
  label?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  // Always colourful unless a screen asks for the white or dark folder.
  const look = tone ?? 'art';
  const [opening, setOpening] = useState(false);
  // Whether the last press was a finger (then the opening plays before the folder's page comes).
  const touch = useRef(false);
  // Pictures load only once someone points at the folder (a folder list shouldn't download them all).
  const [warm, setWarm] = useState(false);
  const files = peek.slice(0, 3);

  const open = (byTouch: boolean) => {
    if (!byTouch || reducedMotion()) return onOpen();
    // A tap: the folder opens in front of you first, then its page comes.
    setWarm(true);
    setOpening(true);
    setTimeout(() => { setOpening(false); onOpen(); }, 380);
  };

  return (
    <div className={cn('folder-card', `folder-${look}`, opening && 'is-open', !files.length && 'is-empty', className)} onPointerEnter={() => setWarm(true)} onFocus={() => setWarm(true)}>
      <svg aria-hidden width="0" height="0" className="absolute">
        <defs>
          <clipPath id={`${id}b`} clipPathUnits="objectBoundingBox"><path d={BACK} /></clipPath>
          <clipPath id={`${id}f`} clipPathUnits="objectBoundingBox"><path d={FRONT} /></clipPath>
        </defs>
      </svg>
      <button type="button" className="folder-hit" aria-label={label ?? `Open ${name}, ${sub}`}
        onPointerDown={(e) => { touch.current = e.pointerType === 'touch' || e.pointerType === 'pen'; }}
        onClick={() => { open(touch.current); touch.current = false; }} />
      <div aria-hidden className="folder-stack">
        <div className="folder-back" style={{ clipPath: `url(#${id}b)`, WebkitClipPath: `url(#${id}b)` }}>
          {look !== 'light' && <div className="folder-art" style={{ background: folderArt(seed ?? name, index) }} />}
        </div>
        <div className="folder-files">
          {files.map((f, i) => {
            const at = FAN[files.length === 1 ? 1 : files.length === 2 ? i + (i ? 1 : 0) : i];
            const picture = warm && f.image;
            return (
              <div key={i} className={cn('folder-file', picture || f.kind === 'image' ? 'is-picture' : 'is-doc', f.kind === 'folder' && 'is-folder')}
                style={{ '--i': i, '--fx': at.x, '--fy': at.y, '--fr': at.r, ...(picture ? { backgroundImage: `url("${f.image}")` } : f.kind === 'image' ? { background: folderArt(`${f.name}${i}`) } : {}) } as Record<string, string | number> as React.CSSProperties}>
                <span className="folder-file-name">{f.name}</span>
                {f.meta && <span className="folder-file-meta">{f.meta}</span>}
                {!picture && f.kind !== 'image' && <span className="folder-file-lines" />}
              </div>
            );
          })}
          {action?.kind === 'add' && <div className="folder-file folder-new is-doc" style={{ '--fx': '4%', '--fy': '-16%', '--fr': '2deg' } as React.CSSProperties}><span className="folder-file-name">New file</span><span className="folder-file-meta">Add</span><span className="folder-file-lines" /></div>}
        </div>
        <div className="folder-front" style={{ clipPath: `url(#${id}f)`, WebkitClipPath: `url(#${id}f)` }}>
          {look !== 'light' && <div className="folder-frost" style={{ background: folderFrost(seed ?? name, index) }} />}
          <div className="folder-label">
            <p className="folder-name">{name}</p>
            <p className="folder-sub">{sub}</p>
          </div>
        </div>
      </div>
      {action && (
        <button type="button" onClick={action.onClick} aria-label={action.label} title={action.label} className={cn('folder-action', action.kind === 'add' ? 'folder-action-add' : 'folder-action-more')}>
          {action.kind === 'add' ? <Plus className="w-5 h-5" strokeWidth={2.2} /> : <MoreDots />}
        </button>
      )}
      {action?.menu}
    </div>
  );
}

/** The "ooo" of the folder's menu button: three open rings. */
function MoreDots() {
  return (
    <svg viewBox="0 0 30 12" className="w-7 h-3" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <circle cx="5" cy="6" r="3.6" /><circle cx="15" cy="6" r="3.6" /><circle cx="25" cy="6" r="3.6" />
    </svg>
  );
}


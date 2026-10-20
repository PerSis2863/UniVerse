'use client';

import { Fragment, memo } from 'react';
import { m as motion } from 'framer-motion';
import { ImagePlus } from 'lucide-react';
import { H, type Item, type Para, type Slide, type Theme } from '@/lib/slides/deck';
import { colorOf, fontOf, shapePath } from '@/lib/slides/render';
import { cn } from '@/lib/utils';

// One slide drawn on its 1600 × 900 canvas (1200 × 900 for 4:3) and scaled to fit (Office suite).
// Used for editing, the thumbnails, presenting and the history. Text is drawn from its paragraphs
// and runs (never HTML), so anyone's edits are safe to show.

const PLACEHOLDER: Record<NonNullable<Item['role']>, string> = { title: 'Click to add a title', subtitle: 'Click to add a subtitle', body: 'Click to add text' };

export function Paras({ paras, align, linkable }: { paras: Para[]; align?: Item['align']; linkable?: boolean }) {
  const out: React.ReactNode[] = [];
  let i = 0;
  const line = (p: Para) => p.runs.length ? p.runs.map((r, k) => {
    const style: React.CSSProperties = { color: r.color, fontWeight: r.b ? 700 : undefined, fontStyle: r.i ? 'italic' : undefined, textDecoration: [r.u && 'underline', r.s && 'line-through'].filter(Boolean).join(' ') || undefined };
    return r.link && linkable ? <a key={k} href={r.link} target="_blank" rel="noopener noreferrer" style={style} className="underline">{r.t}</a> : <span key={k} style={style}>{r.t}</span>;
  }) : <br />;
  while (i < paras.length) {
    const p = paras[i];
    const a = p.align ?? align;
    if (p.bullet) {
      const kind = p.bullet, start = i;
      while (i < paras.length && paras[i].bullet === kind) i++;
      const List = kind === 'num' ? 'ol' : 'ul';
      out.push(<List key={start} className={cn('m-0 ps-[1.2em]', kind === 'num' ? 'list-decimal' : 'list-disc')}>{paras.slice(start, i).map((q, k) => <li key={k} style={{ textAlign: q.align ?? align, marginLeft: q.level ? `${q.level * 1.2}em` : undefined }} className="my-[0.15em]">{line(q)}</li>)}</List>);
    } else { out.push(<div key={i} style={{ textAlign: a }}>{line(p)}</div>); i++; }
  }
  return <>{out}</>;
}

function ItemBox({ it, theme, mode, hideText }: { it: Item; theme: Theme; mode: 'edit' | 'thumb' | 'show'; hideText: boolean }) {
  const text = it.paras?.length ? it.paras : null;
  const placeholder = mode === 'edit' && it.role && !text ? PLACEHOLDER[it.role] : null;
  const font: React.CSSProperties = { fontFamily: `"${fontOf(it, theme)}", system-ui, sans-serif`, fontSize: it.size ?? 32, color: colorOf(it, theme), lineHeight: 1.2 };
  const textBlock = (pad: string) => (text || placeholder) && !hideText ? (
    <div className={cn('absolute inset-0 flex flex-col overflow-hidden', pad, it.valign === 'middle' ? 'justify-center' : it.valign === 'bottom' ? 'justify-end' : 'justify-start')} style={font}>
      {text ? <Paras paras={text} align={it.align} linkable={mode === 'show'} /> : <div style={{ textAlign: it.align, color: theme.muted, opacity: 0.6 }}>{placeholder}</div>}
    </div>
  ) : null;
  if (it.kind === 'image') {
    if (it.src) return <img src={it.src} alt={it.alt ?? ''} draggable={false} className="absolute inset-0 w-full h-full select-none" style={{ objectFit: it.fit ?? 'cover' }} />;
    return mode === 'edit' ? <div className="absolute inset-0 border-4 border-dashed rounded-xl flex flex-col items-center justify-center gap-3" style={{ borderColor: theme.muted, color: theme.muted }}><ImagePlus style={{ width: 72, height: 72 }} /><span style={{ fontSize: 30 }}>Double-click to add a picture</span></div> : null;
  }
  if (it.kind === 'shape') {
    const line = it.shape === 'line';
    return (
      <>
        <svg width="100%" height="100%" viewBox={`0 0 ${it.w} ${it.h}`} preserveAspectRatio="none" className="absolute inset-0 overflow-visible" aria-hidden>
          <path d={shapePath(it.shape ?? 'rect', it.w, it.h)} fill={line ? 'none' : it.fill ?? theme.accent} stroke={it.line ?? (line ? theme.text : 'none')} strokeWidth={it.lineW ?? (line ? 4 : 0)} vectorEffect="non-scaling-stroke" />
        </svg>
        {textBlock('p-3')}
      </>
    );
  }
  return textBlock('px-3 py-2');
}

function Band({ theme, W }: { theme: Theme; W: number }) {
  if (theme.band === 'left') return <div aria-hidden className="absolute start-0 top-0 bottom-0" style={{ width: 24, background: theme.accent }} />;
  if (theme.band === 'top') return <div aria-hidden className="absolute start-0 end-0 top-0" style={{ height: 18, background: theme.accent }} />;
  if (theme.band === 'bottom') return <div aria-hidden className="absolute rounded" style={{ left: W * 0.06, right: W * 0.06, bottom: 36, height: 6, background: theme.accent, opacity: 0.85 }} />;
  return null;
}

const ANIM = {
  fade: { initial: { opacity: 0 }, animate: { opacity: 1 } },
  fly: { initial: { opacity: 0, y: 120 }, animate: { opacity: 1, y: 0 } },
  zoom: { initial: { opacity: 0, scale: 0.6 }, animate: { opacity: 1, scale: 1 } },
};

export const SlideView = memo(function SlideView({ slide, theme, W, scale, mode, editingId, override, step, label, className }: {
  slide: Slide; theme: Theme; W: number; scale: number; mode: 'edit' | 'thumb' | 'show';
  editingId?: string | null;
  /** Items being dragged or resized, drawn where they're going. */
  override?: Map<string, Partial<Item>>;
  /** Presenting: how many of the slide's animated items have appeared. */
  step?: number;
  label?: string; className?: string;
}) {
  let animIndex = 0;
  return (
    <div role={label ? 'img' : undefined} aria-label={label} className={cn('relative overflow-hidden select-none', className)} style={{ width: W * scale, height: H * scale }}>
      <div className="absolute start-0 top-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})`, background: slide.bg ?? theme.bg }}>
        <Band theme={theme} W={W} />
        {slide.items.map((raw) => {
          const it = override?.has(raw.id) ? { ...raw, ...override.get(raw.id) } : raw;
          const style: React.CSSProperties = { left: it.x, top: it.y, width: it.w, height: it.h, transform: it.rot ? `rotate(${it.rot}deg)` : undefined };
          const box = <ItemBox it={it} theme={theme} mode={mode} hideText={editingId === it.id} />;
          if (mode === 'show' && it.anim) {
            const k = animIndex++;
            const shown = (step ?? Infinity) > k;
            return <Fragment key={it.id}>{shown && <motion.div className="absolute" style={style} initial={ANIM[it.anim].initial} animate={ANIM[it.anim].animate} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>{box}</motion.div>}</Fragment>;
          }
          return <div key={it.id} data-item={it.id} className="absolute" style={style}>{box}</div>;
        })}
      </div>
    </div>
  );
});

/** How many items on a slide appear on clicks. */
export const stepsOf = (s: Slide) => s.items.filter((i) => i.anim).length;

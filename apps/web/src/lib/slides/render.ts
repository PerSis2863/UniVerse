import { H, plainText, themeOf, widthOf, type DeckJSON, type Item, type Para, type Run, type ShapeKind, type Slide, type Theme } from './deck';

// A presentation as HTML (Office suite): what the text editor starts from, printing / PDF (one
// slide a page), the saved versions (search reads them) and the history's preview. Built from the
// deck's data with everything escaped, so it's safe to show. Import-free; tested in render.test.ts.

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function runHtml(r: Run): string {
  const st = [r.color && `color:${r.color}`, r.b && 'font-weight:700', r.i && 'font-style:italic', (r.u || r.s) && `text-decoration:${[r.u && 'underline', r.s && 'line-through'].filter(Boolean).join(' ')}`].filter(Boolean).join(';');
  const inner = esc(r.t);
  const span = st ? `<span style="${st}">${inner}</span>` : inner;
  return r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener noreferrer">${span}</a>` : span;
}

/** Paragraphs as HTML: bulleted ones in lists, the rest as divs (empty ones keep their height). */
export function parasHtml(paras: Para[], align?: Item['align']): string {
  let out = '', list: 'ul' | 'ol' | null = null;
  const close = () => { if (list) { out += `</${list}>`; list = null; } };
  for (const p of paras) {
    const a = p.align ?? align;
    const style = a && a !== 'left' ? ` style="text-align:${a}"` : '';
    const body = p.runs.map(runHtml).join('') || '<br>';
    if (p.bullet) {
      const want = p.bullet === 'num' ? 'ol' : 'ul';
      if (list !== want) { close(); out += `<${want}>`; list = want; }
      out += `<li${style}${p.level ? ` data-level="${p.level}"` : ''}>${body}</li>`;
    } else { close(); out += `<div${style}>${body}</div>`; }
  }
  close();
  return out;
}

/** An SVG path for a shape filling w × h. */
export function shapePath(shape: ShapeKind, w: number, h: number): string {
  switch (shape) {
    case 'ellipse': return `M ${w / 2} 0 A ${w / 2} ${h / 2} 0 1 1 ${w / 2 - 0.01} 0 Z`;
    case 'triangle': return `M ${w / 2} 0 L ${w} ${h} L 0 ${h} Z`;
    case 'diamond': return `M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`;
    case 'arrow': return `M 0 ${h * 0.3} L ${w * 0.62} ${h * 0.3} L ${w * 0.62} 0 L ${w} ${h / 2} L ${w * 0.62} ${h} L ${w * 0.62} ${h * 0.7} L 0 ${h * 0.7} Z`;
    case 'star': {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 0.4 : 1; pts.push(`${(w / 2 + (Math.cos(a) * w * rr) / 2).toFixed(1)} ${(h / 2 + (Math.sin(a) * h * rr) / 2).toFixed(1)}`); }
      return `M ${pts.join(' L ')} Z`;
    }
    case 'line': return `M 0 ${h / 2} L ${w} ${h / 2}`;
    case 'round': { const r = Math.min(w, h) * 0.15; return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`; }
    default: return `M 0 0 H ${w} V ${h} H 0 Z`;
  }
}

export const fontOf = (it: Item, t: Theme) => it.font ?? (it.role === 'title' ? t.title : t.body);
export const colorOf = (it: Item, t: Theme) => it.color ?? (it.role === 'subtitle' ? t.muted : t.text);

function itemHtml(it: Item, t: Theme): string {
  const box = `position:absolute;left:${it.x}px;top:${it.y}px;width:${it.w}px;height:${it.h}px;${it.rot ? `transform:rotate(${it.rot}deg);` : ''}`;
  const text = it.paras?.length ? `<div style="display:flex;flex-direction:column;justify-content:${it.valign === 'middle' ? 'center' : it.valign === 'bottom' ? 'flex-end' : 'flex-start'};height:100%;font-family:'${fontOf(it, t).replace(/'/g, '')}',sans-serif;font-size:${it.size ?? 32}px;color:${colorOf(it, t)};line-height:1.2">${parasHtml(it.paras, it.align)}</div>` : '';
  if (it.kind === 'image') return it.src ? `<img src="${esc(it.src)}" alt="${esc(it.alt ?? '')}" style="${box}object-fit:${it.fit ?? 'cover'}">` : '';
  if (it.kind === 'shape') {
    const svg = `<svg width="${it.w}" height="${it.h}" viewBox="0 0 ${it.w} ${it.h}" style="position:absolute;inset:0;overflow:visible"><path d="${shapePath(it.shape ?? 'rect', it.w, it.h)}" fill="${it.shape === 'line' ? 'none' : it.fill ?? t.accent}" stroke="${it.line ?? (it.shape === 'line' ? t.text : 'none')}" stroke-width="${it.lineW ?? (it.shape === 'line' ? 4 : 0)}"/></svg>`;
    return `<div style="${box}">${svg}<div style="position:absolute;inset:0;padding:12px">${text}</div></div>`;
  }
  return `<div style="${box}padding:8px 12px;box-sizing:border-box">${text}</div>`;
}

/** The decoration a theme puts behind every slide. */
export function bandHtml(t: Theme, W: number): string {
  if (t.band === 'left') return `<div style="position:absolute;left:0;top:0;bottom:0;width:24px;background:${t.accent}"></div>`;
  if (t.band === 'top') return `<div style="position:absolute;left:0;right:0;top:0;height:18px;background:${t.accent}"></div>`;
  if (t.band === 'bottom') return `<div style="position:absolute;left:${W * 0.06}px;right:${W * 0.06}px;bottom:36px;height:6px;border-radius:3px;background:${t.accent};opacity:.85"></div>`;
  return '';
}

/** One slide as HTML at its own size (W × 900). */
export function slideHtml(s: Slide, deck: Pick<DeckJSON, 'theme' | 'ratio'>): string {
  const t = themeOf(deck.theme), W = widthOf(deck.ratio);
  return `<div class="slide" style="position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${s.bg ?? t.bg}">${bandHtml(t, W)}${s.items.map((i) => itemHtml(i, t)).join('')}</div>`;
}

export const PRINT_DECK_CSS = (W: number) => `@page{size:${W}px ${H}px;margin:0}html,body{margin:0;padding:0}.slide{page-break-after:always;break-after:page}ul,ol{margin:0;padding-left:1.2em}li{margin:.15em 0}a{color:inherit}`;

/** The whole deck as HTML, slide after slide (for printing or a saved version). */
export function deckHtml(d: DeckJSON, opts: { notes?: boolean; max?: number } = {}): string {
  let out = '';
  for (const [i, s] of d.slides.entries()) {
    const part = `${slideHtml(s, d)}${opts.notes && s.notes ? `<p class="notes"><strong>Slide ${i + 1} notes:</strong> ${esc(s.notes)}</p>` : ''}`;
    if (opts.max && out.length + part.length > opts.max) break;
    out += part;
  }
  return out;
}

/** A deck as plain readable HTML for search and the history (titles, text, notes). */
export function deckReadable(d: DeckJSON, max = 380_000): string {
  let out = '';
  for (const [i, s] of d.slides.entries()) {
    const title = s.items.find((x) => x.role === 'title');
    const rest = s.items.filter((x) => x !== title && x.paras?.length);
    const part = `<h2>${i + 1}. ${esc(plainText(title?.paras) || 'Slide')}</h2>${rest.map((x) => parasHtml(x.paras!)).join('')}${s.notes ? `<p><em>${esc(s.notes)}</em></p>` : ''}`;
    if (out.length + part.length > max) break;
    out += part;
  }
  return out || '<p></p>';
}

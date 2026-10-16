// Presentations (Stage 5 · Office suite): a deck as plain data — slides holding text boxes, shapes
// and pictures placed on a 1600 × 900 canvas (1200 × 900 for 4:3), with themes, layouts, speaker
// notes, transitions and build animations. Text is paragraphs of runs (bold, italic, colour…),
// never HTML, so it's drawn safely from anyone's edits. Anything from outside goes through
// cleanDeck. Import-free; tested in deck.test.ts.

export interface Run { t: string; b?: true; i?: true; u?: true; s?: true; color?: string; link?: string }
export interface Para { runs: Run[]; bullet?: 'dot' | 'num'; level?: number; align?: 'left' | 'center' | 'right' }
export type ShapeKind = 'rect' | 'round' | 'ellipse' | 'triangle' | 'diamond' | 'arrow' | 'star' | 'line';
export const SHAPES: { value: ShapeKind; label: string }[] = [
  { value: 'rect', label: 'Rectangle' }, { value: 'round', label: 'Rounded rectangle' }, { value: 'ellipse', label: 'Oval' },
  { value: 'triangle', label: 'Triangle' }, { value: 'diamond', label: 'Diamond' }, { value: 'arrow', label: 'Arrow' },
  { value: 'star', label: 'Star' }, { value: 'line', label: 'Line' },
];
export type Anim = 'fade' | 'fly' | 'zoom';
export type Transition = 'none' | 'fade' | 'slide' | 'zoom';
export interface Item {
  id: string; kind: 'text' | 'shape' | 'image';
  x: number; y: number; w: number; h: number; rot?: number;
  /** A layout's placeholder ("Click to add a title" while it's empty). */
  role?: 'title' | 'subtitle' | 'body';
  paras?: Para[]; size?: number; font?: string; color?: string; valign?: 'top' | 'middle' | 'bottom';
  /** How paragraphs line up unless one says otherwise. */
  align?: 'left' | 'center' | 'right';
  shape?: ShapeKind; fill?: string; line?: string; lineW?: number;
  src?: string; alt?: string; fit?: 'cover' | 'contain';
  /** Appears on a click while presenting. */
  anim?: Anim;
}
export interface Slide { id: string; layout: LayoutId; bg?: string; notes: string; transition?: Transition; hidden?: boolean; items: Item[] }
export interface DeckJSON { theme: ThemeId; ratio: '16:9' | '4:3'; slides: Slide[] }

export const H = 900;
export const widthOf = (ratio: DeckJSON['ratio']) => (ratio === '4:3' ? 1200 : 1600);

// ── Themes ──────────────────────────────────────────────────────────────────────────────

export type ThemeId = 'classic' | 'midnight' | 'sunrise' | 'forest' | 'ocean' | 'berry' | 'slate' | 'bold';
export interface Theme { id: ThemeId; name: string; bg: string; text: string; muted: string; accent: string; title: string; body: string; band: 'none' | 'left' | 'top' | 'bottom' }
export const THEMES: Theme[] = [
  { id: 'classic', name: 'Classic', bg: '#ffffff', text: '#1f2937', muted: '#4b5563', accent: '#4f46e5', title: 'Inter', body: 'Inter', band: 'bottom' },
  { id: 'midnight', name: 'Midnight', bg: '#0f172a', text: '#f1f5f9', muted: '#cbd5e1', accent: '#38bdf8', title: 'Inter', body: 'Inter', band: 'left' },
  { id: 'sunrise', name: 'Sunrise', bg: '#fff7ed', text: '#431407', muted: '#7c2d12', accent: '#ea580c', title: 'Georgia', body: 'Inter', band: 'top' },
  { id: 'forest', name: 'Forest', bg: '#f0fdf4', text: '#14532d', muted: '#166534', accent: '#16a34a', title: 'Georgia', body: 'Verdana', band: 'left' },
  { id: 'ocean', name: 'Ocean', bg: '#ecfeff', text: '#164e63', muted: '#155e75', accent: '#0891b2', title: 'Trebuchet MS', body: 'Trebuchet MS', band: 'bottom' },
  { id: 'berry', name: 'Berry', bg: '#fdf2f8', text: '#500724', muted: '#831843', accent: '#db2777', title: 'Georgia', body: 'Inter', band: 'top' },
  { id: 'slate', name: 'Slate', bg: '#f8fafc', text: '#0f172a', muted: '#334155', accent: '#475569', title: 'Times New Roman', body: 'Arial', band: 'none' },
  { id: 'bold', name: 'Bold', bg: '#111827', text: '#f9fafb', muted: '#d1d5db', accent: '#f59e0b', title: 'Trebuchet MS', body: 'Verdana', band: 'bottom' },
];
export const themeOf = (id: string | undefined) => THEMES.find((t) => t.id === id) ?? THEMES[0];
export const FONTS = ['Inter', 'Arial', 'Georgia', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Courier New'] as const;

// ── Layouts ─────────────────────────────────────────────────────────────────────────────

export type LayoutId = 'title' | 'content' | 'two' | 'section' | 'titleOnly' | 'picture' | 'quote' | 'blank';
export const LAYOUTS: { id: LayoutId; name: string }[] = [
  { id: 'title', name: 'Title slide' }, { id: 'content', name: 'Title and content' }, { id: 'two', name: 'Two columns' },
  { id: 'section', name: 'Section header' }, { id: 'titleOnly', name: 'Title only' }, { id: 'picture', name: 'Picture with caption' },
  { id: 'quote', name: 'Quote' }, { id: 'blank', name: 'Blank' },
];

let seq = 0;
export const newId = (p = 'i') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const textParas = (text: string, bullet?: Para['bullet']): Para[] => text.split('\n').map((t) => ({ runs: t ? [{ t }] : [], ...(bullet ? { bullet } : {}) }));
export const plainText = (paras: Para[] | undefined) => (paras ?? []).map((p) => p.runs.map((r) => r.t).join('')).join('\n');

/** The placeholders a layout starts with (filled with `text` when given). */
export function layoutItems(layout: LayoutId, ratio: DeckJSON['ratio'], text: Partial<Record<'title' | 'subtitle' | 'body' | 'body2', string>> = {}): Item[] {
  const W = widthOf(ratio), m = 90, inner = W - 2 * m;
  const t = (role: Item['role'], x: number, y: number, w: number, h: number, size: number, extra: Partial<Item> = {}, content = ''): Item =>
    ({ id: newId(), kind: 'text', role, x, y, w, h, size, paras: content ? textParas(content, role === 'body' ? 'dot' : undefined) : [], ...extra });
  switch (layout) {
    case 'title': return [t('title', m, 290, inner, 180, 84, { valign: 'bottom' }, text.title), t('subtitle', m, 490, inner, 110, 40, { valign: 'top' }, text.subtitle)].map(center);
    case 'content': return [t('title', m, 60, inner, 130, 60, { valign: 'middle' }, text.title), t('body', m, 220, inner, 600, 36, { valign: 'top' }, text.body)];
    case 'two': return [t('title', m, 60, inner, 130, 60, { valign: 'middle' }, text.title), t('body', m, 220, inner / 2 - 20, 600, 32, { valign: 'top' }, text.body), t('body', m + inner / 2 + 20, 220, inner / 2 - 20, 600, 32, { valign: 'top' }, text.body2)];
    case 'section': return [t('title', m, 330, inner, 160, 76, { valign: 'bottom' }, text.title), t('subtitle', m, 510, inner, 90, 34, { valign: 'top' }, text.subtitle)];
    case 'titleOnly': return [t('title', m, 60, inner, 130, 60, { valign: 'middle' }, text.title)];
    case 'picture': return [t('title', m, 60, inner, 110, 54, { valign: 'middle' }, text.title), { id: newId(), kind: 'image', x: m, y: 190, w: inner, h: 540, fit: 'cover' }, t('body', m, 750, inner, 90, 28, { valign: 'top' }, text.body)];
    case 'quote': return [t('title', m + 80, 220, inner - 160, 340, 64, { valign: 'middle', font: 'Georgia' }, text.title ? `“${text.title}”` : ''), t('subtitle', m + 80, 590, inner - 160, 80, 34, { valign: 'top' }, text.subtitle ? `— ${text.subtitle}` : '')].map(center);
    default: return [];
  }
}
const center = (it: Item): Item => ({ ...it, align: 'center' });

export const newSlide = (layout: LayoutId, ratio: DeckJSON['ratio'], text?: Parameters<typeof layoutItems>[2]): Slide => ({ id: newId('s'), layout, notes: '', items: layoutItems(layout, ratio, text) });
export const emptyDeck = (): DeckJSON => ({ theme: 'classic', ratio: '16:9', slides: [newSlide('title', '16:9')] });

// ── Cleaning ────────────────────────────────────────────────────────────────────────────

const HEX = /^#[0-9a-f]{6}$/i;
const MAX_SLIDES = 200, MAX_ITEMS = 60, MAX_TEXT = 5000;
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const id = (v: unknown) => (typeof v === 'string' && /^[\w-]{1,48}$/.test(v) ? v : newId());
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (list.includes(v as T) ? (v as T) : undefined);
/** Links that may open from a slide: web and mail addresses, and pages of this app. */
export const safeLink = (v: unknown) => (typeof v === 'string' && /^(https?:\/\/|mailto:|\/(?!\/))[^\s<>"']{0,800}$/i.test(v) ? v : undefined);
/** Pictures must be uploaded to the app (or be one of its own files). */
export const safeSrc = (v: unknown) => (typeof v === 'string' && /^(\/api\/|https:\/\/[\w.-]+\/)[^\s<>"']{1,900}$/.test(v) ? v : undefined);

function cleanParas(v: unknown): Para[] {
  let total = 0;
  return (Array.isArray(v) ? v : []).slice(0, 100).map((p) => {
    const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
    const runs = (Array.isArray(o.runs) ? o.runs : []).slice(0, 100).flatMap((r): Run[] => {
      const x = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
      const t = typeof x.t === 'string' ? x.t.replace(/[\r\n]+/g, ' ').slice(0, Math.max(0, MAX_TEXT - total)) : '';
      total += t.length;
      if (!t) return [];
      const link = safeLink(x.link);
      return [{ t, ...(x.b ? { b: true as const } : {}), ...(x.i ? { i: true as const } : {}), ...(x.u ? { u: true as const } : {}), ...(x.s ? { s: true as const } : {}), ...(typeof x.color === 'string' && HEX.test(x.color) ? { color: x.color.toLowerCase() } : {}), ...(link ? { link } : {}) }];
    });
    const bullet = oneOf(o.bullet, ['dot', 'num'] as const), align = oneOf(o.align, ['left', 'center', 'right'] as const);
    const level = typeof o.level === 'number' && o.level >= 1 && o.level <= 4 ? Math.round(o.level) : undefined;
    return { runs, ...(bullet ? { bullet } : {}), ...(align ? { align } : {}), ...(level ? { level } : {}) };
  });
}

export function cleanItem(v: unknown, W: number): Item | null {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const kind = oneOf(o.kind, ['text', 'shape', 'image'] as const);
  if (!kind) return null;
  const it: Item = { id: id(o.id), kind, x: num(o.x, -W, 2 * W, 0), y: num(o.y, -H, 2 * H, 0), w: num(o.w, 4, 3 * W, 200), h: num(o.h, 4, 3 * H, 100) };
  const rot = num(o.rot, -360, 360, 0);
  if (rot) it.rot = rot;
  const role = oneOf(o.role, ['title', 'subtitle', 'body'] as const);
  if (role) it.role = role;
  if (kind !== 'image') { it.paras = cleanParas(o.paras); }
  if (typeof o.size === 'number') it.size = num(o.size, 8, 300, 32);
  const font = oneOf(o.font, FONTS);
  if (font) it.font = font;
  for (const k of ['color', 'fill', 'line'] as const) if (typeof o[k] === 'string' && HEX.test(o[k] as string)) it[k] = (o[k] as string).toLowerCase();
  const valign = oneOf(o.valign, ['top', 'middle', 'bottom'] as const);
  if (valign) it.valign = valign;
  const align = oneOf(o.align, ['left', 'center', 'right'] as const);
  if (align) it.align = align;
  if (kind === 'shape') { it.shape = oneOf(o.shape, SHAPES.map((s) => s.value)) ?? 'rect'; if (typeof o.lineW === 'number') it.lineW = num(o.lineW, 0, 40, 2); }
  if (kind === 'image') {
    const src = safeSrc(o.src);
    if (src) it.src = src;
    if (typeof o.alt === 'string') it.alt = o.alt.slice(0, 300);
    it.fit = oneOf(o.fit, ['cover', 'contain'] as const) ?? 'cover';
  }
  const anim = oneOf(o.anim, ['fade', 'fly', 'zoom'] as const);
  if (anim) it.anim = anim;
  return it;
}

export function cleanSlide(v: unknown, W: number): Slide {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const s: Slide = { id: id(o.id), layout: oneOf(o.layout, LAYOUTS.map((l) => l.id)) ?? 'blank', notes: typeof o.notes === 'string' ? o.notes.slice(0, 10_000) : '', items: (Array.isArray(o.items) ? o.items : []).slice(0, MAX_ITEMS).map((x) => cleanItem(x, W)).filter((x): x is Item => !!x) };
  if (typeof o.bg === 'string' && HEX.test(o.bg)) s.bg = o.bg.toLowerCase();
  const tr = oneOf(o.transition, ['none', 'fade', 'slide', 'zoom'] as const);
  if (tr && tr !== 'none') s.transition = tr;
  if (o.hidden === true) s.hidden = true;
  const seen = new Set<string>();
  for (const it of s.items) { while (seen.has(it.id)) it.id = newId(); seen.add(it.id); }
  return s;
}

/** A deck from untrusted JSON: only known fields, within limits; at least one slide. */
export function cleanDeck(raw: unknown): DeckJSON {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const ratio = o.ratio === '4:3' ? '4:3' : '16:9';
  const W = widthOf(ratio);
  const slides = (Array.isArray(o.slides) ? o.slides : []).slice(0, MAX_SLIDES).map((s) => cleanSlide(s, W));
  const seen = new Set<string>();
  for (const s of slides) { while (seen.has(s.id)) s.id = newId('s'); seen.add(s.id); }
  return { theme: oneOf(o.theme, THEMES.map((t) => t.id)) ?? 'classic', ratio, slides: slides.length ? slides : [newSlide('title', ratio)] };
}

/** A deck's words, for search and the list of documents. */
export function deckText(d: DeckJSON): string {
  return d.slides.map((s) => s.items.map((i) => plainText(i.paras)).filter(Boolean).join('\n')).join('\n\n');
}

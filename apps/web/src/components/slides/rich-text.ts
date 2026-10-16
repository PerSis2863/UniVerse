'use client';

import { safeLink, type Para, type Run } from '@/lib/slides/deck';

// Text boxes on slides (Office suite) are edited in the browser's own editable box, then read back
// into paragraphs and runs: only bold, italic, underline, strikethrough, colours, links, bullets
// and alignment are kept; everything else (pasted styles, scripts, pictures) is dropped.

const toHex = (c: string): string | undefined => {
  const s = c.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s);
  return m ? `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('')}` : undefined;
};

type Fmt = Omit<Run, 't'>;
const BLOCK = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE']);

/** The paragraphs in an edited box. `base` is the colour the box shows text in (not kept on runs). */
export function domToParas(root: HTMLElement, base?: string): Para[] {
  const paras: Para[] = [];
  let cur: Para = { runs: [] };
  const flush = (force = false) => { if (force || cur.runs.length) paras.push(cur); cur = { runs: [] }; };
  const push = (t: string, f: Fmt) => {
    if (!t) return;
    const last = cur.runs[cur.runs.length - 1];
    const same = last && last.b === f.b && last.i === f.i && last.u === f.u && last.s === f.s && last.color === f.color && last.link === f.link;
    if (same) last.t += t; else cur.runs.push({ t, ...f });
  };
  const fmtOf = (el: HTMLElement, f: Fmt): Fmt => {
    const n: Fmt = { ...f };
    const tag = el.tagName;
    if (tag === 'B' || tag === 'STRONG') n.b = true;
    if (tag === 'I' || tag === 'EM') n.i = true;
    if (tag === 'U') n.u = true;
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') n.s = true;
    if (tag === 'FONT' && el.getAttribute('color')) { const c = toHex(el.getAttribute('color')!); if (c) n.color = c; }
    if (tag === 'A') { const l = safeLink(el.getAttribute('href')); if (l) n.link = l; }
    const st = el.style;
    if (st) {
      if (st.fontWeight && (st.fontWeight === 'bold' || Number(st.fontWeight) >= 600)) n.b = true;
      if (st.fontWeight === 'normal' || st.fontWeight === '400') delete n.b;
      if (st.fontStyle === 'italic') n.i = true;
      const deco = `${st.textDecoration} ${st.textDecorationLine}`;
      if (deco.includes('underline')) n.u = true;
      if (deco.includes('line-through')) n.s = true;
      if (st.color) { const c = toHex(st.color); if (c && c !== base) n.color = c; }
    }
    for (const k of Object.keys(n) as (keyof Fmt)[]) if (n[k] === undefined) delete n[k];
    return n;
  };
  const alignOf = (el: HTMLElement): Para['align'] => { const a = el.style?.textAlign || el.getAttribute('align') || ''; return a === 'center' || a === 'right' ? a : a === 'left' ? 'left' : undefined; };
  const walk = (node: Node, f: Fmt) => {
    if (node.nodeType === Node.TEXT_NODE) { push((node.textContent ?? '').replace(/[\r\n]+/g, ' '), f); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IMG' || tag === 'SVG') return;
    if (tag === 'BR') { flush(true); return; }
    if (tag === 'UL' || tag === 'OL') {
      flush();
      for (const li of Array.from(el.children)) {
        if (li.tagName !== 'LI') { walk(li, f); continue; }
        cur = { runs: [], bullet: tag === 'OL' ? 'num' : 'dot', ...(alignOf(li as HTMLElement) ? { align: alignOf(li as HTMLElement) } : {}) };
        const level = Number((li as HTMLElement).dataset.level);
        if (level >= 1 && level <= 4) cur.level = level;
        for (const c of Array.from(li.childNodes)) walk(c, f);
        paras.push(cur); cur = { runs: [] };
      }
      return;
    }
    if (BLOCK.has(tag) || tag === 'LI') {
      flush();
      const a = alignOf(el);
      if (a) cur.align = a;
      for (const c of Array.from(el.childNodes)) walk(c, fmtOf(el, f));
      // An empty block is a blank line.
      if (!cur.runs.length && !el.textContent) { paras.push(cur); cur = { runs: [] }; } else flush();
      return;
    }
    const nf = fmtOf(el, f);
    for (const c of Array.from(el.childNodes)) walk(c, nf);
  };
  for (const c of Array.from(root.childNodes)) walk(c, {});
  flush();
  // A trailing blank line from the editor's last <br> isn't text.
  while (paras.length > 1 && !paras[paras.length - 1].runs.length) paras.pop();
  for (const p of paras) if (p.align === 'left') delete p.align;
  return paras.length === 1 && !paras[0].runs.length ? [] : paras;
}

/** Runs a formatting command on the selected text of the box being edited. */
export function format(cmd: 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'insertUnorderedList' | 'insertOrderedList' | 'justifyLeft' | 'justifyCenter' | 'justifyRight' | 'removeFormat', value?: string) {
  document.execCommand('styleWithCSS', false, 'false');
  document.execCommand(cmd, false, value);
}
export function colorText(c: string) { document.execCommand('styleWithCSS', false, 'true'); document.execCommand('foreColor', false, c); }
export function linkText(href: string) { document.execCommand('createLink', false, href); }

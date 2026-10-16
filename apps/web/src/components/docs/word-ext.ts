import { Extension, Mark, Node, mergeAttributes, type Editor } from '@tiptap/react';
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// Word's everyday formatting for documents (Office suite · O3), as Tiptap extensions: text style
// (font, size, colour, highlight), subscript and superscript, alignment, line spacing and indents
// on paragraphs and headings, page breaks, a table of contents, and find and replace. What they
// store is plain HTML attributes, so versions, PDF and Word copies keep them.

const FONT_RE = /^[\w\s,'"-]{1,60}$/;
const SIZE_RE = /^(\d{1,3})(\.\d)?pt$/;
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;
const clean = (v: string | null | undefined, re: RegExp) => (v && re.test(v.trim()) ? v.trim() : null);

/** Font, size (in points), colour and highlight on a span. */
export const TextStyle = Mark.create({
  name: 'textStyle',
  priority: 101,
  addAttributes: () => ({
    fontFamily: { default: null, parseHTML: (el: HTMLElement) => clean(el.style.fontFamily?.replace(/"/g, "'"), FONT_RE) },
    fontSize: { default: null, parseHTML: (el: HTMLElement) => clean(el.style.fontSize, SIZE_RE) },
    color: { default: null, parseHTML: (el: HTMLElement) => clean(el.style.color, COLOR_RE) },
    backgroundColor: { default: null, parseHTML: (el: HTMLElement) => clean(el.style.backgroundColor, COLOR_RE) },
  }),
  parseHTML: () => [{ tag: 'span[style]', getAttrs: (el) => ((el as HTMLElement).style.fontFamily || (el as HTMLElement).style.fontSize || (el as HTMLElement).style.color || (el as HTMLElement).style.backgroundColor ? null : false) }, { tag: 'mark', getAttrs: (el) => ({ backgroundColor: clean((el as HTMLElement).style.backgroundColor, COLOR_RE) ?? '#fef08a' }) }],
  renderHTML: ({ HTMLAttributes: a }) => {
    const style = [a.fontFamily && `font-family:${a.fontFamily}`, a.fontSize && `font-size:${a.fontSize}`, a.color && `color:${a.color}`, a.backgroundColor && `background-color:${a.backgroundColor}`].filter(Boolean).join(';');
    return ['span', style ? { style } : {}, 0];
  },
});

/** Sets or clears one part of the text style on the selection (the mark goes when nothing's left). */
export function setTextStyle(editor: Editor, key: 'fontFamily' | 'fontSize' | 'color' | 'backgroundColor', value: string | null) {
  const chain = editor.chain().focus().setMark('textStyle', { [key]: value });
  chain.run();
  const attrs = editor.getAttributes('textStyle');
  if (!attrs.fontFamily && !attrs.fontSize && !attrs.color && !attrs.backgroundColor) editor.chain().unsetMark('textStyle', { extendEmptyMarkRange: true }).run();
}

export const Subscript = Mark.create({
  name: 'subscript', excludes: 'superscript',
  parseHTML: () => [{ tag: 'sub' }, { style: 'vertical-align', getAttrs: (v) => (v === 'sub' ? {} : false) }],
  renderHTML: () => ['sub', 0],
  addKeyboardShortcuts() { return { 'Mod-,': () => this.editor.commands.toggleMark(this.name) }; },
});
export const Superscript = Mark.create({
  name: 'superscript', excludes: 'subscript',
  parseHTML: () => [{ tag: 'sup' }, { style: 'vertical-align', getAttrs: (v) => (v === 'super' ? {} : false) }],
  renderHTML: () => ['sup', 0],
  addKeyboardShortcuts() { return { 'Mod-.': () => this.editor.commands.toggleMark(this.name) }; },
});

const BLOCKS = ['paragraph', 'heading'];
/** Alignment, line spacing and indent on paragraphs and headings. */
export const ParagraphFormat = Extension.create({
  name: 'paragraphFormat',
  addGlobalAttributes: () => [{
    types: BLOCKS,
    attributes: {
      textAlign: { default: null, parseHTML: (el) => { const a = (el as HTMLElement).style.textAlign; return ['center', 'right', 'justify'].includes(a) ? a : null; }, renderHTML: (a) => (a.textAlign ? { style: `text-align:${a.textAlign}` } : {}) },
      lineHeight: { default: null, parseHTML: (el) => { const v = Number((el as HTMLElement).style.lineHeight); return v >= 0.8 && v <= 3 ? String(v) : null; }, renderHTML: (a) => (a.lineHeight ? { style: `line-height:${a.lineHeight}` } : {}) },
      indent: { default: 0, parseHTML: (el) => Math.max(0, Math.min(8, Number((el as HTMLElement).getAttribute('data-indent')) || 0)), renderHTML: (a) => (a.indent ? { 'data-indent': a.indent, style: `margin-left:${Number(a.indent) * 2}em` } : {}) },
    },
  }],
  addKeyboardShortcuts() {
    const step = (d: number) => () => {
      const { $from } = this.editor.state.selection;
      // In a list, Tab moves the item in or out instead.
      for (let depth = $from.depth; depth > 0; depth--) if (['listItem', 'taskItem'].includes($from.node(depth).type.name)) return false;
      return setIndent(this.editor, d);
    };
    return { Tab: step(1), 'Shift-Tab': step(-1), 'Mod-Shift-l': () => setAlign(this.editor, null), 'Mod-Shift-e': () => setAlign(this.editor, 'center'), 'Mod-Shift-r': () => setAlign(this.editor, 'right'), 'Mod-Shift-j': () => setAlign(this.editor, 'justify') };
  },
});
const eachBlock = (editor: Editor, f: (attrs: Record<string, unknown>) => Record<string, unknown> | null) => {
  const { state } = editor;
  const tr = state.tr;
  let changed = false;
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
    if (!BLOCKS.includes(node.type.name)) return true;
    const next = f(node.attrs);
    if (next) { tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...next }); changed = true; }
    return false;
  });
  if (changed) editor.view.dispatch(tr);
  return changed;
};
export const setAlign = (editor: Editor, a: 'center' | 'right' | 'justify' | null) => eachBlock(editor, () => ({ textAlign: a }));
export const setLineHeight = (editor: Editor, v: string | null) => eachBlock(editor, () => ({ lineHeight: v }));
export const setIndent = (editor: Editor, d: number) => eachBlock(editor, (a) => ({ indent: Math.max(0, Math.min(8, Number(a.indent ?? 0) + d)) }));
/** The current paragraph's alignment, line spacing and indent. */
export function blockFormat(state: EditorState) {
  const { $from } = state.selection;
  for (let d = $from.depth; d >= 0; d--) { const n = $from.node(d); if (BLOCKS.includes(n.type.name)) return n.attrs as { textAlign: string | null; lineHeight: string | null; indent: number }; }
  return { textAlign: null, lineHeight: null, indent: 0 };
}

/** Puts a page break or contents box at the caret, with the caret on the line after it, so the
 *  next key typed doesn't replace what was just put in. */
export function insertBlock(editor: Editor, type: 'pageBreak' | 'tableOfContents') {
  return editor.chain().focus().insertContent({ type }).command(({ tr, dispatch }) => {
    if (!(tr.selection instanceof NodeSelection)) return true;
    const after = tr.selection.to;
    if (dispatch) {
      if (!tr.doc.resolve(after).nodeAfter?.isTextblock) tr.insert(after, tr.doc.type.schema.nodes.paragraph.create());
      tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView();
    }
    return true;
  }).run();
}

/** A page break: the next part starts on a new page in print, PDF and Word. */
export const PageBreak = Node.create({
  name: 'pageBreak', group: 'block', atom: true, selectable: true,
  parseHTML: () => [{ tag: 'div[data-page-break]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-page-break': '', class: 'doc-page-break', contenteditable: 'false' }), ['span', {}, 'Page break']],
  addKeyboardShortcuts() { return { 'Mod-Enter': () => insertBlock(this.editor, 'pageBreak') }; },
});

/** A table of contents: the document's headings, kept up to date as they change. */
export const TableOfContents = Node.create({
  name: 'tableOfContents', group: 'block', atom: true, selectable: true,
  parseHTML: () => [{ tag: 'nav[data-toc]' }],
  renderHTML: ({ HTMLAttributes }) => ['nav', mergeAttributes(HTMLAttributes, { 'data-toc': '', class: 'doc-toc' })],
  addNodeView() {
    return ({ editor }) => {
      const dom = document.createElement('nav');
      dom.setAttribute('data-toc', '');
      dom.setAttribute('aria-label', 'Contents');
      dom.className = 'doc-toc';
      dom.contentEditable = 'false';
      const draw = () => {
        const list = headingsOf(editor.state);
        dom.replaceChildren();
        const title = document.createElement('p');
        title.className = 'doc-toc-title';
        title.textContent = 'Contents';
        dom.appendChild(title);
        if (!list.length) { const p = document.createElement('p'); p.className = 'doc-toc-empty'; p.textContent = 'Headings you add appear here.'; dom.appendChild(p); return; }
        const ol = document.createElement('ol');
        list.forEach((h, i) => {
          const li = document.createElement('li');
          li.style.marginLeft = `${(h.level - 1) * 1.25}em`;
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = h.text || 'Untitled heading';
          b.onclick = () => { const el = editor.view.dom.querySelectorAll('h1, h2, h3')[i] as HTMLElement | undefined; el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
          li.appendChild(b);
          ol.appendChild(li);
        });
        dom.appendChild(ol);
      };
      draw();
      const on = () => draw();
      editor.on('update', on);
      return { dom, ignoreMutation: () => true, stopEvent: () => false, destroy: () => editor.off('update', on) };
    };
  },
});
export function headingsOf(state: EditorState) {
  const out: { level: number; text: string }[] = [];
  state.doc.descendants((n) => { if (n.type.name === 'heading') { out.push({ level: Math.min(3, Number(n.attrs.level) || 1), text: n.textContent }); return false; } return true; });
  return out;
}
/** Fills the empty contents boxes in exported HTML (print, PDF) with the headings. */
export function fillContents(html: string, headings: { level: number; text: string }[]) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const list = `<p class="doc-toc-title">Contents</p><ol>${headings.map((h) => `<li style="margin-left:${(h.level - 1) * 1.25}em">${esc(h.text)}</li>`).join('')}</ol>`;
  return html.replace(/<nav([^>]*data-toc[^>]*)><\/nav>/g, `<nav$1>${list}</nav>`);
}

// ── Find and replace ─────────────────────────────────────────────────────────────────────────

export const findKey = new PluginKey<{ query: string; caseSensitive: boolean; current: number; matches: { from: number; to: number }[] }>('find');
function matchesOf(state: EditorState, query: string, caseSensitive: boolean) {
  const out: { from: number; to: number }[] = [];
  if (!query) return out;
  const q = caseSensitive ? query : query.toLowerCase();
  state.doc.descendants((n, pos) => {
    if (!n.isText || !n.text) return true;
    const t = caseSensitive ? n.text : n.text.toLowerCase();
    for (let i = t.indexOf(q); i >= 0 && out.length < 5000; i = t.indexOf(q, i + q.length)) out.push({ from: pos + i, to: pos + i + q.length });
    return true;
  });
  return out;
}
export const FindReplace = Extension.create({
  name: 'findReplace',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: findKey,
      state: {
        init: () => ({ query: '', caseSensitive: false, current: 0, matches: [] as { from: number; to: number }[] }),
        apply(tr, prev, _old, state) {
          const meta = tr.getMeta(findKey) as Partial<{ query: string; caseSensitive: boolean; current: number }> | undefined;
          if (!meta && !tr.docChanged) return prev;
          const query = meta?.query ?? prev.query, caseSensitive = meta?.caseSensitive ?? prev.caseSensitive;
          const matches = matchesOf(state, query, caseSensitive);
          const current = matches.length ? Math.min(matches.length - 1, Math.max(0, meta?.current ?? prev.current)) : 0;
          return { query, caseSensitive, current, matches };
        },
      },
      props: {
        decorations(state) {
          const s = findKey.getState(state);
          if (!s?.matches.length) return null;
          return DecorationSet.create(state.doc, s.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === s.current ? 'doc-find doc-find-current' : 'doc-find' })));
        },
      },
    })];
  },
});
export function setFind(editor: Editor, p: Partial<{ query: string; caseSensitive: boolean; current: number }>) { editor.view.dispatch(editor.state.tr.setMeta(findKey, p)); }
export function findState(editor: Editor) { return findKey.getState(editor.state) ?? { query: '', caseSensitive: false, current: 0, matches: [] }; }
/** Moves to the next (or previous) match and shows it. */
export function findStep(editor: Editor, d: 1 | -1) {
  const s = findState(editor);
  if (!s.matches.length) return;
  const current = (s.current + d + s.matches.length) % s.matches.length;
  setFind(editor, { current });
  const m = s.matches[current];
  editor.commands.setTextSelection(m);
  editor.view.domAtPos(m.from).node.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
export function replaceCurrent(editor: Editor, text: string) {
  const s = findState(editor);
  const m = s.matches[s.current];
  if (!m) return;
  editor.chain().focus().insertContentAt(m, text).run();
}
export function replaceAll(editor: Editor, text: string): number {
  const s = findState(editor);
  if (!s.matches.length) return 0;
  const tr = editor.state.tr;
  for (const m of [...s.matches].reverse()) { if (text) tr.insertText(text, m.from, m.to); else tr.delete(m.from, m.to); }
  editor.view.dispatch(tr);
  return s.matches.length;
}

'use client';

import { useRef, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { toast } from 'sonner';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Baseline, Bold, ChevronDown, Code, Eraser, Highlighter, ImagePlus, IndentDecrease, IndentIncrease, Italic, Link2, List, ListChecks, ListOrdered, ListTree, Loader2, Minus, Plus, Redo2, Search, SeparatorHorizontal, Strikethrough, Subscript as SubIcon, Superscript as SupIcon, Table, Underline, Undo2 } from 'lucide-react';
import { uploadChatFile } from '@/components/chat/chat-client';
import { ColorGrid, Menu, Popover, type MenuItem } from '@/components/ui/Menu';
import { cn } from '@/lib/utils';
import { blockFormat, insertBlock, setAlign, setIndent, setLineHeight, setTextStyle } from './word-ext';

// The document's toolbar with Word's everyday formatting (Office suite · O3): styles, font and
// size, bold / italic / underline / strikethrough, superscript and subscript, text colour and
// highlight, clearing formatting, alignment, line spacing, indents, lists, links, pictures,
// tables (with their own tools), and inserting page breaks, a table of contents, dividers,
// symbols and today's date. Lesson pages keep the simpler DocToolbar.

const FONTS = ['Default', 'Arial', 'Calibri', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'Courier New', 'Comic Sans MS'];
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
const SYMBOLS = ['©', '®', '™', '°', '±', '×', '÷', '≠', '≈', '≤', '≥', '∞', '√', 'π', 'µ', 'Ω', '∑', '€', '£', '¥', '₹', '•', '—', '–', '…', '→', '←', '↑', '↓', '✓', '✗', '★', '½', '¼', '¾', '²', '³', '§', '¶'];

export function WordToolbar({ editor, disabled, onFind }: { editor: Editor | null; disabled: boolean; onFind: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null;
      const ts = e.getAttributes('textStyle');
      const block = blockFormat(e.state);
      return {
        bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'), code: e.isActive('code'),
        sub: e.isActive('subscript'), sup: e.isActive('superscript'), link: e.isActive('link'), table: e.isActive('table'),
        bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'), task: e.isActive('taskList'),
        style: e.isActive('heading', { level: 1 }) ? 'h1' : e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : e.isActive('blockquote') ? 'quote' : e.isActive('codeBlock') ? 'code' : 'p',
        font: (ts.fontFamily as string | null) ?? null, size: (ts.fontSize as string | null) ?? null, color: (ts.color as string | null) ?? null, bg: (ts.backgroundColor as string | null) ?? null,
        align: block.textAlign ?? 'left', line: block.lineHeight ?? '', indent: Number(block.indent ?? 0),
      };
    },
  });
  if (!editor) return null;
  const c = () => editor.chain().focus();
  const btn = (on: boolean | undefined, label: string, Icon: typeof Bold, run: () => void, key?: string) => (
    <button key={key ?? label} type="button" title={label} aria-label={label} aria-pressed={on === undefined ? undefined : !!on} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={run}
      className={cn('w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40', on ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300' : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10')}><Icon className="w-4 h-4" /></button>
  );
  const sep = (k: string) => <span key={k} aria-hidden className="w-px h-5 bg-zinc-200 dark:bg-white/10 mx-1 shrink-0" />;
  const setStyle = (v: string) => {
    editor.view.focus(); // straight back to the text (see setTextStyle)
    const ch = c().clearNodes();
    if (v === 'h1') ch.setHeading({ level: 1 }).run();
    else if (v === 'h2') ch.setHeading({ level: 2 }).run();
    else if (v === 'h3') ch.setHeading({ level: 3 }).run();
    else if (v === 'quote') ch.setBlockquote().run();
    else if (v === 'code') ch.setCodeBlock().run();
    else ch.setParagraph().run();
  };
  const addImage = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true);
    try { const src = await uploadChatFile(f); c().setImage({ src, alt: f.name }).run(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const tableItems: MenuItem[] = s?.table ? [
    { label: 'Row above', onSelect: () => c().addRowBefore().run() }, { label: 'Row below', onSelect: () => c().addRowAfter().run() },
    { label: 'Column on the left', onSelect: () => c().addColumnBefore().run() }, { label: 'Column on the right', onSelect: () => c().addColumnAfter().run() },
    'sep',
    { label: 'Merge cells', onSelect: () => c().mergeCells().run() }, { label: 'Split cell', onSelect: () => c().splitCell().run() },
    { label: 'Header row on or off', onSelect: () => c().toggleHeaderRow().run() },
    'sep',
    { label: 'Delete row', onSelect: () => c().deleteRow().run() }, { label: 'Delete column', onSelect: () => c().deleteColumn().run() }, { label: 'Delete table', onSelect: () => c().deleteTable().run() },
  ] : [2, 3, 4, 5, 6].map((n) => ({ label: `${n} × ${n} table`, onSelect: () => c().insertTable({ rows: n, cols: n, withHeaderRow: true }).run() }));
  const today = () => new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div role="toolbar" aria-label="Formatting" className="relative flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none] px-2 py-1.5">
      {btn(undefined, 'Undo', Undo2, () => c().undo().run())}
      {btn(undefined, 'Redo', Redo2, () => c().redo().run())}
      {sep('a')}
      <label className="sr-only" htmlFor="doc-style">Style</label>
      <select id="doc-style" disabled={disabled} value={s?.style ?? 'p'} onChange={(e) => setStyle(e.target.value)} className="h-8 w-32 shrink-0 rounded-lg bg-transparent text-xs font-medium text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-white/10 px-1.5 disabled:opacity-40">
        <option value="p">Normal text</option><option value="h1">Title</option><option value="h2">Heading</option><option value="h3">Subheading</option><option value="quote">Quote</option><option value="code">Code</option>
      </select>
      <label className="sr-only" htmlFor="doc-font">Font</label>
      <select id="doc-font" disabled={disabled} value={s?.font?.replace(/'/g, '') ?? 'Default'} onChange={(e) => setTextStyle(editor, 'fontFamily', e.target.value === 'Default' ? null : `'${e.target.value}'`)} className="h-8 w-28 shrink-0 rounded-lg bg-transparent text-xs text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-white/10 px-1.5 disabled:opacity-40">
        {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <label className="sr-only" htmlFor="doc-size">Font size</label>
      <select id="doc-size" disabled={disabled} value={s?.size ? String(parseFloat(s.size)) : ''} onChange={(e) => setTextStyle(editor, 'fontSize', e.target.value ? `${e.target.value}pt` : null)} className="h-8 w-16 shrink-0 rounded-lg bg-transparent text-xs text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-white/10 px-1 disabled:opacity-40">
        <option value="">Size</option>{SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      {sep('b')}
      {btn(s?.bold, 'Bold', Bold, () => c().toggleBold().run())}
      {btn(s?.italic, 'Italic', Italic, () => c().toggleItalic().run())}
      {btn(s?.underline, 'Underline', Underline, () => c().toggleUnderline().run())}
      {btn(s?.strike, 'Strikethrough', Strikethrough, () => c().toggleStrike().run())}
      {btn(s?.sup, 'Superscript', SupIcon, () => c().toggleMark('superscript').run())}
      {btn(s?.sub, 'Subscript', SubIcon, () => c().toggleMark('subscript').run())}
      <Popover label="Text colour" disabled={disabled} button={<span className="flex flex-col items-center"><Baseline className="w-4 h-4" /><span className="w-4 h-1 rounded-sm -mt-0.5" style={{ background: s?.color ?? 'currentColor' }} /></span>}>
        {(close) => <ColorGrid label="Text colour" value={s?.color ?? undefined} none="Automatic" onPick={(col) => { setTextStyle(editor, 'color', col); close(); }} />}
      </Popover>
      <Popover label="Highlight" disabled={disabled} button={<span className="flex flex-col items-center"><Highlighter className="w-4 h-4" /><span className="w-4 h-1 rounded-sm -mt-0.5" style={{ background: s?.bg ?? '#fef08a' }} /></span>}>
        {(close) => <ColorGrid label="Highlight colour" value={s?.bg ?? undefined} none="No highlight" onPick={(col) => { setTextStyle(editor, 'backgroundColor', col); close(); }} />}
      </Popover>
      {btn(s?.code, 'Code', Code, () => c().toggleCode().run())}
      {btn(undefined, 'Clear formatting', Eraser, () => c().unsetAllMarks().clearNodes().run())}
      {sep('c')}
      {btn(s?.align === 'left', 'Align left', AlignLeft, () => setAlign(editor, null))}
      {btn(s?.align === 'center', 'Centre', AlignCenter, () => setAlign(editor, 'center'))}
      {btn(s?.align === 'right', 'Align right', AlignRight, () => setAlign(editor, 'right'))}
      {btn(s?.align === 'justify', 'Justify', AlignJustify, () => setAlign(editor, 'justify'))}
      <Menu label={`Line spacing ${s?.line || '1.7'}`} disabled={disabled} button={<span className="text-xs font-semibold"><span aria-hidden>↕ </span>{s?.line || '1.7'}</span>} items={[['', 'Normal'], ['1', 'Single'], ['1.15', '1.15'], ['1.5', '1.5'], ['2', 'Double']].map(([v, l]) => ({ label: l, checked: (s?.line ?? '') === v, onSelect: () => setLineHeight(editor, v || null) }))} />
      {btn(undefined, 'Decrease indent', IndentDecrease, () => (s?.bullet || s?.ordered || s?.task ? c().liftListItem(s.task ? 'taskItem' : 'listItem').run() : setIndent(editor, -1)))}
      {btn(undefined, 'Increase indent', IndentIncrease, () => (s?.bullet || s?.ordered || s?.task ? c().sinkListItem(s.task ? 'taskItem' : 'listItem').run() : setIndent(editor, 1)))}
      {sep('d')}
      {btn(s?.bullet, 'Bulleted list', List, () => c().toggleBulletList().run())}
      {btn(s?.ordered, 'Numbered list', ListOrdered, () => c().toggleOrderedList().run())}
      {btn(s?.task, 'Checklist', ListChecks, () => c().toggleTaskList().run())}
      {sep('e')}
      {btn(s?.link, 'Link', Link2, () => {
        if (editor.isActive('link')) return c().unsetLink().run();
        const href = window.prompt('Link to (https://…)');
        if (href && /^(https?:\/\/|mailto:)/i.test(href.trim())) c().extendMarkRange('link').setLink({ href: href.trim() }).run();
      })}
      <button type="button" title="Picture" aria-label="Picture" disabled={disabled || uploading} onMouseDown={(e) => e.preventDefault()} onClick={() => fileRef.current?.click()} className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10 disabled:opacity-40">
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
      </button>
      <input ref={fileRef} type="file" accept="image/*" disabled={disabled} className="hidden" aria-label="Picture to add" onChange={(e) => void addImage(e.target.files?.[0])} />
      <Menu label={s?.table ? 'Table tools' : 'Insert a table'} disabled={disabled} button={<><Table className="w-4 h-4" /><ChevronDown className="w-3 h-3" /></>} items={tableItems} />
      <Menu label="Insert" disabled={disabled} button={<><Plus className="w-4 h-4" /><span className="text-xs font-medium">Insert</span></>} items={[
        { label: 'Page break', icon: <SeparatorHorizontal className="w-4 h-4" />, hint: 'Ctrl Enter', onSelect: () => insertBlock(editor, 'pageBreak') },
        { label: 'Table of contents', icon: <ListTree className="w-4 h-4" />, onSelect: () => insertBlock(editor, 'tableOfContents') },
        { label: 'Divider line', icon: <Minus className="w-4 h-4" />, onSelect: () => c().setHorizontalRule().run() },
        { label: 'Today’s date', onSelect: () => c().insertContent(today()).run() },
      ]} />
      <Popover label="Symbol" disabled={disabled} button={<span className="text-sm font-semibold">Ω</span>}>
        {(close) => (
          <div role="group" aria-label="Symbols" className="grid grid-cols-8 gap-1 p-2">
            {SYMBOLS.map((ch) => <button key={ch} type="button" aria-label={`Insert ${ch}`} onClick={() => { c().insertContent(ch).run(); close(); }} className="w-8 h-8 rounded-md text-base hover:bg-zinc-100 dark:hover:bg-white/10">{ch}</button>)}
          </div>
        )}
      </Popover>
      {sep('f')}
      <button type="button" title="Find and replace (Ctrl F)" aria-label="Find and replace" onMouseDown={(e) => e.preventDefault()} onClick={onFind} className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10"><Search className="w-4 h-4" /></button>
    </div>
  );
}

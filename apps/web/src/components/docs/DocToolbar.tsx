'use client';

import { useRef, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { toast } from 'sonner';
import { Bold, Code, Heading1, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListChecks, ListOrdered, Loader2, Minus, Quote, Redo2, SquareCode, Strikethrough, Table, Underline, Undo2 } from 'lucide-react';
import { uploadChatFile } from '@/components/chat/chat-client';
import { cn } from '@/lib/utils';

// The formatting toolbar of the document editor (DocEditor.tsx) and of lesson pages
// (src/components/lessons/LessonPage.tsx). Its own file so lesson pages don't load the live room.

/** The formatting toolbar. */
export function DocToolbar({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => e ? {
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'), code: e.isActive('code'),
      h1: e.isActive('heading', { level: 1 }), h2: e.isActive('heading', { level: 2 }), h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'), task: e.isActive('taskList'), quote: e.isActive('blockquote'), block: e.isActive('codeBlock'), link: e.isActive('link'), table: e.isActive('table'),
    } : null,
  });
  if (!editor) return null;
  const c = () => editor.chain().focus();
  const btn = (on: boolean | undefined, label: string, Icon: typeof Bold, run: () => void) => (
    <button key={label} type="button" title={label} aria-label={label} aria-pressed={!!on} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={run}
      className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40', on ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300' : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10')}><Icon className="w-4 h-4" /></button>
  );
  const sep = (k: string) => <span key={k} className="w-px h-5 bg-zinc-200 dark:bg-white/10 mx-1" />;
  const addImage = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true);
    try { const src = await uploadChatFile(f); c().setImage({ src, alt: f.name }).run(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none] px-2 py-1.5">
      {btn(false, 'Undo', Undo2, () => c().undo().run())}
      {btn(false, 'Redo', Redo2, () => c().redo().run())}
      {sep('a')}
      {btn(s?.h1, 'Title', Heading1, () => c().toggleHeading({ level: 1 }).run())}
      {btn(s?.h2, 'Heading', Heading2, () => c().toggleHeading({ level: 2 }).run())}
      {btn(s?.h3, 'Subheading', Heading3, () => c().toggleHeading({ level: 3 }).run())}
      {sep('b')}
      {btn(s?.bold, 'Bold', Bold, () => c().toggleBold().run())}
      {btn(s?.italic, 'Italic', Italic, () => c().toggleItalic().run())}
      {btn(s?.underline, 'Underline', Underline, () => c().toggleUnderline().run())}
      {btn(s?.strike, 'Strikethrough', Strikethrough, () => c().toggleStrike().run())}
      {btn(s?.code, 'Code', Code, () => c().toggleCode().run())}
      {btn(s?.link, 'Link', Link2, () => {
        if (editor.isActive('link')) return c().unsetLink().run();
        const href = window.prompt('Link to (https://…)');
        if (href && /^https?:\/\//i.test(href.trim())) c().extendMarkRange('link').setLink({ href: href.trim() }).run();
      })}
      {sep('c')}
      {btn(s?.bullet, 'Bulleted list', List, () => c().toggleBulletList().run())}
      {btn(s?.ordered, 'Numbered list', ListOrdered, () => c().toggleOrderedList().run())}
      {btn(s?.task, 'Checklist', ListChecks, () => c().toggleTaskList().run())}
      {btn(s?.quote, 'Quote', Quote, () => c().toggleBlockquote().run())}
      {btn(s?.block, 'Code block', SquareCode, () => c().toggleCodeBlock().run())}
      {btn(false, 'Divider', Minus, () => c().setHorizontalRule().run())}
      {sep('d')}
      {btn(s?.table, s?.table ? 'Add a row' : 'Table', Table, () => (s?.table ? c().addRowAfter().run() : c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()))}
      <button type="button" title="Picture" aria-label="Picture" disabled={disabled || uploading} onMouseDown={(e) => e.preventDefault()} onClick={() => fileRef.current?.click()} className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 disabled:opacity-40">
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
      </button>
      <input ref={fileRef} type="file" accept="image/*" disabled={disabled} className="hidden" onChange={(e) => void addImage(e.target.files?.[0])} />
    </div>
  );
}

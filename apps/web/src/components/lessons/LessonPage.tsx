'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Image from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extensions';
import { CircleHelp, Eye, Layers, Loader2, MessageSquareQuote, Pencil } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { confirmDialog } from '@/components/ui/Dialogs';
import { DocEmbed, EmbedMenu, type ExtraInsert } from '@/components/docs/DocEmbed';
import { DocToolbar } from '@/components/docs/DocToolbar';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { pageDoc, type LessonNode } from '@/lib/lesson-page';
import { Callout, Flashcards, QuickCheck, insertBlock } from './lesson-blocks';

// Rich lesson pages (Stage 5 · B2): a module page written with the document editor (no live room:
// one teacher saves it) plus lesson blocks (lesson-blocks.tsx), videos with chapters, maths and code
// that runs (src/components/docs/DocEmbed.tsx). Students read it with the blocks working. Saved as
// the editor's JSON through the Modules API (update-item), which checks it (src/lib/lesson-page.ts).

/** The page editor's extensions (also for reading cartridge pages into it: CourseCartridge.tsx). */
export const lessonExtensions = (placeholder?: string) => [
  StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
  TableKit.configure({ table: { resizable: false } }),
  TaskList, TaskItem.configure({ nested: true }),
  Image,
  DocEmbed, Callout, QuickCheck, Flashcards,
  ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
];

const pageKey = (courseId: string, itemId: string) => `/api/courses/${courseId}/modules/${itemId}`;
interface PageData { id: string; title: string; body: string | null }

/** A page as students read it (and teachers on Preview). */
export function LessonView({ doc }: { doc: LessonNode }) {
  const editor = useEditor({ immediatelyRender: false, editable: false, extensions: lessonExtensions(), content: doc, editorProps: { attributes: { class: 'doc-prose focus:outline-none', role: 'article', 'aria-label': 'Page' } } }, [doc]);
  return editor ? <EditorContent editor={editor} /> : <div className="h-40 rounded-2xl skeleton" />;
}

/** Loads a rich page and shows it. */
export function LessonReader({ courseId, itemId }: { courseId: string; itemId: string }) {
  const { data, error } = useSWR<PageData>(pageKey(courseId, itemId), authedJson);
  const [doc, setDoc] = useState<{ body: string | null | undefined; doc: LessonNode } | null>(null);
  if (data && doc?.body !== data.body) setDoc({ body: data.body, doc: pageDoc(data.body) });
  if (error) return <p className="text-sm text-rose-700 dark:text-rose-300">{errorMessage(error, 'This page couldn’t load.')}</p>;
  if (!doc) return <div className="h-40 rounded-2xl skeleton" />;
  return <LessonView doc={doc.doc} />;
}

/** The page editor, in a wide sheet: title, toolbar, Insert (video, maths, callouts…), Preview, Save. */
export function LessonEditor({ courseId, item, onClose, onSaved }: {
  courseId: string;
  item: { id: string; title: string; body: string | null; rich?: boolean };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data, error } = useSWR<PageData>(item.rich ? pageKey(courseId, item.id) : null, authedJson);
  const body = item.rich ? data?.body : item.body;
  if (item.rich && error) {
    return <Sheet title="Edit page" wide onClose={onClose}><p className="text-sm text-rose-700 dark:text-rose-300">{errorMessage(error, 'This page couldn’t load.')}</p></Sheet>;
  }
  if (item.rich && !data) return <Sheet title="Edit page" wide onClose={onClose}><div className="h-60 rounded-2xl skeleton" /></Sheet>;
  return <EditorSheet courseId={courseId} itemId={item.id} title={item.title} initial={pageDoc(body)} onClose={onClose} onSaved={onSaved} />;
}

function EditorSheet({ courseId, itemId, title: firstTitle, initial, onClose, onSaved }: {
  courseId: string; itemId: string; title: string; initial: LessonNode; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(firstTitle);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: lessonExtensions('Write the page…  Use Insert for a video with chapters, maths, code, a callout, a quick check or flashcards.'),
    content: initial,
    editorProps: { attributes: { class: 'doc-prose focus:outline-none min-h-[40vh] px-1 py-2', 'aria-label': 'Page text', 'aria-multiline': 'true' } },
    onUpdate: () => { dirty.current = true; },
  }, []);
  const editable = !!editor && !preview;

  const save = async () => {
    if (!editor || busy) return;
    if (!title.trim()) { toast.error('Give the page a title.'); return; }
    setBusy(true);
    try {
      await authedJson(`/api/courses/${courseId}/modules`, { method: 'POST', body: JSON.stringify({ action: 'update-item', itemId, title: title.trim(), body: JSON.stringify(editor.getJSON()) }) });
      dirty.current = false;
      toast.success('Page saved');
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e, 'The page couldn’t be saved. Try again.'));
    } finally {
      setBusy(false);
    }
  };
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; });
  // Ctrl / ⌘ + S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void saveRef.current(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const close = async () => {
    if (busy) return;
    if (!dirty.current || await confirmDialog({ title: 'Leave without saving?', message: 'Your changes to this page will be lost.', confirmLabel: 'Leave', destructive: true })) onClose();
  };
  const togglePreview = () => { if (!editor) return; editor.setEditable(preview); setPreview(!preview); };

  const blocks: ExtraInsert[] = [
    { id: 'callout', label: 'Callout (note, tip…)', icon: MessageSquareQuote, run: (e: Editor) => { if (e.isActive('callout')) e.chain().focus().lift('callout').run(); else e.chain().focus().wrapIn('callout', { tone: 'note' }).run(); } },
    { id: 'quick-check', label: 'Quick check', icon: CircleHelp, run: (e: Editor) => insertBlock(e, { type: 'quickCheck' }) },
    { id: 'flashcards', label: 'Flashcards', icon: Layers, run: (e: Editor) => insertBlock(e, { type: 'flashcards' }) },
  ];

  return (
    <Sheet title="Edit page" wide onClose={() => void close()}
      footer={(
        <div className="flex gap-2">
          <button type="button" onClick={togglePreview} disabled={!editor} aria-pressed={preview} className="btn-secondary flex-1 justify-center">{preview ? <><Pencil className="w-4 h-4" /> Back to editing</> : <><Eye className="w-4 h-4" /> Preview</>}</button>
          <button type="button" onClick={() => void save()} disabled={busy || !editor} className="btn-primary flex-1 justify-center">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save</button>
        </div>
      )}>
      <div className="space-y-3">
        <label className="block">
          <span className="label">Page title</span>
          <input value={title} maxLength={200} onChange={(e) => { setTitle(e.target.value); dirty.current = true; }} className="input" />
        </label>
        <div className="sticky -top-5 z-10 -mx-5 px-3 bg-white/90 dark:bg-[#1b1b1e]/90 backdrop-blur border-y border-zinc-200/70 dark:border-white/[0.07] flex items-center">
          <div className="flex-1 min-w-0"><DocToolbar editor={editor} disabled={!editable} /></div>
          <EmbedMenu editor={editor} disabled={!editable} kinds={['video', 'pdf', 'code', 'math']} extra={blocks} />
        </div>
        {preview && <p className="text-xs text-zinc-600 dark:text-zinc-400">This is how students see it: try the quick checks and flashcards.</p>}
        {editor ? <EditorContent editor={editor} /> : <div className="h-60 rounded-2xl skeleton" />}
      </div>
    </Sheet>
  );
}

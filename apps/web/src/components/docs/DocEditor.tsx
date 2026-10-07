'use client';

import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { TableKit } from '@tiptap/extension-table';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Image from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extensions';
import { toast } from 'sonner';
import { Bold, Code, Heading1, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListChecks, ListOrdered, Loader2, Minus, Quote, Redo2, SquareCode, Strikethrough, Table, Underline, Undo2 } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { uploadChatFile } from '@/components/chat/chat-client';
import { cn } from '@/lib/utils';
import { createMentionStore, docMention, MentionMenu } from './DocMentions';

// The document editor (Stage 4 · 3.2): Tiptap on a Yjs document synced with the doc's room (the
// CodeRoom Durable Object, "doc:<id>"; first byte 0 = document update, 1 = cursors, 2 = someone
// joined, as in src/components/code/CodeEditor.tsx). Everyone's caret shows with their name.
// While you write, a version is saved now and then (src/server/docs.ts keeps at most one every
// 2 minutes).

const DOC = 0, AWARENESS = 1, ANNOUNCE = 2;
const COLORS = ['#6366f1', '#d946ef', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'];
const frame = (type: number, body: Uint8Array) => { const out = new Uint8Array(body.length + 1); out[0] = type; out.set(body, 1); return out; };

export type DocStatus = 'connecting' | 'live' | 'offline' | 'unavailable';

export function DocEditor({ docId, me, onStatus, onPeers, onEditor, onPresence }: {
  docId: string; me: { id: string; name: string };
  onStatus: (s: DocStatus, canEdit: boolean) => void;
  onPeers: (names: string[]) => void;
  /** Who else is here, with their cursor colour (3.8). */
  onPresence?: (people: { name: string; color: string }[]) => void;
  onEditor: (e: Editor | null) => void;
}) {
  const [ydoc] = useState(() => new Y.Doc());
  const [awareness] = useState(() => new Awareness(ydoc));
  // @mentions in the text: the suggestion menu's state (DocMentions.tsx).
  const [mentions] = useState(() => createMentionStore());
  const callbacks = useRef({ onStatus, onPeers, onEditor, onPresence });
  useEffect(() => { callbacks.current = { onStatus, onPeers, onEditor, onPresence }; });
  const color = COLORS[[...me.id].reduce((t, c) => t + c.charCodeAt(0), 0) % COLORS.length];

  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: [
      StarterKit.configure({ undoRedo: false, link: { openOnClick: false, autolink: true } }),
      Collaboration.configure({ document: ydoc, field: 'doc' }),
      CollaborationCaret.configure({ provider: { awareness }, user: { name: me.name, color } }),
      TableKit.configure({ table: { resizable: true } }),
      TaskList, TaskItem.configure({ nested: true }),
      Image,
      docMention(docId, mentions),
      Placeholder.configure({ placeholder: 'Start writing…  Use the toolbar, or type # for a heading, - for a list, [] for a checklist, @ to mention someone.' }),
    ],
    editorProps: { attributes: { class: 'doc-prose focus:outline-none min-h-[60vh] px-6 sm:px-12 py-10' } },
  }, [ydoc]);

  useEffect(() => { callbacks.current.onEditor(editor); return () => callbacks.current.onEditor(null); }, [editor]);

  // The live connection.
  useEffect(() => {
    let ws: WebSocket | null = null, stopped = false, retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const send = (data: Uint8Array) => { if (ws?.readyState === WebSocket.OPEN) ws.send(data); };
    const peers = () => {
      const others = [...awareness.getStates().entries()].filter(([id]) => id !== ydoc.clientID).map(([, s]) => (s as { user?: { name?: string; color?: string } }).user ?? {});
      callbacks.current.onPeers(others.map((u) => u.name ?? 'Someone'));
      callbacks.current.onPresence?.(others.map((u) => ({ name: u.name ?? 'Someone', color: u.color ?? '#6366f1' })));
    };
    const onDoc = (update: Uint8Array, origin: unknown) => { if (origin !== 'remote') send(frame(DOC, update)); };
    const onAware = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (origin === 'local') send(frame(AWARENESS, encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed])));
      peers();
    };
    ydoc.on('update', onDoc);
    awareness.on('update', onAware);
    const connect = async () => {
      if (stopped) return;
      callbacks.current.onStatus('connecting', false);
      let ticket: { path: string; canEdit: boolean };
      try { ticket = await authedJson(`/api/docs/${docId}/ticket`, { method: 'POST' }); }
      catch (e) {
        const status = (e as { status?: number }).status;
        callbacks.current.onStatus(status === 503 || status === 404 ? 'unavailable' : 'offline', false);
        if (status !== 404) timer = setTimeout(connect, Math.min(30_000, 2000 * 2 ** retry++));
        return;
      }
      const url = new URL(ticket.path, window.location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const sock = new WebSocket(url);
      sock.binaryType = 'arraybuffer';
      ws = sock;
      let first = true;
      sock.onmessage = (ev) => {
        if (typeof ev.data === 'string') return;
        const bytes = new Uint8Array(ev.data as ArrayBuffer), body = bytes.subarray(1);
        if (bytes[0] === DOC) {
          Y.applyUpdate(ydoc, body, 'remote');
          if (first) {
            first = false;
            retry = 0;
            if (ticket.canEdit) send(frame(DOC, Y.encodeStateAsUpdate(ydoc)));
            send(frame(AWARENESS, encodeAwarenessUpdate(awareness, [ydoc.clientID])));
            callbacks.current.onStatus('live', ticket.canEdit);
          }
        } else if (bytes[0] === AWARENESS) applyAwarenessUpdate(awareness, body, 'remote');
        else if (bytes[0] === ANNOUNCE) send(frame(AWARENESS, encodeAwarenessUpdate(awareness, [ydoc.clientID])));
      };
      sock.onclose = (ev) => {
        if (ws === sock) ws = null;
        removeAwarenessStates(awareness, [...awareness.getStates().keys()].filter((id) => id !== ydoc.clientID), 'remote');
        if (stopped) return;
        if (ev.code === 4004) return callbacks.current.onStatus('unavailable', false);
        callbacks.current.onStatus(ev.code === 4013 ? 'offline' : 'offline', false);
        if (ev.code === 4013) { toast.error('This document is too large to save more. Remove some content (big tables or pasted images).'); return; }
        timer = setTimeout(connect, ev.code === 4003 ? 0 : Math.min(30_000, 1000 * 2 ** retry++));
      };
    };
    void connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      ws?.close(1000);
      ydoc.off('update', onDoc);
      awareness.off('update', onAware);
    };
  }, [docId, ydoc, awareness]);

  useEffect(() => () => { awareness.destroy(); ydoc.destroy(); }, [awareness, ydoc]);

  // Versions: a few seconds after I stop typing (the server keeps one every 2 minutes at most),
  // and when I leave.
  useEffect(() => {
    if (!editor) return;
    let t: ReturnType<typeof setTimeout> | null = null, dirty = false;
    const save = () => {
      if (!dirty || !editor.isEditable) return;
      dirty = false;
      void authedJson(`/api/docs/${docId}/versions`, { method: 'POST', keepalive: true, body: JSON.stringify({ html: editor.getHTML(), text: editor.getText().slice(0, 300) }) }).catch(() => {});
    };
    const onUpdate = ({ transaction }: { transaction: { getMeta: (k: string) => unknown } }) => {
      if (transaction.getMeta('y-sync$')) return; // someone else's change
      dirty = true;
      if (t) clearTimeout(t);
      t = setTimeout(save, 8000);
    };
    editor.on('update', onUpdate);
    window.addEventListener('pagehide', save);
    return () => { editor.off('update', onUpdate); window.removeEventListener('pagehide', save); if (t) clearTimeout(t); save(); };
  }, [editor, docId]);

  return <><EditorContent editor={editor} /><MentionMenu store={mentions} /></>;
}

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
      <label title="Picture" aria-label="Picture" className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10', disabled ? 'opacity-40 pointer-events-none' : 'cursor-pointer')}>
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
        <input ref={fileRef} type="file" accept="image/*" disabled={disabled} className="hidden" onChange={(e) => void addImage(e.target.files?.[0])} />
      </label>
    </div>
  );
}

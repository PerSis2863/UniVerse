'use client';

import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { TableKit } from '@tiptap/extension-table';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Image from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extensions';
import { toast } from 'sonner';
import { authedJson } from '@/lib/authed-fetch';
import { cacheDoc, cachedDoc, dropCachedDoc } from '@/lib/outbox';
import { createMentionStore, docMention, MentionMenu } from './DocMentions';
import { DocEmbed } from './DocEmbed';
import { SuggestionDelete, SuggestionInsert, Suggestions } from './suggestions-ext';

export { DocToolbar } from './DocToolbar';

// The document editor (Stage 4 · 3.2): Tiptap on a Yjs document synced with the doc's room (the
// CodeRoom Durable Object, "doc:<id>"; first byte 0 = document update, 1 = cursors, 2 = someone
// joined, as in src/components/code/CodeEditor.tsx). Everyone's caret shows with their name.
// While you write, a version is saved now and then (src/server/docs.ts keeps at most one every
// 2 minutes).
//
// Offline (Stage 5 · B9.7): a copy of the document is kept on this device (src/lib/outbox.ts, wiped
// at sign-out), so it opens straight away and, for people who may edit, keeps working when the
// connection drops. What you write offline is sent when you're back, and Yjs merges it with
// everyone else's changes.

const DOC = 0, AWARENESS = 1, ANNOUNCE = 2;
const COLORS = ['#6366f1', '#d946ef', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'];
const frame = (type: number, body: Uint8Array) => { const out = new Uint8Array(body.length + 1); out[0] = type; out.set(body, 1); return out; };

export type DocStatus = 'connecting' | 'live' | 'offline' | 'unavailable';

export function DocEditor({ docId, me, canEdit: mayEdit, onStatus, onPeers, onEditor, onPresence }: {
  docId: string; me: { id: string; name: string };
  /** Whether I may edit, from the document's details (used offline until a ticket says). */
  canEdit: boolean;
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
  const callbacks = useRef({ onStatus, onPeers, onEditor, onPresence, mayEdit });
  useEffect(() => { callbacks.current = { onStatus, onPeers, onEditor, onPresence, mayEdit }; });
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
      DocEmbed,
      SuggestionInsert, SuggestionDelete, Suggestions.configure({ user: me }),
      docMention(docId, mentions),
      Placeholder.configure({ placeholder: 'Start writing…  Use the toolbar, or type # for a heading, - for a list, [] for a checklist, @ to mention someone.' }),
    ],
    editorProps: {
      attributes: { class: 'doc-prose focus:outline-none min-h-[60vh] px-6 sm:px-12 py-10', 'aria-label': 'Document text', 'aria-multiline': 'true' },
      // Links open with a click when reading, or Ctrl / ⌘ + click while writing (pages in the
      // same tab, other sites in a new one; Stage 5 · B9.2).
      handleClick: (view, _pos, event) => {
        const a = (event.target as HTMLElement | null)?.closest?.('a[href]');
        if (!a || (view.editable && !event.metaKey && !event.ctrlKey)) return false;
        const href = a.getAttribute('href') ?? '';
        if (href.startsWith('/')) window.location.assign(href);
        else if (/^(https?:|mailto:)/i.test(href)) window.open(href, '_blank', 'noopener,noreferrer');
        return true;
      },
    },
  }, [ydoc]);

  useEffect(() => { callbacks.current.onEditor(editor); return () => callbacks.current.onEditor(null); }, [editor]);

  // The live connection, and the copy on this device.
  useEffect(() => {
    let ws: WebSocket | null = null, stopped = false, retry = 0, connected = false, asking = false;
    let timer: ReturnType<typeof setTimeout> | null = null, keepTimer: ReturnType<typeof setTimeout> | null = null;
    // Whether I may edit: the last ticket's answer, else the copy's, else the document's details.
    let canEdit: boolean | null = null;
    const mayEditNow = () => canEdit ?? callbacks.current.mayEdit;
    const send = (data: Uint8Array) => { if (ws?.readyState === WebSocket.OPEN) ws.send(data); };
    const keep = () => {
      if (keepTimer) clearTimeout(keepTimer);
      keepTimer = setTimeout(() => { keepTimer = null; void cacheDoc(docId, Y.encodeStateAsUpdate(ydoc), mayEditNow()).catch(() => {}); }, 800);
    };
    const offline = () => callbacks.current.onStatus('offline', mayEditNow());
    const gone = () => { callbacks.current.onStatus('unavailable', false); void dropCachedDoc(docId).catch(() => {}); };
    const peers = () => {
      const others = [...awareness.getStates().entries()].filter(([id]) => id !== ydoc.clientID).map(([, s]) => (s as { user?: { name?: string; color?: string } }).user ?? {});
      callbacks.current.onPeers(others.map((u) => u.name ?? 'Someone'));
      callbacks.current.onPresence?.(others.map((u) => ({ name: u.name ?? 'Someone', color: u.color ?? '#6366f1' })));
    };
    const onDoc = (update: Uint8Array, origin: unknown) => { if (origin !== 'remote' && origin !== 'cache') send(frame(DOC, update)); keep(); };
    const onAware = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (origin === 'local') send(frame(AWARENESS, encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed])));
      peers();
    };
    ydoc.on('update', onDoc);
    awareness.on('update', onAware);
    // The copy on this device goes in first (but never holds things up for long).
    const loaded = Promise.race([cachedDoc(docId).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 1500))]).then((copy) => {
      if (!copy || stopped) return;
      Y.applyUpdate(ydoc, copy.update, 'cache');
      canEdit = copy.canEdit;
    });
    const connect = async () => {
      await loaded;
      if (stopped) return;
      // While reconnecting, stay "offline" (and editable) rather than flicker to "connecting".
      if (connected || retry) offline(); else callbacks.current.onStatus('connecting', false);
      let ticket: { path: string; canEdit: boolean };
      asking = true;
      try { ticket = await authedJson(`/api/docs/${docId}/ticket`, { method: 'POST' }); }
      catch (e) {
        asking = false;
        const status = (e as { status?: number }).status;
        if (status === 404) return gone();
        // No connection, or the live room is down for a moment: keep going on this device.
        offline();
        timer = setTimeout(connect, Math.min(30_000, 2000 * 2 ** retry++));
        return;
      }
      asking = false;
      if (stopped) return;
      canEdit = ticket.canEdit;
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
            connected = true;
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
        if (ev.code === 4004) return gone();
        if (ev.code === 4013) { callbacks.current.onStatus('offline', false); toast.error('This document is too large to save more. Remove some content (big tables or pasted images).'); return; }
        offline();
        timer = setTimeout(connect, ev.code === 4003 ? 0 : Math.min(30_000, 1000 * 2 ** retry++));
      };
    };
    void connect();
    // Back online: try now rather than wait for the next retry.
    const online = () => { if (!ws && !asking && !stopped) { if (timer) clearTimeout(timer); retry = Math.min(retry, 1); void connect(); } };
    window.addEventListener('online', online);
    return () => {
      stopped = true;
      window.removeEventListener('online', online);
      if (timer) clearTimeout(timer);
      if (keepTimer) { clearTimeout(keepTimer); void cacheDoc(docId, Y.encodeStateAsUpdate(ydoc), mayEditNow()).catch(() => {}); }
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

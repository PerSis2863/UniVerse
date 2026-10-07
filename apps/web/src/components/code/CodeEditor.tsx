'use client';
import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { yCollab } from 'y-codemirror.next';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { oneDark } from '@codemirror/theme-one-dark';
import { authedJson } from '@/lib/authed-fetch';

// A shared code editor (src/server/code-rooms.ts, cloudflare/worker.ts CodeRoom). Edits are a
// Yjs document synced over the room's WebSocket: first byte 0 = document update, 1 = cursors
// (awareness), 2 = "someone joined, send your cursor".

const DOC = 0, AWARENESS = 1, ANNOUNCE = 2;
const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#ef4444', '#8b5cf6', '#14b8a6'];

export type Status = 'connecting' | 'live' | 'offline' | 'unavailable';

function language(lang: string): Extension {
  switch (lang) {
    case 'python': return python();
    case 'java': return java();
    case 'cpp': return cpp();
    case 'typescript': return javascript({ typescript: true });
    default: return javascript();
  }
}

function frame(type: number, payload?: Uint8Array) {
  const out = new Uint8Array(1 + (payload?.length ?? 0));
  out[0] = type;
  if (payload) out.set(payload, 1);
  return out;
}

export function CodeEditor({ roomId, lang, me, dark, onStatus, onPeers, onReady, onPresence }: {
  roomId: string;
  lang: string;
  me: { id: string; name: string };
  dark: boolean;
  onStatus: (s: Status, canEdit: boolean) => void;
  onPeers: (names: string[]) => void;
  /** Who else is here, with their cursor colour (3.8). */
  onPresence?: (people: { name: string; color: string }[]) => void;
  /** Gives the page a way to read the current code (for Run). */
  onReady: (getText: () => string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const langSlot = useRef(new Compartment());
  const themeSlot = useRef(new Compartment());
  const editSlot = useRef(new Compartment());
  const view = useRef<EditorView | null>(null);
  const [, force] = useState(0);
  const callbacks = useRef({ onStatus, onPeers, onReady, onPresence });
  useEffect(() => { callbacks.current = { onStatus, onPeers, onReady, onPresence }; });

  useEffect(() => {
    const doc = new Y.Doc();
    const text = doc.getText('code');
    const awareness = new Awareness(doc);
    const color = COLORS[[...me.id].reduce((t, c) => t + c.charCodeAt(0), 0) % COLORS.length];
    awareness.setLocalStateField('user', { name: me.name, color, colorLight: `${color}33` });
    const undoManager = new Y.UndoManager(text);

    view.current = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: '',
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          langSlot.current.of(language(lang)),
          themeSlot.current.of(dark ? oneDark : []),
          editSlot.current.of(EditorState.readOnly.of(true)),
          yCollab(text, awareness, { undoManager }),
          EditorView.theme({ '&': { height: '100%', fontSize: '14px' }, '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }),
        ],
      }),
    });
    callbacks.current.onReady(() => text.toString());

    let ws: WebSocket | null = null;
    let stopped = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const peers = () => {
      const others = [...awareness.getStates().entries()].filter(([id]) => id !== doc.clientID).map(([, s]) => (s as { user?: { name?: string; color?: string } }).user ?? {});
      callbacks.current.onPeers(others.map((u) => u.name ?? 'Someone'));
      callbacks.current.onPresence?.(others.map((u) => ({ name: u.name ?? 'Someone', color: u.color ?? '#6366f1' })));
    };
    const send = (data: Uint8Array) => { if (ws?.readyState === WebSocket.OPEN) ws.send(data); };

    const onDocUpdate = (update: Uint8Array, origin: unknown) => { if (origin !== 'remote') send(frame(DOC, update)); };
    const onAwareness = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (origin === 'local') send(frame(AWARENESS, encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed])));
      peers();
    };
    doc.on('update', onDocUpdate);
    awareness.on('update', onAwareness);

    const connect = async () => {
      if (stopped) return;
      callbacks.current.onStatus('connecting', false);
      let ticket: { path: string; canEdit: boolean };
      try {
        ticket = await authedJson(`/api/code/${roomId}/ticket`, { method: 'POST' });
      } catch (e) {
        const status = (e as { status?: number }).status;
        callbacks.current.onStatus(status === 503 ? 'unavailable' : 'offline', false);
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
        const bytes = new Uint8Array(ev.data as ArrayBuffer);
        const body = bytes.subarray(1);
        if (bytes[0] === DOC) {
          Y.applyUpdate(doc, body, 'remote');
          if (first) {
            first = false;
            retry = 0;
            // Our own edits from while we were disconnected go back up.
            if (ticket.canEdit) send(frame(DOC, Y.encodeStateAsUpdate(doc)));
            send(frame(AWARENESS, encodeAwarenessUpdate(awareness, [doc.clientID])));
            view.current?.dispatch({ effects: editSlot.current.reconfigure(EditorState.readOnly.of(!ticket.canEdit)) });
            callbacks.current.onStatus('live', ticket.canEdit);
            force((n) => n + 1);
          }
        } else if (bytes[0] === AWARENESS) {
          applyAwarenessUpdate(awareness, body, 'remote');
        } else if (bytes[0] === ANNOUNCE) {
          send(frame(AWARENESS, encodeAwarenessUpdate(awareness, [doc.clientID])));
        }
      };
      sock.onclose = (ev) => {
        if (ws === sock) ws = null;
        removeAwarenessStates(awareness, [...awareness.getStates().keys()].filter((id) => id !== doc.clientID), 'remote');
        view.current?.dispatch({ effects: editSlot.current.reconfigure(EditorState.readOnly.of(true)) });
        if (stopped) return;
        if (ev.code === 4004) return callbacks.current.onStatus('unavailable', false); // room deleted
        if (ev.code === 4013) return callbacks.current.onStatus('offline', false); // too large
        callbacks.current.onStatus('offline', false);
        // 4003 (access changed): straight back with a fresh ticket; otherwise back off.
        timer = setTimeout(connect, ev.code === 4003 ? 0 : Math.min(30_000, 1000 * 2 ** retry++));
      };
    };
    void connect();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      ws?.close(1000);
      doc.off('update', onDocUpdate);
      awareness.off('update', onAwareness);
      awareness.destroy();
      view.current?.destroy();
      view.current = null;
      doc.destroy();
    };
    // The room and the person define the connection; language and theme change in place below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, me.id]);

  useEffect(() => { view.current?.dispatch({ effects: langSlot.current.reconfigure(language(lang)) }); }, [lang]);
  useEffect(() => { view.current?.dispatch({ effects: themeSlot.current.reconfigure(dark ? oneDark : []) }); }, [dark]);

  return <div ref={host} className="h-full min-h-[24rem] overflow-hidden rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#282c34]" />;
}

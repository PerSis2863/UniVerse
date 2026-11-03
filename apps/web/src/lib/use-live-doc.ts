'use client';

import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { toast } from 'sonner';
import { authedJson } from '@/lib/authed-fetch';
import { cacheDoc, cachedDoc, dropCachedDoc } from '@/lib/outbox';

// The live connection of a document, spreadsheet or presentation (Stage 4 · 3.2; Office suite):
// a Yjs document synced with the doc's room (the CodeRoom Durable Object, "doc:<id>"; first byte
// 0 = document update, 1 = cursors, 2 = someone joined, as in src/components/code/CodeEditor.tsx).
//
// Offline (Stage 5 · B9.7): a copy is kept on this device (src/lib/outbox.ts, wiped at sign-out),
// so it opens straight away and, for people who may edit, keeps working when the connection drops.
// What's changed offline is sent when you're back, and Yjs merges it with everyone else's changes.

const DOC = 0, AWARENESS = 1, ANNOUNCE = 2;
const frame = (type: number, body: Uint8Array) => { const out = new Uint8Array(body.length + 1); out[0] = type; out.set(body, 1); return out; };

export type DocStatus = 'connecting' | 'live' | 'offline' | 'unavailable';
// Dark enough for white names on them (4.5 : 1).
export const PEOPLE_COLORS = ['#2b3568', '#a32c7b', '#0369a1', '#047857', '#b45309', '#b91c1c', '#2b3568', '#0f766e'];
/** Someone's colour for their cursor or selection. */
export const colorFor = (id: string) => PEOPLE_COLORS[[...id].reduce((t, c) => t + c.charCodeAt(0), 0) % PEOPLE_COLORS.length];

export function useLiveDoc({ docId, ydoc, awareness, mayEdit, onStatus, onPeers, onPresence, tooBig }: {
  docId: string; ydoc: Y.Doc; awareness: Awareness;
  /** Whether I may edit, from the document's details (used offline until a ticket says). */
  mayEdit: boolean;
  onStatus: (s: DocStatus, canEdit: boolean) => void;
  onPeers?: (names: string[]) => void;
  /** Who else is here, with their colour. */
  onPresence?: (people: { name: string; color: string }[]) => void;
  /** What to say when the room refuses more (over its size limit). */
  tooBig?: string;
}) {
  const callbacks = useRef({ onStatus, onPeers, onPresence, mayEdit, tooBig });
  useEffect(() => { callbacks.current = { onStatus, onPeers, onPresence, mayEdit, tooBig }; });

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
      callbacks.current.onPeers?.(others.map((u) => u.name ?? 'Someone'));
      callbacks.current.onPresence?.(others.map((u) => ({ name: u.name ?? 'Someone', color: u.color ?? '#2b3568' })));
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
        if (ev.code === 4013) { callbacks.current.onStatus('offline', false); toast.error(callbacks.current.tooBig ?? 'This document is too large to save more. Remove some content (big tables or pasted images).'); return; }
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
}

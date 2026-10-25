'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import type { PeerPos, RoomState } from '@/lib/play';

// One seat in a UniVerse Play room (cloudflare/game-room.ts): a one-time ticket from the app, then a
// WebSocket that carries the room's state. Scores go up at most twice a second. The room's clock is
// worked out from its messages, so every device counts down to the same moment.

export type RoomStatus = 'connecting' | 'live' | 'reconnecting' | 'gone';
/** Another player in a 3D world (M38): their newest position and when it came. */
export interface Peer extends PeerPos { id: string; name: string; at: number }
export interface Net { peers: React.RefObject<Map<string, Peer>>; sendPos: (p: PeerPos) => void }
const SEND_EVERY = 500;
const POS_EVERY = 100;
const PING_MS = 50_000;

export function useGameRoom(code: string) {
  const [state, setState] = useState<RoomState | null>(null);
  const [status, setStatus] = useState<RoomStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const offset = useRef<number | null>(null);
  const sentAt = useRef(0);
  const later = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Positions in the 3D worlds: kept in a ref (no re-render ten times a second per player).
  const peers = useRef(new Map<string, Peer>());
  const posAt = useRef(0);

  useEffect(() => {
    let stopped = false, retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const again = () => { setStatus('reconnecting'); timer = setTimeout(connect, Math.min(15_000, 1000 * 2 ** retry++)); };
    async function connect() {
      let path: string;
      try { path = (await api.post<{ path: string }>(`/play/rooms/${code}/ticket`)).data.path; }
      catch (e) {
        if (stopped) return;
        const st = (e as { status?: number }).status;
        if (st === 400 || st === 404) { setStatus('gone'); setError(errorMessage(e, 'This room has closed.')); return; }
        return again();
      }
      if (stopped) return;
      const url = new URL(path, window.location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const sock = new WebSocket(url);
      ws.current = sock;
      sock.onmessage = (ev) => {
        if (typeof ev.data !== 'string' || ev.data === 'pong') return;
        let m: RoomState | (Peer & { t: 'pos' });
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'pos') { peers.current.set(m.id, { ...m, at: performance.now() }); return; }
        if (m.t !== 'state') return;
        if (m.phase !== 'playing') peers.current.clear();
        // A message is never early, so the largest gap seen is the closest to the room's real clock.
        const gap = m.now - Date.now();
        offset.current = offset.current === null ? gap : Math.max(offset.current, gap);
        retry = 0;
        setStatus('live');
        setState(m);
      };
      sock.onclose = () => {
        if (ws.current === sock) ws.current = null;
        if (!stopped) again();
      };
    }
    void connect();
    const ping = setInterval(() => { if (ws.current?.readyState === WebSocket.OPEN) ws.current.send('ping'); }, PING_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(ping);
      if (later.current) clearTimeout(later.current);
      ws.current?.close(1000);
      ws.current = null;
    };
  }, [code]);

  const send = useCallback((m: Record<string, unknown>) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(m));
  }, []);
  const clock = useCallback(() => Date.now() + (offset.current ?? 0), []);

  /** The score so far (sent now, or at most half a second later with the newest numbers). */
  const report = useCallback((score: number, step: number) => {
    if (later.current) clearTimeout(later.current);
    const wait = sentAt.current + SEND_EVERY - Date.now();
    const go = () => { later.current = null; sentAt.current = Date.now(); send({ t: 'progress', score, step }); };
    if (wait <= 0) go(); else later.current = setTimeout(go, wait);
  }, [send]);
  const finish = useCallback((score: number, step: number) => {
    if (later.current) clearTimeout(later.current);
    later.current = null;
    send({ t: 'done', score, step });
  }, [send]);

  /** My position in a 3D world (sent at most ten times a second). */
  const sendPos = useCallback((p: PeerPos) => {
    const now = performance.now();
    if (now - posAt.current < POS_EVERY) return;
    posAt.current = now;
    send({ t: 'pos', ...p });
  }, [send]);

  return { state, status, error, send, clock, report, finish, peers, sendPos };
}

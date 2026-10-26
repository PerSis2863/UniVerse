'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import type { PeerPos, RoomState } from '@/lib/play';
import { RoomVoice } from './voice';

// One seat in a UniVerse Play room (cloudflare/game-room.ts): a one-time ticket from the app, then a
// WebSocket that carries the room's state. Scores go up at most twice a second. The room's clock is
// worked out from its messages, so every device counts down to the same moment.

export type RoomStatus = 'connecting' | 'live' | 'reconnecting' | 'gone';
/** Another player in a 3D world (M38): their newest position and when it came. */
export interface Peer extends PeerPos { id: string; name: string; at: number }
/** A chat line in the room (M39). */
export interface ChatLine { id: string; name: string; text: string; at: number; mine: boolean }
export interface Net {
  peers: React.RefObject<Map<string, Peer>>;
  sendPos: (p: PeerPos) => void;
  /** Chat: the last lines, sending, why the last one wasn't sent, and what each player said last (bubbles). */
  chat: ChatLine[];
  sendChat: (text: string) => void;
  chatNotice: string | null;
  said: React.RefObject<Map<string, { text: string; at: number }>>;
  /** Voice: allowed for this account (13+), on, muted, and the voice itself (placing and levels). */
  voice: { allowed: boolean; on: boolean; muted: boolean; toggle: () => Promise<string | null>; mute: (on: boolean) => void; live: React.RefObject<RoomVoice | null> };
}
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
  // Chat and voice (M39).
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [chatNotice, setChatNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const said = useRef(new Map<string, { text: string; at: number }>());
  const myId = useRef<string | null>(null);
  const ice = useRef<RTCIceServer[]>([]);
  const [voiceAllowed, setVoiceAllowed] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const voice = useRef<RoomVoice | null>(null);

  useEffect(() => {
    let stopped = false, retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const again = () => { setStatus('reconnecting'); timer = setTimeout(connect, Math.min(15_000, 1000 * 2 ** retry++)); };
    async function connect() {
      let path: string;
      try {
        const t = (await api.post<{ path: string; voice?: boolean; ice?: RTCIceServer[] }>(`/play/rooms/${code}/ticket`)).data;
        path = t.path; ice.current = t.ice ?? []; setVoiceAllowed(!!t.voice);
      }
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
        type Msg = RoomState | (Peer & { t: 'pos' }) | { t: 'hello'; id: string } | { t: 'chat'; id: string; name: string; text: string; at: number } | { t: 'chat-no'; reason: string }
          | { t: 'voice'; id: string; on: boolean; reply?: boolean } | { t: 'rtc'; from: string; sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit };
        let m: Msg;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'pos') { peers.current.set(m.id, { ...m, at: performance.now() }); return; }
        if (m.t === 'hello') { myId.current = m.id; return; }
        if (m.t === 'chat') {
          const line = { id: m.id, name: m.name, text: m.text, at: m.at, mine: m.id === myId.current };
          said.current.set(m.id, { text: m.text, at: performance.now() });
          setChat((c) => [...c.slice(-29), line]);
          return;
        }
        if (m.t === 'chat-no') { setChatNotice(m.reason); clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setChatNotice(null), 6000); return; }
        if (m.t === 'voice') { voice.current?.onVoice(m); return; }
        if (m.t === 'rtc') { void voice.current?.onRtc(m); return; }
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
      voice.current?.stop(); voice.current = null;
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

  const sendChat = useCallback((text: string) => { setChatNotice(null); send({ t: 'chat', text }); }, [send]);
  /** Voice on or off; resolves with a message when the microphone can't be used. */
  const toggleVoice = useCallback(async () => {
    if (voice.current?.on) { voice.current.stop(); voice.current = null; setVoiceOn(false); return null; }
    const v = new RoomVoice(send, ice.current, () => myId.current);
    try { await v.start(); } catch { return 'The microphone isn’t available. Allow it in the browser to talk.'; }
    voice.current = v; setVoiceOn(true); setMuted(false);
    return null;
  }, [send]);
  const mute = useCallback((on: boolean) => { voice.current?.mute(on); setMuted(on); }, []);

  const voiceApi = useMemo(() => ({ allowed: voiceAllowed, on: voiceOn, muted, toggle: toggleVoice, mute, live: voice }), [voiceAllowed, voiceOn, muted, toggleVoice, mute]);

  return { state, status, error, send, clock, report, finish, peers, sendPos, chat, sendChat, chatNotice, said, voice: voiceApi };
}

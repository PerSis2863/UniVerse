'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Headphones, Loader2, LogOut, MessageSquare, Mic, MicOff, PenTool, Timer, Users } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { SfuLink, kindOf, type MediaKind, type SfuTrack } from '@/lib/sfu-client';
import { CallChatPanel, useCallChat, type RoomLine } from '@/components/call/CallChat';
import { HALL_H, HALL_W, SPAWN, TABLES, ZONES, hearing, tableNear, zoneAt, type Spot } from '@/lib/hall-map';
import { cn } from '@/lib/utils';
import { AUDIO_2G_BPS, AUDIO_BPS, twoGOn } from '@/store/low-data';

// Study Hall (Stage 4 · 4.2): a class's or study group's 2D campus. Walk around (tap, click or the
// arrow keys); people's voices get louder as you get closer and come from their side (each voice is
// received from the SFU only while you're near enough to hear it, then given a volume and a side
// with WebAudio). Sit at a table to talk with everyone at it and open its whiteboard. A focus timer
// (Pomodoro) runs for the whole hall. The hall is a call room (cloudflare/worker.ts, ids hc_/hg_).

interface Ticket { title: string; sfu?: boolean; path: string; iceServers: RTCIceServer[] }
interface WirePeer { peerId: string; name: string; pos?: [number, number, number | null]; sfu?: { sessionId: string; tracks: SfuTrack[] } }
interface Person extends Spot { name: string; sfu?: { sessionId: string; tracks: SfuTrack[] } }
interface HallTimer { startedAt: number; focus: number; brk: number; by: string }
interface Voice { el: HTMLAudioElement; src: MediaStreamAudioSourceNode; gain: GainNode; pan: StereoPannerNode }

const SPEED = 320; // map units a second
const POS_EVERY_MS = 100;
const DROP_AFTER_MS = 5000; // stop receiving a voice once it's been out of earshot this long
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
const fromWire = (p: WirePeer): Person => ({ name: p.name, x: p.pos?.[0] ?? SPAWN.x, y: p.pos?.[1] ?? SPAWN.y, table: p.pos?.[2] ?? null, sfu: p.sfu });
const second = (cb: () => void) => { const t = setInterval(cb, 1000); return () => clearInterval(t); };
const nowSecond = () => Math.floor(Date.now() / 1000);

function Avatar({ p, me, heard }: { p: Spot & { name: string }; me?: boolean; heard?: number }) {
  return (
    <g style={{ transform: `translate(${p.x}px, ${p.y}px)`, transition: me ? undefined : 'transform 160ms linear' }}>
      {!!heard && heard > 0 && <circle r={26} fill="none" stroke="#a5b4fc" strokeOpacity={0.25 + heard * 0.6} strokeWidth={3} />}
      <circle r={20} fill="url(#hall-avatar)" stroke={me ? '#fff' : 'rgba(255,255,255,0.25)'} strokeWidth={me ? 3 : 1.5} />
      <text textAnchor="middle" dy={5} fontSize={13} fontWeight={700} fill="#fff">{initials(p.name)}</text>
      <text textAnchor="middle" y={38} fontSize={12} fill="#e4e4e7" style={{ paintOrder: 'stroke', stroke: '#0b0e1a', strokeWidth: 4 }}>{me ? 'You' : p.name.split(' ')[0]}</text>
    </g>
  );
}

export function HallView({ hallId }: { hallId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [title, setTitle] = useState('Study Hall');
  const [sfu, setSfu] = useState(false);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [me, setMe] = useState<Spot>({ ...SPAWN, table: null });
  const [timer, setTimer] = useState<HallTimer | null>(null);
  const [timerMenu, setTimerMenu] = useState(false);
  const [roomChat, setRoomChat] = useState<RoomLine[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [voice, setVoice] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [narrow, setNarrow] = useState(false);

  const ws = useRef<WebSocket | null>(null);
  const myId = useRef<string | null>(null);
  const ticket = useRef<Ticket | null>(null);
  const link = useRef<SfuLink | null>(null);
  const rpcWait = useRef(new Map<number, { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }>());
  const rpcSeq = useRef(0);
  const meRef = useRef<Spot>({ ...SPAWN, table: null });
  const peopleRef = useRef<Record<string, Person>>({});
  const target = useRef<Spot | null>(null);
  const keys = useRef(new Set<string>());
  const lastSent = useRef(0);
  const voices = useRef(new Map<string, Voice>());
  const far = useRef(new Map<string, number>());
  const audio = useRef<AudioContext | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const voiceOn = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<boolean | null>(null);

  const send = (m: unknown) => { if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(m)); };
  const sendPos = (now = false) => {
    if (!now && Date.now() - lastSent.current < POS_EVERY_MS) return;
    lastSent.current = Date.now();
    const p = meRef.current;
    send({ type: 'pos', x: Math.round(p.x), y: Math.round(p.y), t: p.table });
  };
  const setAll = (fn: (r: Record<string, Person>) => Record<string, Person>) => { peopleRef.current = fn(peopleRef.current); setPeople(peopleRef.current); };

  // ── Voice ────────────────────────────────────────────────────────────────────────────────────
  /** Every voice's volume and side, from where we both are (eased, so walking sounds smooth). */
  const tune = () => {
    const c = audio.current;
    if (!c) return;
    for (const [id, v] of voices.current) {
      const p = peopleRef.current[id];
      const h = p ? hearing(meRef.current, p) : { gain: 0, pan: 0 };
      v.gain.gain.setTargetAtTime(h.gain, c.currentTime, 0.12);
      v.pan.pan.setTargetAtTime(h.pan, c.currentTime, 0.12);
    }
  };
  const dropVoice = (id: string) => {
    const v = voices.current.get(id);
    if (!v) return;
    v.src.disconnect(); v.gain.disconnect(); v.pan.disconnect();
    v.el.srcObject = null;
    voices.current.delete(id);
  };
  /** Receives the voices of people near enough to hear; lets go of those out of earshot for a while. */
  const syncVoices = () => {
    const l = link.current;
    if (!l || !voiceOn.current) return;
    const want: { peerId: string; sessionId: string; track: SfuTrack }[] = [];
    const drop: string[] = [];
    const now = Date.now();
    for (const [id, p] of Object.entries(peopleRef.current)) {
      const track = p.sfu?.tracks.find((t) => kindOf(t) === 'audio');
      if (!track || !p.sfu) continue;
      if (hearing(meRef.current, p).gain > 0) {
        far.current.delete(id);
        if (!l.isPulled(track.trackName)) want.push({ peerId: id, sessionId: p.sfu.sessionId, track });
      } else if (l.isPulled(track.trackName)) {
        const since = far.current.get(id) ?? now;
        far.current.set(id, since);
        if (now - since > DROP_AFTER_MS) { drop.push(track.trackName); far.current.delete(id); dropVoice(id); }
      }
    }
    if (want.length) void l.pull(want).catch(() => {});
    if (drop.length) void l.drop(drop).catch(() => {});
    tune();
  };
  const onTrack = (peerId: string, kind: MediaKind, track: MediaStreamTrack) => {
    if (kind !== 'audio') return;
    const c = audio.current ?? new AudioContext();
    audio.current = c;
    dropVoice(peerId);
    const stream = new MediaStream([track]);
    // Chrome only lets WebAudio hear a call's sound while it also plays in an element (muted here).
    const el = new Audio();
    el.muted = true;
    el.srcObject = stream;
    void el.play().catch(() => {});
    const src = c.createMediaStreamSource(stream);
    const gain = c.createGain();
    gain.gain.value = 0;
    const pan = c.createStereoPanner();
    src.connect(gain).connect(pan).connect(c.destination);
    voices.current.set(peerId, { el, src, gain, pan });
    tune();
  };
  const rpc = (op: string, body: Record<string, unknown> = {}) => new Promise<Record<string, unknown>>((resolve, reject) => {
    const id = ++rpcSeq.current;
    rpcWait.current.set(id, { resolve, reject });
    send({ type: 'sfu', id, op, ...body });
    setTimeout(() => { if (rpcWait.current.delete(id)) reject(new Error('The hall didn’t answer.')); }, 15_000);
  });
  /** A new SFU session: sending my microphone, or only listening. */
  const openLink = async (sendMic: boolean) => {
    const t = ticket.current, you = myId.current;
    if (!t?.sfu || !you) return;
    link.current?.close();
    for (const id of [...voices.current.keys()]) dropVoice(id);
    const l = new SfuLink(rpc, t.iceServers, onTrack);
    link.current = l;
    // 2G mode (4.11): the voice at 16 kbps.
    if (sendMic && mic.current) await l.start(you, mic.current, false, true, twoGOn() ? AUDIO_2G_BPS : AUDIO_BPS);
    else await l.watch(true);
    syncVoices();
  };
  const joinVoice = async () => {
    const c = audio.current ?? new AudioContext();
    audio.current = c;
    await c.resume().catch(() => {});
    voiceOn.current = true;
    setVoice(true);
    let talking = false;
    try {
      mic.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      talking = true;
    } catch { toast('The microphone wasn’t allowed: you can still listen.'); }
    setMicOn(talking);
    try { await openLink(talking); } catch (e) { toast.error((e as Error).message || 'Couldn’t join the voice.'); }
  };
  const toggleMic = async () => {
    const track = mic.current?.getAudioTracks()[0];
    if (!track) return void joinVoice();
    const next = !micOn;
    track.enabled = next;
    await link.current?.replace('audio', next ? track : null);
    setMicOn(next);
  };
  const leaveVoice = () => {
    voiceOn.current = false;
    setVoice(false);
    setMicOn(false);
    mic.current?.getTracks().forEach((t) => t.stop());
    mic.current = null;
    for (const id of [...voices.current.keys()]) dropVoice(id);
    link.current?.close();
    link.current = null;
  };

  // ── The hall's live connection ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let off = false;
    const handle = (msg: Record<string, any>) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (msg.type === 'welcome') {
        myId.current = msg.you;
        setAll(() => Object.fromEntries((msg.peers as WirePeer[]).map((p) => [p.peerId, fromWire(p)])));
        setTimer(msg.hallTimer ?? null);
        setRoomChat(Array.isArray(msg.chat) ? msg.chat : []);
        const start: Spot = { x: SPAWN.x + Math.round((Math.random() - 0.5) * 120), y: SPAWN.y + Math.round((Math.random() - 0.5) * 80), table: null };
        meRef.current = start;
        setMe(start);
        sendPos(true);
        setPhase('live');
        if (voiceOn.current) void openLink(!!mic.current);
      } else if (msg.type === 'joined') {
        setAll((r) => ({ ...r, [msg.peer.peerId]: fromWire(msg.peer) }));
      } else if (msg.type === 'left') {
        dropVoice(msg.peerId);
        setAll((r) => Object.fromEntries(Object.entries(r).filter(([id]) => id !== msg.peerId)));
      } else if (msg.type === 'pos' && Array.isArray(msg.list)) {
        setAll((r) => {
          const next = { ...r };
          for (const [id, x, y, t] of msg.list as [string, number, number, number | null][]) if (id !== myId.current && next[id]) next[id] = { ...next[id], x, y, table: t };
          return next;
        });
        tune();
      } else if (msg.type === 'tracks') {
        // A new session: what they sent before is gone.
        const before = peopleRef.current[msg.from]?.sfu;
        if (before && before.sessionId !== msg.sessionId && link.current) {
          const old = before.tracks.map((t) => t.trackName).filter((n) => link.current!.isPulled(n));
          if (old.length) void link.current.drop(old).catch(() => {});
          dropVoice(msg.from);
        }
        setAll((r) => (r[msg.from] ? { ...r, [msg.from]: { ...r[msg.from], sfu: { sessionId: msg.sessionId, tracks: msg.tracks } } } : r));
        syncVoices();
      } else if (msg.type === 'hall-timer') {
        setTimer(msg.timer ?? null);
        toast(msg.timer ? `${msg.by} started a ${msg.timer.focus}-minute focus timer` : `${msg.by} stopped the focus timer`, { icon: '⏱️' });
      } else if (msg.type === 'chat' && msg.line) {
        setRoomChat((c) => (c.some((x) => x.id === msg.line.id) ? c : [...c.slice(-199), msg.line]));
      } else if (msg.type === 'sfu') {
        const wait = rpcWait.current.get(msg.id);
        rpcWait.current.delete(msg.id);
        if (msg.error) wait?.reject(new Error(msg.error));
        else wait?.resolve(msg.data ?? {});
      }
    };
    (async () => {
      let t: Ticket;
      try {
        t = await authedJson<Ticket>(`/api/calls/${hallId}/ticket`, { method: 'POST', body: JSON.stringify({ kind: 'audio' }) });
      } catch (e) {
        if (!off) { setError((e as Error).message || 'Couldn’t open the Study Hall.'); setPhase('error'); }
        return;
      }
      if (off) return;
      ticket.current = t;
      setTitle(t.title);
      setSfu(!!t.sfu);
      const url = new URL(t.path, window.location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const sock = new WebSocket(url);
      ws.current = sock;
      sock.onmessage = (ev) => { try { handle(JSON.parse(ev.data)); } catch { /* not for us */ } };
      sock.onclose = () => { if (!off) { setError('The connection to the Study Hall dropped.'); setPhase('error'); } };
    })();
    const voicesNow = voices.current;
    return () => {
      off = true;
      ws.current?.close();
      ws.current = null;
      link.current?.close();
      link.current = null;
      for (const v of voicesNow.values()) { v.src.disconnect(); v.el.srcObject = null; }
      voicesNow.clear();
      mic.current?.getTracks().forEach((t) => t.stop());
      mic.current = null;
      voiceOn.current = false;
    };
  }, [hallId, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Walking: tap or click a spot (or a table, to sit at it), or hold the arrow keys or WASD.
  useEffect(() => {
    if (phase !== 'live') return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const k = keys.current;
      let { x, y, table } = meRef.current;
      let moved = false;
      const dx = (k.has('ArrowRight') || k.has('d') ? 1 : 0) - (k.has('ArrowLeft') || k.has('a') ? 1 : 0);
      const dy = (k.has('ArrowDown') || k.has('s') ? 1 : 0) - (k.has('ArrowUp') || k.has('w') ? 1 : 0);
      if (dx || dy) {
        target.current = null;
        const n = Math.hypot(dx, dy);
        x += (dx / n) * SPEED * dt; y += (dy / n) * SPEED * dt; table = null; moved = true;
      } else if (target.current) {
        const tg = target.current;
        const dist = Math.hypot(tg.x - x, tg.y - y), len = SPEED * dt;
        if (dist <= len) { x = tg.x; y = tg.y; table = tg.table; target.current = null; }
        else { x += ((tg.x - x) / dist) * len; y += ((tg.y - y) / dist) * len; table = null; }
        moved = true;
      }
      if (moved) {
        meRef.current = { x: clamp(x, 12, HALL_W - 12), y: clamp(y, 12, HALL_H - 12), table };
        setMe(meRef.current);
        sendPos(!target.current);
        tune();
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const t = setInterval(syncVoices, 400);
    return () => { cancelAnimationFrame(raf); clearInterval(t); };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const MOVE = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd']);
    const typing = (e: KeyboardEvent) => { const el = e.target as HTMLElement | null; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable); };
    const key = (e: KeyboardEvent) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);
    const down = (e: KeyboardEvent) => { if (typing(e) || !MOVE.has(key(e))) return; keys.current.add(key(e)); e.preventDefault(); };
    const up = (e: KeyboardEvent) => { keys.current.delete(key(e)); };
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);

  // Phones see the part of the map around them; computers see it all.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 700));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The focus timer, worked out from when it started (the same on every screen).
  const sec = useSyncExternalStore(second, nowSecond, () => 0);
  let tv: { focus: boolean; left: number } | null = null;
  if (timer && sec) {
    const cycle = (timer.focus + timer.brk) * 60;
    const into = Math.max(0, sec - Math.floor(timer.startedAt / 1000)) % cycle;
    const focus = into < timer.focus * 60;
    tv = { focus, left: focus ? timer.focus * 60 - into : cycle - into };
  }
  const focusNow = tv?.focus ?? null;
  useEffect(() => {
    if (lastFocus.current !== null && focusNow !== null && focusNow !== lastFocus.current) {
      toast(focusNow ? 'Focus time' : 'Break time: stretch, get some water', { icon: focusNow ? '🎯' : '☕' });
      const c = audio.current;
      if (c?.state === 'running') {
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.value = focusNow ? 660 : 880;
        g.gain.setValueAtTime(0.06, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.6);
        o.connect(g).connect(c.destination);
        o.start();
        o.stop(c.currentTime + 0.6);
      }
    }
    lastFocus.current = focusNow;
  }, [focusNow]);

  const chat = useCallChat({ chatId: null, room: roomChat, sendRoom: (m) => send({ type: 'chat', ...m }) });

  const walkTo = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current, m = svg?.getScreenCTM();
    if (!svg || !m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const tbl = tableNear(pt.x, pt.y);
    // Tapping a table walks you there and sits you down.
    target.current = tbl && Math.hypot(tbl.x - pt.x, tbl.y - pt.y) < 40
      ? { x: tbl.x + Math.round((Math.random() - 0.5) * 50), y: tbl.y + 44, table: tbl.n }
      : { x: pt.x, y: pt.y, table: null };
  };
  const sit = (n: number) => { const t = TABLES.find((x) => x.n === n); if (t) target.current = { x: t.x + Math.round((Math.random() - 0.5) * 50), y: t.y + 44, table: n }; };
  const stand = () => { target.current = { x: meRef.current.x, y: meRef.current.y + 60, table: null }; };
  const openBoard = async (n: number) => {
    try {
      const r = await authedJson<{ boardId: string }>(`/api/halls/${hallId}/board`, { method: 'POST', body: JSON.stringify({ n }) });
      window.open(`/boards/${r.boardId}`, '_blank', 'noopener');
    } catch (e) { toast.error((e as Error).message); }
  };
  const leave = () => {
    const kind = hallId.startsWith('hc_') ? 'course' : 'group';
    router.push(`/spaces/${kind}/${hallId.slice(3)}`);
  };

  if (phase === 'error') {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <p className="font-semibold text-zinc-900 dark:text-white">{error}</p>
          <button type="button" onClick={() => { setPhase('connecting'); setAttempt((a) => a + 1); }} className="mt-4 btn-primary">Try again</button>
        </div>
      </div>
    );
  }

  const zone = zoneAt(me.x, me.y);
  const near = me.table ? null : tableNear(me.x, me.y);
  const view = narrow ? { w: 600, h: 420 } : { w: HALL_W, h: HALL_H };
  const vx = narrow ? clamp(me.x - view.w / 2, 0, HALL_W - view.w) : 0;
  const vy = narrow ? clamp(me.y - view.h / 2, 0, HALL_H - view.h) : 0;
  const radius = zone?.voice === 'none' ? 0 : zone?.voice === 'whisper' ? 110 : 280;
  const count = Object.keys(people).length + 1;

  return (
    <div ref={boxRef} className="relative flex-1 min-h-0 flex flex-col bg-[#0b0e1a] text-white overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-white/10">
        <p className="font-semibold truncate min-w-0 flex-1">{title}</p>
        <span className="inline-flex items-center gap-1 text-xs text-zinc-400"><Users className="w-3.5 h-3.5" />{count}</span>
        <div className="relative">
          {tv ? (
            <button type="button" onClick={() => send({ type: 'hall-timer', on: false })} title="Stop the focus timer for everyone"
              className={cn('inline-flex items-center gap-1.5 rounded-full px-3 h-9 text-xs font-semibold tabular-nums', tv.focus ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500' : 'bg-emerald-500/80')}>
              <Timer className="w-3.5 h-3.5" />{tv.focus ? 'Focus' : 'Break'} {mmss(tv.left)}
            </button>
          ) : (
            <button type="button" onClick={() => setTimerMenu((v) => !v)} aria-expanded={timerMenu} className="inline-flex items-center gap-1.5 rounded-full px-3 h-9 text-xs font-semibold bg-white/10 hover:bg-white/15"><Timer className="w-3.5 h-3.5" />Focus timer</button>
          )}
          {timerMenu && !tv && (
            <div className="absolute right-0 top-full mt-2 z-30 w-52 rounded-2xl bg-[#121830] border border-white/10 shadow-2xl p-1.5">
              {[[25, 5], [50, 10]].map(([f, b]) => (
                <button key={f} type="button" onClick={() => { setTimerMenu(false); send({ type: 'hall-timer', on: true, focus: f, brk: b }); }} className="w-full text-left rounded-xl px-3 py-2 text-sm hover:bg-white/10">{f} min focus · {b} min break</button>
              ))}
              <p className="px-3 pt-1 pb-1.5 text-[11px] text-zinc-400">Runs for everyone in the hall.</p>
            </div>
          )}
        </div>
        {voice ? (
          <>
            <button type="button" onClick={() => void toggleMic()} aria-pressed={micOn} aria-label={micOn ? 'Mute' : 'Unmute'} className={cn('w-9 h-9 rounded-full flex items-center justify-center', micOn ? 'bg-white/10 hover:bg-white/15' : 'bg-white text-zinc-900')}>{micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}</button>
            <button type="button" onClick={leaveVoice} className="inline-flex items-center gap-1.5 rounded-full px-3 h-9 text-xs font-semibold bg-white/10 hover:bg-white/15">Leave voice</button>
          </>
        ) : (
          <button type="button" onClick={() => void joinVoice()} disabled={phase !== 'live' || !sfu} title={sfu ? 'Talk with the people near you' : 'Voice needs bigger calls (the SFU), which aren’t set up here.'}
            className="inline-flex items-center gap-1.5 rounded-full px-3 h-9 text-xs font-semibold bg-gradient-to-r from-indigo-500 to-fuchsia-500 disabled:opacity-40"><Headphones className="w-3.5 h-3.5" />Join voice</button>
        )}
        <button type="button" onClick={() => setChatOpen((v) => !v)} aria-expanded={chatOpen} aria-label="Hall chat" className={cn('w-9 h-9 rounded-full flex items-center justify-center', chatOpen ? 'bg-white text-zinc-900' : 'bg-white/10 hover:bg-white/15')}><MessageSquare className="w-4 h-4" /></button>
        <button type="button" onClick={leave} aria-label="Leave the Study Hall" title="Leave" className="w-9 h-9 rounded-full flex items-center justify-center bg-rose-600 hover:bg-rose-500"><LogOut className="w-4 h-4" /></button>
      </div>

      <div className="relative flex-1 min-h-0">
        {phase === 'connecting' ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400"><Loader2 className="w-4 h-4 mr-2 animate-spin" />Opening the Study Hall…</div>
        ) : (
          <svg ref={svgRef} viewBox={`${vx} ${vy} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full touch-none select-none cursor-pointer" onPointerDown={walkTo}
            role="application" aria-label="Study Hall map. Tap or click to walk there, tap a table to sit at it, or use the arrow keys.">
            <defs>
              <linearGradient id="hall-avatar" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6366f1" /><stop offset="1" stopColor="#d946ef" /></linearGradient>
            </defs>
            <rect width={HALL_W} height={HALL_H} fill="#0b0e1a" />
            {ZONES.map((z) => (
              <g key={z.id}>
                <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={28} fill={z.tint} fillOpacity={0.07} stroke={z.tint} strokeOpacity={0.35} strokeWidth={2} />
                <text x={z.x + 22} y={z.y + 36} fontSize={20} fontWeight={700} fill={z.tint}>{z.name}</text>
              </g>
            ))}
            {TABLES.map((t) => (
              <g key={t.n}>
                {[0, 1, 2, 3].map((i) => <circle key={i} cx={t.x + Math.cos((i * Math.PI) / 2) * 46} cy={t.y + Math.sin((i * Math.PI) / 2) * 46} r={8} fill="#252c4d" />)}
                <circle cx={t.x} cy={t.y} r={32} fill="#1b2140" stroke="rgba(255,255,255,0.14)" strokeWidth={2} />
                <text x={t.x} y={t.y + 5} textAnchor="middle" fontSize={14} fill="#a1a1aa">{t.n}</text>
              </g>
            ))}
            {voice && radius > 0 && <circle cx={me.x} cy={me.y} r={radius} fill="#818cf8" fillOpacity={0.04} stroke="#818cf8" strokeOpacity={0.25} strokeDasharray="6 8" />}
            {Object.entries(people).map(([id, p]) => <Avatar key={id} p={p} heard={voice ? hearing(me, p).gain : 0} />)}
            <Avatar p={{ ...me, name: 'You' }} me />
          </svg>
        )}
        {phase === 'live' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
            <div className="pointer-events-auto max-w-md w-full rounded-2xl bg-black/60 backdrop-blur-xl border border-white/10 px-3.5 py-2.5 text-sm flex flex-wrap items-center gap-2">
              <span className="flex-1 min-w-0">
                <span className="font-semibold">{me.table ? `Table ${me.table}` : zone?.name ?? 'The crossing'}</span>
                <span className="block text-xs text-zinc-400">{me.table ? 'Everyone at this table hears each other.' : zone?.hint ?? 'Walk into a room. Tap a table to sit at it.'}</span>
              </span>
              {near && <button type="button" onClick={() => sit(near.n)} className="rounded-full px-3 h-8 text-xs font-semibold bg-gradient-to-r from-indigo-500 to-fuchsia-500">Sit at table {near.n}</button>}
              {me.table && (
                <>
                  <button type="button" onClick={() => void openBoard(me.table!)} className="inline-flex items-center gap-1 rounded-full px-3 h-8 text-xs font-semibold bg-white/10 hover:bg-white/15"><PenTool className="w-3.5 h-3.5" />Whiteboard</button>
                  <button type="button" onClick={stand} className="rounded-full px-3 h-8 text-xs font-semibold bg-white/10 hover:bg-white/15">Stand up</button>
                </>
              )}
            </div>
          </div>
        )}
        <CallChatPanel open={chatOpen} onClose={() => setChatOpen(false)} lines={chat.lines} onSend={chat.send} linked={false} title="the hall" />
      </div>
    </div>
  );
}

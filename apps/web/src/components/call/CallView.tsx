'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Captions, CaptionsOff, ChevronDown, Circle, Link2, Loader2, Maximize2, Mic, MicOff, Minimize2, MonitorUp, Pause, PhoneOff, PictureInPicture2, RefreshCcw, Signal, Square, Video, VideoOff } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { useCalls } from '@/store/calls';
import { authedJson } from '@/lib/authed-fetch';
import { ringback } from '@/lib/call-sounds';
import { CallRecorder, canRecord, uploadRecording, type RecSource } from '@/lib/call-recorder';
import { SfuLink, type SfuTrack } from '@/lib/sfu-client';
import { captionsSupported, useCaptions } from '@/lib/use-captions';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// A UniVerse call (src/server/calls.ts). Two ways to carry it:
//  • Small calls (one-to-one, or bigger ones without the SFU set up): each person connects
//    straight to each other person (WebRTC). Whoever joins sends offers to everyone already there,
//    so two people never offer at once.
//  • Bigger calls (Cloudflare Realtime SFU): one connection each; everyone sends once, hears
//    everyone, and receives video for a few people at a time (screen shares and pinned first),
//    which keeps a class of 30+ smooth on phones and within the SFU's free 1,000 GB a month.
// The call's room (cloudflare/worker.ts CallRoom) passes connection details, who is muted,
// recording and captions; it never carries audio or video.

interface Ticket {
  kind: 'audio' | 'video'; type: 'chat' | 'group' | 'class'; title: string; oneToOne: boolean; conversationId: string | null; host: boolean; sfu?: boolean; max?: number;
  path: string; iceServers: RTCIceServer[];
}
interface Peer { peerId: string; userId: string; name: string; sfu?: { sessionId: string; tracks: SfuTrack[] } }
type Quality = 'good' | 'fair' | 'poor' | null;
interface Remote {
  peer: Peer; stream: MediaStream | null; muted: boolean; camera: boolean; sharing: boolean; cc: boolean; recording: boolean;
  state: RTCPeerConnectionState | 'new'; quality: Quality;
  /** SFU calls: their video isn't being received right now (to save data); tap to see it. */
  paused: boolean;
}
type Phase = 'starting' | 'live' | 'ended' | 'error';
type Info = Omit<Ticket, 'path' | 'iceServers'>;
interface Caption { name: string; text: string; final: boolean; at: number }

const NO_ANSWER_MS = 45_000;
const CAPTION_MS = 5000;
const MAX_REC_MS = 2 * 3600_000;
const MAX_REC_BYTES = 950 * 1024 * 1024;

const fresh = (peer: Peer): Remote => ({ peer, stream: null, muted: false, camera: true, sharing: false, cc: false, recording: false, state: 'new', quality: null, paused: false });

// One audio context and one timer measure everyone's voice (a call of 30 doesn't run 30 of
// each), and a tile re-renders only when its person starts or stops talking.
const meter = {
  ctx: null as AudioContext | null,
  timer: null as ReturnType<typeof setInterval> | null,
  subs: new Set<{ an: AnalyserNode; buf: Uint8Array<ArrayBuffer>; on: boolean; set: (on: boolean) => void }>(),
};
function useSpeaking(stream: MediaStream | null) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (!stream || !stream.getAudioTracks().length) return;
    try { meter.ctx ??= new AudioContext(); } catch { return; }
    const ctx = meter.ctx;
    void ctx.resume().catch(() => {});
    let src: MediaStreamAudioSourceNode;
    try { src = ctx.createMediaStreamSource(stream); } catch { return; }
    const an = ctx.createAnalyser();
    an.fftSize = 256;
    src.connect(an);
    const sub = { an, buf: new Uint8Array(new ArrayBuffer(an.frequencyBinCount)), on: false, set: setSpeaking };
    meter.subs.add(sub);
    meter.timer ??= setInterval(() => {
      for (const s of meter.subs) {
        s.an.getByteFrequencyData(s.buf);
        let sum = 0;
        for (const v of s.buf) sum += v;
        const on = sum / s.buf.length / 60 > 0.12;
        if (on !== s.on) { s.on = on; s.set(on); }
      }
    }, 200);
    return () => {
      meter.subs.delete(sub);
      src.disconnect();
      setSpeaking(false);
      if (!meter.subs.size && meter.timer) { clearInterval(meter.timer); meter.timer = null; }
    };
  }, [stream]);
  return speaking;
}

function initials(name: string) {
  return name.split(/\s+/).map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
}

const QUALITY: Record<Exclude<Quality, null>, { label: string; className: string }> = {
  good: { label: 'Good connection', className: 'text-emerald-400' },
  fair: { label: 'Fair connection', className: 'text-amber-400' },
  poor: { label: 'Weak connection', className: 'text-rose-400' },
};

function Tile({ id, name, stream, mirrored, muted, camera, me, quality, state, paused, compact, animateLayout, onShow, videoRef, silent }: {
  id: string; name: string; stream: MediaStream | null; mirrored?: boolean; muted?: boolean; camera: boolean; me?: boolean; quality?: Quality; state?: string; silent?: boolean;
  paused?: boolean; compact?: boolean; animateLayout?: boolean; onShow?: () => void; videoRef?: (v: HTMLVideoElement | null) => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const speaking = useSpeaking(muted ? null : stream);
  useEffect(() => { if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream; }, [stream]);
  const hasVideo = camera && !paused && !!stream?.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled);
  return (
    <motion.div
      layout={animateLayout}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={spring.smooth}
      data-tile={id}
      className={cn('relative overflow-hidden bg-zinc-900/80 aspect-video flex items-center justify-center ring-2 transition-shadow duration-200', compact ? 'rounded-2xl' : 'rounded-3xl', speaking ? 'ring-emerald-400/90 shadow-[0_0_40px_-8px_rgba(52,211,153,0.6)]' : 'ring-transparent')}
    >
      {/* Remote audio plays through this element too, so it stays even with the camera off. */}
      <video ref={(v) => { ref.current = v; videoRef?.(v); }} data-peer={id} autoPlay playsInline muted={me || silent} className={cn('w-full h-full object-cover transition-opacity duration-300', !hasVideo && 'opacity-0 absolute', mirrored && '-scale-x-100')} />
      {!hasVideo && (
        <motion.div animate={{ scale: speaking ? 1.08 : 1 }} transition={spring.snappy} className={cn('rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-white font-bold shadow-xl shadow-fuchsia-500/20', compact ? 'w-12 h-12 text-lg' : 'w-24 h-24 text-3xl')}>
          {initials(name)}
        </motion.div>
      )}
      <span className={cn('absolute bottom-2 left-2 font-medium text-white bg-black/45 backdrop-blur-md rounded-full flex items-center gap-1.5 max-w-[85%]', compact ? 'text-[11px] px-2 py-0.5' : 'text-xs px-3 py-1')}>
        {muted && <MicOff className="w-3 h-3 shrink-0" />}<span className="truncate">{me ? `${name} (you)` : name}</span>
      </span>
      {paused && onShow && (
        <button type="button" onClick={onShow} className="absolute top-2 left-2 text-[11px] text-white bg-black/55 hover:bg-black/70 backdrop-blur-md rounded-full px-2.5 py-1 transition-colors">Show video</button>
      )}
      {quality && !me && (
        <span className={cn('absolute top-2 right-2 bg-black/45 backdrop-blur-md rounded-full p-1.5', QUALITY[quality].className)} title={QUALITY[quality].label} aria-label={QUALITY[quality].label}><Signal className="w-3.5 h-3.5" /></span>
      )}
      {state && state !== 'connected' && state !== 'new' && (
        <span className="absolute top-2 left-2 text-[11px] text-white bg-black/55 backdrop-blur-md rounded-full px-2.5 py-1">{state === 'connecting' ? 'Connecting…' : state === 'failed' || state === 'disconnected' ? 'Reconnecting…' : state}</span>
      )}
    </motion.div>
  );
}

function gridFor(count: number) {
  if (count <= 1) return 'grid-cols-1 max-w-3xl w-full mx-auto';
  if (count === 2) return 'grid-cols-1 sm:grid-cols-2 max-w-6xl w-full mx-auto';
  if (count <= 4) return 'grid-cols-2 max-w-5xl w-full mx-auto';
  if (count <= 9) return 'grid-cols-2 sm:grid-cols-3';
  if (count <= 16) return 'grid-cols-3 lg:grid-cols-4';
  return 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6';
}

export function CallView({ callId, myName, wantKind, onLeave, held = false, heldIndex = 0, minimized = false, onMinimize, onExpand, onResume }: {
  callId: string; myName: string; wantKind?: 'audio' | 'video'; onLeave: (conversationId: string | null) => void;
  /** Another call is active: this one is on hold (your mic off, their audio silent). */
  held?: boolean; heldIndex?: number;
  /** Shrunk to a floating bar while you use the app (CallHost). */
  minimized?: boolean; onMinimize?: () => void; onExpand?: () => void; onResume?: () => void;
}) {
  const [voicemail, setVoicemail] = useState<null | 'offer' | 'recording' | 'sending'>(null);
  const vmRec = useRef<{ rec: MediaRecorder; stream: MediaStream; chunks: Blob[]; start: number } | null>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [screen, setScreen] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [camera, setCamera] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [remotes, setRemotes] = useState<Record<string, Remote>>({});
  const [seconds, setSeconds] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [talked, setTalked] = useState(false); // someone has connected at least once
  const [sfuQuality, setSfuQuality] = useState<Quality>(null);
  const [cc, setCc] = useState(false);
  const [captions, setCaptions] = useState<Record<string, Caption>>({});
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);

  const ws = useRef<WebSocket | null>(null);
  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const sfuRef = useRef<SfuLink | null>(null);
  const rpcWait = useRef(new Map<number, { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }>());
  const rpcSeq = useRef(0);
  const remotesRef = useRef<Record<string, Remote>>({});
  const pinned = useRef<string | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStreamTrack | null>(null);
  const ice = useRef<RTCIceServer[]>([]);
  const stateRef = useRef({ muted: false, camera: true, sharing: false, cc: false, recording: false });
  const ended = useRef(false);
  const everJoined = useRef(false);
  const talkStart = useRef<number | null>(null);
  const infoRef = useRef<Info | null>(null);
  const firstRemoteVideo = useRef<HTMLVideoElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<CallRecorder | null>(null);
  const recSourcesRef = useRef<() => RecSource[]>(() => []);

  const send = (msg: unknown) => { if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg)); };
  const announce = () => send({ type: 'state', ...stateRef.current });

  /** Updates the people in the call (the ref is read by connection handlers; state renders). */
  const setR = useCallback((fn: (r: Record<string, Remote>) => Record<string, Remote>) => {
    remotesRef.current = fn(remotesRef.current);
    setRemotes(remotesRef.current);
  }, []);
  const patch = useCallback((peerId: string, p: Partial<Remote>) => setR((r) => (r[peerId] ? { ...r, [peerId]: { ...r[peerId], ...p } } : r)), [setR]);

  const markTalking = () => {
    everJoined.current = true;
    talkStart.current ??= Date.now();
    setTalked(true);
  };

  // ── Small calls: one connection per person ──────────────────────────────────────────────────
  const connectTo = useCallback((peer: Peer) => {
    pcs.current.get(peer.peerId)?.close();
    const pc = new RTCPeerConnection({ iceServers: ice.current });
    pcs.current.set(peer.peerId, pc);
    setR((r) => ({ ...r, [peer.peerId]: r[peer.peerId] ?? fresh(peer) }));
    for (const track of localRef.current?.getTracks() ?? []) pc.addTrack(track, localRef.current!);
    if (screenRef.current) void pc.getTransceivers().find((t) => t.receiver.track.kind === 'video')?.sender.replaceTrack(screenRef.current);
    pc.onicecandidate = (e) => { if (e.candidate) send({ type: 'signal', to: peer.peerId, data: { candidate: e.candidate } }); };
    pc.ontrack = (e) => patch(peer.peerId, { stream: e.streams[0] ?? new MediaStream([e.track]) });
    pc.onconnectionstatechange = () => {
      patch(peer.peerId, { state: pc.connectionState });
      if (pc.connectionState === 'connected') markTalking();
      if (pc.connectionState === 'failed') pc.restartIce();
    };
    return pc;
  }, [setR, patch]);  

  // ── Bigger calls: what to receive from the SFU ─────────────────────────────────────────────
  /** Everyone's audio; video for a few people (pinned, then screen shares, then cameras). */
  const syncSfu = useCallback(() => {
    const link = sfuRef.current;
    if (!link) return;
    const rs = Object.values(remotesRef.current).filter((r) => r.peer.sfu);
    const tracksOf = (r: Remote, kind: 'audio' | 'video') => r.peer.sfu!.tracks.filter((t) => t.kind === kind).map((track) => ({ peerId: r.peer.peerId, sessionId: r.peer.sfu!.sessionId, track }));
    const slots = window.innerWidth < 640 ? 4 : 6;
    const score = (r: Remote) => (pinned.current === r.peer.peerId ? 4 : 0) + (r.sharing ? 2 : 0);
    const seen = new Set(rs.filter((r) => r.camera || r.sharing).sort((a, b) => score(b) - score(a)).slice(0, slots).map((r) => r.peer.peerId));
    const pull = rs.flatMap((r) => [...tracksOf(r, 'audio'), ...(seen.has(r.peer.peerId) ? tracksOf(r, 'video') : [])]);
    const drop = rs.filter((r) => !seen.has(r.peer.peerId)).flatMap((r) => tracksOf(r, 'video')).filter((t) => link.isPulled(t.track.trackName));
    if (drop.length) {
      void link.drop(drop.map((t) => t.track.trackName)).catch((e) => console.warn('SFU drop failed', e));
      setR((r) => {
        const next = { ...r };
        for (const id of new Set(drop.map((t) => t.peerId))) if (next[id]) next[id] = { ...next[id], stream: new MediaStream(next[id].stream?.getAudioTracks() ?? []) };
        return next;
      });
    }
    setR((r) => {
      let changed = false;
      const next = { ...r };
      for (const x of rs) {
        const paused = (x.camera || x.sharing) && !seen.has(x.peer.peerId);
        if (next[x.peer.peerId] && next[x.peer.peerId].paused !== paused) { next[x.peer.peerId] = { ...next[x.peer.peerId], paused }; changed = true; }
      }
      return changed ? next : r;
    });
    if (pull.some((p) => !link.isPulled(p.track.trackName))) void link.pull(pull).catch((e) => console.warn('SFU pull failed', e));
  }, [setR]);

  const onSfuTrack = useCallback((peerId: string, kind: 'audio' | 'video', track: MediaStreamTrack) => {
    markTalking();
    setR((r) => {
      const x = r[peerId];
      if (!x) return r;
      const keep = x.stream?.getTracks().filter((t) => t.kind !== kind) ?? [];
      return { ...r, [peerId]: { ...x, stream: new MediaStream([...keep, track]), state: 'connected' } };
    });
  }, [setR]);  

  const rpc = useCallback((op: string, body: Record<string, unknown> = {}) => new Promise<Record<string, unknown>>((resolve, reject) => {
    const id = ++rpcSeq.current;
    rpcWait.current.set(id, { resolve, reject });
    send({ type: 'sfu', id, op, ...body });
    setTimeout(() => { if (rpcWait.current.delete(id)) reject(new Error('The call server didn’t answer.')); }, 15_000);
  }), []);  

  const stopRecording = useCallback(async () => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    setRecording(false);
    stateRef.current.recording = false;
    announce();
    const { blob, durationSec } = await rec.stop();
    if (blob.size < 1024) return;
    const t = toast.loading('Saving the recording… 0%');
    try {
      const saved = await uploadRecording(callId, blob, durationSec, authedJson, (p) => toast.loading(`Saving the recording… ${Math.round(p * 100)}%`, { id: t }));
      toast.success(`“${saved.title}” is in the class materials`, { id: t });
    } catch (e) {
      toast.error((e as Error).message || 'Couldn’t save the recording.', { id: t, duration: 10_000 });
      // Don't lose the class: offer the file instead.
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `class-recording-${new Date().toISOString().slice(0, 16).replace(':', '-')}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
      a.click();
    }
  }, [callId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Leaves the call. The last one out of a chat call records how it went (shown on the call in the chat). */
  const finish = useCallback((why?: string) => {
    if (ended.current) return;
    ended.current = true;
    if (why) setNotice(why);
    const alone = sfuRef.current
      ? Object.values(remotesRef.current).length === 0
      : pcs.current.size === 0 || [...pcs.current.values()].every((pc) => pc.connectionState !== 'connected');
    if (recRef.current) void stopRecording();
    ws.current?.close(1000);
    for (const pc of pcs.current.values()) pc.close();
    pcs.current.clear();
    sfuRef.current?.close();
    sfuRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current?.stop();
    const i = infoRef.current;
    if (alone && i?.type === 'chat') {
      const durationSec = talkStart.current ? Math.round((Date.now() - talkStart.current) / 1000) : 0;
      void authedJson(`/api/calls/${callId}/end`, { method: 'POST', body: JSON.stringify({ durationSec, answered: everJoined.current }), keepalive: true }).catch(() => {});
    }
    setPhase('ended');
    // Nobody answered a one-to-one call: offer to leave a voice message (like voicemail).
    if (why === 'No answer' && i?.oneToOne && i.conversationId) { setVoicemail('offer'); return; }
    setTimeout(() => onLeave(i?.conversationId ?? null), why ? 1400 : 250);
  }, [callId, onLeave, stopRecording]);

  // "End & answer" (IncomingCall) ends this call through the call list.
  useEffect(() => {
    useCalls.getState().setEnder(callId, () => finish());
    return () => useCalls.getState().setEnder(callId, null);
  }, [callId, finish]);

  // On hold: my microphone sends nothing and their audio is silent (Tile silent), until resumed.
  useEffect(() => {
    if (phase !== 'live') return;
    const mic = localRef.current?.getAudioTracks()[0] ?? null;
    const off = held || stateRef.current.muted;
    if (mic) mic.enabled = !off;
    void sfuRef.current?.replace('audio', off ? null : mic);
    send({ type: 'state', ...stateRef.current, muted: off });
  }, [held, phase]);  

  const recordVoicemail = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.start();
      vmRec.current = { rec, stream, chunks, start: Date.now() };
      setVoicemail('recording');
      haptic('tap');
    } catch {
      toast.error('Allow the microphone to leave a voice message.');
    }
  };
  const sendVoicemail = async () => {
    const v = vmRec.current;
    const conversationId = infoRef.current?.conversationId;
    if (!v || !conversationId) return;
    setVoicemail('sending');
    await new Promise<void>((resolve) => { v.rec.onstop = () => resolve(); v.rec.stop(); });
    v.stream.getTracks().forEach((t) => t.stop());
    try {
      const type = v.rec.mimeType || 'audio/webm';
      const file = new File([new Blob(v.chunks, { type })], `voicemail-${Date.now()}.${type.includes('mp4') ? 'm4a' : 'webm'}`, { type });
      const { uploadChatFile } = await import('@/components/chat/chat-client');
      const url = await uploadChatFile(file);
      const msg = await authedJson<{ id: string }>(`/api/chat/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ type: 'AUDIO', attachmentUrl: url, attachmentName: file.name, attachmentSize: file.size, attachmentMime: type, durationSec: Math.max(1, Math.round((Date.now() - v.start) / 1000)), voicemail: true }) });
      // Transcribed straight away, so they can read it at a glance (one AI request).
      void authedJson(`/api/chat/messages/${msg.id}/transcribe`, { method: 'POST' }).catch(() => {});
      toast.success('Voice message sent');
    } catch (e) {
      toast.error((e as Error).message || 'Couldn’t send the voice message.');
    }
    vmRec.current = null;
    onLeave(conversationId);
  };

  useEffect(() => {
    let cancelled = false;
    let retry = 0;
    const conns = pcs.current;
    const known = new Map<string, Peer>();

    const onSignal = async (from: string, data: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) => {
      let pc = pcs.current.get(from);
      if (!pc && data.sdp?.type === 'offer') pc = connectTo(known.get(from) ?? { peerId: from, userId: '', name: 'Someone' });
      if (!pc) return;
      if (data.sdp) {
        await pc.setRemoteDescription(data.sdp);
        if (data.sdp.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          send({ type: 'signal', to: from, data: { sdp: pc.localDescription } });
        }
      } else if (data.candidate) {
        await pc.addIceCandidate(data.candidate).catch(() => {});
      }
    };

    /** Joins through the SFU: send my tracks once, then receive others'. */
    const joinSfu = async (you: string, peers: Peer[], t: Ticket) => {
      sfuRef.current?.close();
      const link = new SfuLink(rpc, t.iceServers, onSfuTrack);
      sfuRef.current = link;
      setR(() => Object.fromEntries(peers.map((p) => [p.peerId, fresh(p)])));
      let lastQ = 0;
      link.pc.onconnectionstatechange = () => {
        if (link.pc.connectionState === 'failed') link.pc.restartIce();
        if (Date.now() - lastQ > 1000) { lastQ = Date.now(); setSfuQuality(link.pc.connectionState === 'connected' ? 'good' : link.pc.connectionState === 'failed' ? 'poor' : null); }
      };
      try {
        await link.start(you, localRef.current!, t.kind === 'video');
        if (stateRef.current.muted) await link.replace('audio', null);
        if (screenRef.current) await link.replace('video', screenRef.current, true);
        else if (!stateRef.current.camera) await link.replace('video', null);
        syncSfu();
      } catch (e) {
        console.warn('SFU join failed', e);
        toast.error('Couldn’t connect to the call server. Trying again…');
        ws.current?.close();
      }
    };

    const open = async () => {
      if (cancelled || ended.current) return;
      let t: Ticket;
      try {
        t = await authedJson<Ticket>(`/api/calls/${callId}/ticket`, { method: 'POST', body: JSON.stringify({ kind: wantKind }) });
      } catch (e) {
        setError((e as Error).message || 'Couldn’t join the call.');
        setPhase('error');
        return;
      }
      ice.current = t.iceServers;
      infoRef.current = { kind: t.kind, type: t.type, title: t.title, oneToOne: t.oneToOne, conversationId: t.conversationId, host: t.host, sfu: t.sfu, max: t.max };
      setInfo(infoRef.current);
      if (!localRef.current) {
        try {
          // Bigger calls send smaller video: it goes to many people.
          const video = t.kind === 'video' ? (t.sfu ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 }, facingMode: 'user' } : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }) : false;
          localRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video });
          setLocal(localRef.current);
        } catch (e) {
          const name = (e as Error).name;
          setError(name === 'NotAllowedError' ? `Allow the ${t.kind === 'video' ? 'camera and microphone' : 'microphone'} to join the call.` : 'No microphone or camera was found.');
          setPhase('error');
          return;
        }
      }
      const url = new URL(t.path, window.location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const sock = new WebSocket(url);
      ws.current = sock;
      sock.onmessage = async (ev) => {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === 'welcome') {
          retry = 0;
          setPhase('live');
          for (const p of msg.peers as Peer[]) known.set(p.peerId, p);
          announce();
          if (t.sfu) {
            await joinSfu(msg.you, msg.peers, t);
          } else {
            for (const p of msg.peers as Peer[]) {
              const pc = connectTo(p);
              await pc.setLocalDescription(await pc.createOffer());
              send({ type: 'signal', to: p.peerId, data: { sdp: pc.localDescription } });
            }
          }
        } else if (msg.type === 'joined') {
          known.set(msg.peer.peerId, msg.peer);
          setR((r) => ({ ...r, [msg.peer.peerId]: r[msg.peer.peerId] ?? fresh(msg.peer) }));
          announce();
        } else if (msg.type === 'sfu') {
          const wait = rpcWait.current.get(msg.id);
          rpcWait.current.delete(msg.id);
          if (msg.error) wait?.reject(new Error(msg.error));
          else wait?.resolve(msg.data ?? {});
        } else if (msg.type === 'tracks') {
          setR((r) => (r[msg.from] ? { ...r, [msg.from]: { ...r[msg.from], peer: { ...r[msg.from].peer, sfu: { sessionId: msg.sessionId, tracks: msg.tracks } } } } : r));
          syncSfu();
        } else if (msg.type === 'signal') {
          await onSignal(msg.from, msg.data).catch((e) => console.warn('call signal failed', e));
        } else if (msg.type === 'state') {
          const before = remotesRef.current[msg.from];
          if (msg.recording && before && !before.recording) toast(`${before.peer.name} started recording this class`, { icon: '⏺' });
          patch(msg.from, { muted: msg.muted, camera: msg.camera, sharing: msg.sharing, cc: msg.cc === true, recording: msg.recording === true });
          if (sfuRef.current && before && (before.camera !== msg.camera || before.sharing !== msg.sharing)) syncSfu();
        } else if (msg.type === 'caption') {
          const who = remotesRef.current[msg.from];
          if (who && stateRef.current.cc) setCaptions((c) => ({ ...c, [msg.from]: { name: who.peer.name, text: String(msg.text), final: !!msg.final, at: Date.now() } }));
        } else if (msg.type === 'left') {
          pcs.current.get(msg.peerId)?.close();
          pcs.current.delete(msg.peerId);
          const gone = remotesRef.current[msg.peerId];
          if (gone?.peer.sfu && sfuRef.current) void sfuRef.current.drop(gone.peer.sfu.tracks.map((x) => x.trackName)).catch(() => {});
          if (pinned.current === msg.peerId) pinned.current = null;
          setR((r) => Object.fromEntries(Object.entries(r).filter(([id]) => id !== msg.peerId)));
          setCaptions((c) => (c[msg.peerId] ? Object.fromEntries(Object.entries(c).filter(([id]) => id !== msg.peerId)) : c));
          if (sfuRef.current) syncSfu();
        } else if (msg.type === 'declined') {
          toast(`${msg.name || 'They'} declined the call`);
          if (t.oneToOne && pcs.current.size === 0) finish('Declined');
        }
      };
      sock.onclose = () => {
        if (ws.current === sock) ws.current = null;
        for (const w of rpcWait.current.values()) w.reject(new Error('Disconnected'));
        rpcWait.current.clear();
        // Small calls already connected keep going browser to browser; reconnect so new people can
        // join. Bigger calls rejoin the SFU on reconnect (a new session).
        if (!cancelled && !ended.current && retry < 6) setTimeout(open, Math.min(15_000, 1000 * 2 ** retry++));
      };
    };
    void open();

    return () => {
      cancelled = true;
      ws.current?.close(1000);
      for (const pc of conns.values()) pc.close();
      conns.clear();
      sfuRef.current?.close();
      sfuRef.current = null;
      localRef.current?.getTracks().forEach((t) => t.stop());
      screenRef.current?.stop();
    };
  }, [callId, connectTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = Object.values(remotes);
  const waiting = phase === 'live' && list.length === 0;

  // Ringback while a chat call waits for the other side; one-to-one calls give up after 45 s.
  useEffect(() => {
    if (!waiting || info?.type !== 'chat' || everJoined.current) return;
    const stop = ringback();
    const t = info.oneToOne ? setTimeout(() => finish('No answer'), NO_ANSWER_MS) : null;
    return () => { stop(); if (t) clearTimeout(t); };
  }, [waiting, info, finish]);

  // Talk time (from the first connection), and connection quality every few seconds.
  useEffect(() => {
    if (phase !== 'live') return;
    const t = setInterval(() => setSeconds(talkStart.current ? Math.round((Date.now() - talkStart.current) / 1000) : 0), 1000);
    const measure = async (pc: RTCPeerConnection): Promise<Quality> => {
      const stats = await pc.getStats().catch(() => null);
      let rtt: number | null = null, lost = 0, got = 0;
      stats?.forEach((s) => {
        if (s.type === 'candidate-pair' && s.state === 'succeeded' && typeof s.currentRoundTripTime === 'number') rtt = s.currentRoundTripTime;
        if (s.type === 'inbound-rtp') { lost += s.packetsLost ?? 0; got += s.packetsReceived ?? 0; }
      });
      const loss = got ? lost / (lost + got) : 0;
      return rtt === null ? null : rtt > 0.4 || loss > 0.08 ? 'poor' : rtt > 0.2 || loss > 0.03 ? 'fair' : 'good';
    };
    const q = setInterval(async () => {
      const link = sfuRef.current;
      if (link) {
        if (link.pc.connectionState === 'connected') setSfuQuality(await measure(link.pc));
        return;
      }
      for (const [id, pc] of pcs.current) {
        if (pc.connectionState !== 'connected') continue;
        const quality = await measure(pc);
        if (remotesRef.current[id]?.quality !== quality) patch(id, { quality });
      }
    }, 4000);
    return () => { clearInterval(t); clearInterval(q); };
  }, [phase, patch]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // ── Captions ──────────────────────────────────────────────────────────────────────────────
  // My browser listens only while someone in the call wants captions and I'm not muted.
  const wantCaptions = phase === 'live' && (cc || list.some((r) => r.cc));
  useCaptions(
    wantCaptions && !muted,
    (text, final) => {
      send({ type: 'caption', text, final });
      if (stateRef.current.cc) setCaptions((c) => ({ ...c, me: { name: 'You', text, final, at: Date.now() } }));
    },
    (why) => toast.error(why),
  );
  const hasCaptions = Object.keys(captions).length > 0;
  useEffect(() => {
    if (!hasCaptions) return;
    const t = setInterval(() => setCaptions((c) => {
      const now = Date.now();
      const keep = Object.entries(c).filter(([, x]) => now - x.at < (x.final ? CAPTION_MS : CAPTION_MS * 2));
      return keep.length === Object.keys(c).length ? c : Object.fromEntries(keep);
    }), 1000);
    return () => clearInterval(t);
  }, [hasCaptions]);

  const toggleCc = () => {
    const next = !cc;
    setCc(next);
    stateRef.current.cc = next;
    if (!next) setCaptions({});
    else if (!captionsSupported()) toast('This browser can’t caption your voice, but you’ll see everyone else’s captions. Chrome, Edge and Safari can.');
    announce();
  };

  // ── Recording (class teacher) ──────────────────────────────────────────────────────────────
  useEffect(() => { recSourcesRef.current = () => {
    const root = rootRef.current;
    const videoOf = (id: string) => root?.querySelector<HTMLVideoElement>(`video[data-peer="${CSS.escape(id)}"]`) ?? null;
    const kindNow = infoRef.current?.kind ?? 'audio';
    return [
      { name: myName, stream: local, video: videoOf('me'), showVideo: kindNow === 'video' && (camera || sharing), sharing },
      ...list.map((r) => ({ name: r.peer.name, stream: r.stream, video: videoOf(r.peer.peerId), showVideo: kindNow === 'video' && (r.camera || r.sharing) && !r.paused, sharing: r.sharing })),
    ];
  }; });

  const startRecording = () => {
    try {
      recRef.current = new CallRecorder(() => recSourcesRef.current(), (infoRef.current?.kind ?? 'audio') === 'video');
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }
    setRecording(true);
    setRecSeconds(0);
    stateRef.current.recording = true;
    announce();
    toast.success('Recording. Everyone in the call can see it. It’s saved to the class materials when you stop.');
  };

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      const rec = recRef.current;
      if (!rec) return;
      setRecSeconds(Math.round((Date.now() - rec.startedAt) / 1000));
      if (Date.now() - rec.startedAt > MAX_REC_MS || rec.bytes > MAX_REC_BYTES) {
        toast('The recording reached its 2-hour limit and is being saved.');
        void stopRecording();
      }
    }, 1000);
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => { clearInterval(t); window.removeEventListener('beforeunload', warn); };
  }, [recording, stopRecording]);

  // ── Controls ──────────────────────────────────────────────────────────────────────────────
  const toggleMute = () => {
    haptic('tap');
    const next = !muted;
    localRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    // Through the SFU a muted mic sends nothing at all.
    void sfuRef.current?.replace('audio', next ? null : localRef.current?.getAudioTracks()[0] ?? null);
    setMuted(next);
    stateRef.current.muted = next;
    announce();
  };

  const toggleCamera = () => {
    haptic('tap');
    const next = !camera;
    localRef.current?.getVideoTracks().forEach((t) => { t.enabled = next; });
    if (!screenRef.current) void sfuRef.current?.replace('video', next ? localRef.current?.getVideoTracks()[0] ?? null : null);
    setCamera(next);
    stateRef.current.camera = next;
    announce();
  };

  const replaceVideo = async (track: MediaStreamTrack | null, isScreen = false) => {
    if (sfuRef.current) return sfuRef.current.replace('video', track, isScreen);
    for (const pc of pcs.current.values()) {
      const sender = pc.getTransceivers().find((t) => t.receiver.track.kind === 'video')?.sender;
      await sender?.replaceTrack(track).catch(() => {});
    }
  };

  const flipCamera = async () => {
    const current = localRef.current?.getVideoTracks()[0];
    const facing = current?.getSettings().facingMode === 'environment' ? 'user' : 'environment';
    try {
      const track = (await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } })).getVideoTracks()[0];
      if (!screenRef.current) await replaceVideo(track);
      if (current) { localRef.current!.removeTrack(current); current.stop(); }
      localRef.current!.addTrack(track);
      setLocal(new MediaStream(localRef.current!.getTracks()));
    } catch { /* only one camera */ }
  };

  const stopShare = async () => {
    screenRef.current?.stop();
    screenRef.current = null;
    setScreen(null);
    await replaceVideo(stateRef.current.camera ? localRef.current?.getVideoTracks()[0] ?? null : sfuRef.current ? null : localRef.current?.getVideoTracks()[0] ?? null);
    setSharing(false);
    stateRef.current.sharing = false;
    announce();
  };
  const toggleShare = async () => {
    if (sharing) return stopShare();
    try {
      const track = (await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15 } } })).getVideoTracks()[0];
      track.contentHint = 'detail';
      screenRef.current = track;
      setScreen(new MediaStream([track]));
      await replaceVideo(track, true);
      track.onended = () => { void stopShare(); };
      setSharing(true);
      stateRef.current.sharing = true;
      announce();
    } catch { /* cancelled */ }
  };

  const pip = async () => {
    const v = firstRemoteVideo.current;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (v) await v.requestPictureInPicture();
    } catch { toast.error('Picture-in-picture isn’t available here.'); }
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen().catch(() => {});
  };
  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(window.location.href); toast.success('Call link copied'); } catch { toast.error('Couldn’t copy the link.'); }
  };
  const showVideo = (peerId: string) => { pinned.current = peerId; syncSfu(); };

  const kind = info?.kind ?? wantKind ?? 'audio';
  const clock = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
  const canShare = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && kind === 'video';
  const canPip = typeof document !== 'undefined' && document.pictureInPictureEnabled && kind === 'video' && list.length > 0;
  const canRec = !!info?.host && info.type === 'class' && canRecord();
  const btn = 'w-14 h-14 rounded-full flex items-center justify-center transition-colors';
  const status = phase === 'starting' ? 'Connecting…' : phase === 'error' ? 'Couldn’t join' : phase === 'ended' ? notice ?? 'Call ended' : waiting ? (info?.type === 'chat' && !talked ? 'Ringing…' : 'Waiting for others to join…') : `${kind === 'video' ? 'Video' : 'Voice'} call · ${clock(seconds)}`;
  const firstRemoteId = list[0]?.peer.peerId;
  const count = list.length + 1;
  const compact = count > 9;
  const someoneRecording = recording || list.some((r) => r.recording);
  const lines = Object.entries(captions).sort((a, b) => a[1].at - b[1].at).slice(-3);

  return (
    <>
    {/* Minimised: a floating bar (like the iPhone's), the call keeps going while you use the app. */}
    <AnimatePresence>
      {minimized && !held && phase !== 'error' && (
        <motion.div key="mini" initial={{ y: 40, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 40, opacity: 0, scale: 0.96 }} transition={spring.smooth}
          className="fixed left-1/2 -translate-x-1/2 z-[290] bottom-[calc(var(--mobile-tabbar-h,0px)+env(safe-area-inset-bottom)+0.75rem)] lg:bottom-6 flex items-center gap-2 pl-2 pr-1.5 py-1.5 rounded-full bg-[#11152a]/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/40 text-white max-w-[min(94vw,26rem)]" role="region" aria-label="Call in progress">
          <button type="button" onClick={onExpand} className="flex items-center gap-2 min-w-0 pl-1" aria-label="Back to the call">
            <span className="relative flex h-2.5 w-2.5 shrink-0"><span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" /></span>
            <span className="min-w-0 text-left"><span className="block text-sm font-semibold truncate">{info?.title ?? 'Call'}</span><span className="block text-[11px] text-zinc-400 tabular-nums">{phase === 'live' && !waiting ? clock(seconds) : status}</span></span>
          </button>
          <button type="button" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute'} className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0', muted ? 'bg-white text-zinc-900' : 'bg-white/10 hover:bg-white/20')}>{muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}</button>
          <button type="button" onClick={() => finish()} aria-label="End call" className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-rose-600 hover:bg-rose-500"><PhoneOff className="w-4 h-4" /></button>
        </motion.div>
      )}
      {held && phase === 'live' && (
        <motion.button key="held" type="button" onClick={onResume} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={spring.smooth}
          style={{ marginBottom: heldIndex * 48 }}
          className="fixed left-4 z-[289] bottom-[calc(var(--mobile-tabbar-h,0px)+env(safe-area-inset-bottom)+4.5rem)] lg:bottom-20 flex items-center gap-2 px-3 py-2 rounded-full bg-amber-500/95 text-amber-950 text-xs font-semibold shadow-xl" aria-label={`On hold: ${info?.title ?? 'call'}. Resume`}>
          <Pause className="w-3.5 h-3.5" /> On hold · {info?.title ?? 'Call'} · Resume
        </motion.button>
      )}
    </AnimatePresence>
    <motion.div ref={rootRef} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className={cn('fixed inset-0 z-[300] text-white flex flex-col bg-[radial-gradient(ellipse_at_top,#1e1b4b_0%,#0b0e1a_55%)]', (minimized || held) && 'hidden')}>
      <motion.header initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={spring.smooth} className="px-5 pt-[calc(env(safe-area-inset-top)+0.9rem)] pb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold truncate text-lg flex items-center gap-2">
            <span className="truncate">{info?.title ?? 'Call'}</span>
            <AnimatePresence>
              {someoneRecording && (
                <motion.span key="rec" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={spring.snappy} className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold tracking-wide bg-rose-600/90 rounded-full px-2 py-0.5" title="This call is being recorded">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />REC{recording ? ` ${clock(recSeconds)}` : ''}
                </motion.span>
              )}
            </AnimatePresence>
          </p>
          <AnimatePresence mode="wait">
            <motion.p key={status.replace(/\d/g, '')} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }} className={cn('text-sm', phase === 'ended' && notice ? 'text-rose-300' : 'text-zinc-400')} role="status">{status}</motion.p>
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-1">
          {sfuQuality && <span className={cn('p-2', QUALITY[sfuQuality].className)} title={QUALITY[sfuQuality].label} aria-label={QUALITY[sfuQuality].label}><Signal className="w-4 h-4" /></span>}
          {onMinimize && phase !== 'error' && phase !== 'ended' && <button type="button" onClick={onMinimize} aria-label="Minimise the call" title="Keep using UniVerse during the call" className="p-2.5 rounded-full hover:bg-white/10"><ChevronDown className="w-5 h-5" /></button>}
          {info && info.type !== 'chat' && <button type="button" onClick={copyInvite} aria-label="Copy call link" title="Copy call link" className="p-2.5 rounded-full hover:bg-white/10"><Link2 className="w-5 h-5" /></button>}
          <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} className="p-2.5 rounded-full hover:bg-white/10 hidden sm:block">{fullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}</button>
          <span className="text-xs text-zinc-400 ml-1">{count} in call</span>
        </div>
      </motion.header>

      {phase === 'error' ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-zinc-300 max-w-sm">{error}</p>
          <button type="button" onClick={() => onLeave(info?.conversationId ?? null)} className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-sm font-semibold">Back</button>
        </motion.div>
      ) : (
        <main className={cn('flex-1 overflow-y-auto p-4 grid content-center', compact ? 'gap-2' : 'gap-4', gridFor(count))}>
          <AnimatePresence initial={false}>
            <Tile key="me" id="me" name={myName} stream={sharing && screen ? screen : local} mirrored={!sharing} muted={muted} camera={kind === 'video' && (camera || sharing)} me compact={compact} animateLayout={count <= 12} />
            {list.map((r) => (
              <Tile key={r.peer.peerId} id={r.peer.peerId} name={r.peer.name} stream={r.stream} silent={held} muted={r.muted} camera={kind === 'video' && (r.camera || r.sharing)} quality={r.quality} state={r.state}
                paused={r.paused} onShow={() => showVideo(r.peer.peerId)} compact={compact} animateLayout={count <= 12}
                videoRef={r.peer.peerId === firstRemoteId ? (v) => { firstRemoteVideo.current = v; } : undefined} />
            ))}
          </AnimatePresence>
          {waiting && info?.type === 'chat' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center" aria-hidden>
              <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" /><span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" /></span>
            </motion.div>
          )}
        </main>
      )}

      {/* Live captions */}
      <div className="pointer-events-none px-4 flex justify-center" aria-live="polite">
        <div className="w-full max-w-3xl flex flex-col items-center gap-1.5">
          <AnimatePresence initial={false}>
            {cc && lines.map(([id, c]) => (
              <motion.p key={id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring.smooth} className="max-w-full rounded-2xl bg-black/65 backdrop-blur-md px-4 py-2 text-[15px] leading-snug text-center shadow-lg">
                <span className="font-semibold text-indigo-300 mr-1.5">{c.name}</span>
                <span className={cn(!c.final && 'text-zinc-200')}>{c.text}</span>
              </motion.p>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <motion.footer initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...spring.smooth, delay: 0.05 }} className="px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3 flex items-center justify-center">
        <div className="flex items-center gap-2 sm:gap-3 rounded-full bg-white/[0.06] backdrop-blur-xl border border-white/10 px-3 py-2.5 shadow-2xl max-w-full overflow-x-auto">
          {phase !== 'error' && phase !== 'ended' && (
            <>
              <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute'} className={cn(btn, 'shrink-0', muted ? 'bg-white text-zinc-900' : 'bg-white/10 hover:bg-white/20')}>{muted ? <MicOff /> : <Mic />}</motion.button>
              {kind === 'video' && <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={toggleCamera} aria-pressed={!camera} aria-label={camera ? 'Turn camera off' : 'Turn camera on'} className={cn(btn, 'shrink-0', !camera ? 'bg-white text-zinc-900' : 'bg-white/10 hover:bg-white/20')}>{camera ? <Video /> : <VideoOff />}</motion.button>}
              {kind === 'video' && <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={flipCamera} aria-label="Switch camera" className={cn(btn, 'shrink-0 bg-white/10 hover:bg-white/20 sm:hidden')}><RefreshCcw /></motion.button>}
              <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={toggleCc} aria-pressed={cc} aria-label={cc ? 'Turn captions off' : 'Turn captions on'} title="Live captions" className={cn(btn, 'shrink-0', cc ? 'bg-indigo-500' : 'bg-white/10 hover:bg-white/20')}>{cc ? <Captions /> : <CaptionsOff />}</motion.button>
              {canShare && <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={toggleShare} aria-pressed={sharing} aria-label={sharing ? 'Stop sharing' : 'Share screen'} className={cn(btn, 'shrink-0 hidden sm:flex', sharing ? 'bg-indigo-500' : 'bg-white/10 hover:bg-white/20')}><MonitorUp /></motion.button>}
              {canRec && (
                <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={() => (recording ? void stopRecording() : startRecording())} aria-pressed={recording} aria-label={recording ? 'Stop recording' : 'Record the class'} title={recording ? 'Stop and save to class materials' : 'Record the class'} className={cn(btn, 'shrink-0', recording ? 'bg-rose-600 hover:bg-rose-500' : 'bg-white/10 hover:bg-white/20')}>
                  {recording ? <Square className="w-5 h-5 fill-current" /> : <Circle className="w-5 h-5 fill-rose-500 text-rose-500" />}
                </motion.button>
              )}
              {canPip && <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={pip} aria-label="Picture in picture" className={cn(btn, 'shrink-0', 'bg-white/10 hover:bg-white/20')}><PictureInPicture2 /></motion.button>}
            </>
          )}
          <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={() => finish()} aria-label="Leave call" className={cn(btn, 'shrink-0 bg-rose-600 hover:bg-rose-500')}><PhoneOff /></motion.button>
        </div>
      </motion.footer>
      {/* Voicemail: nobody answered, leave a voice message instead. */}
      <AnimatePresence>
        {voicemail && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={spring.smooth} className="absolute inset-x-0 bottom-0 p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] bg-[#0b0e1a]/95 backdrop-blur-xl border-t border-white/10 flex flex-col items-center gap-3 text-center">
            <p className="font-semibold">{voicemail === 'recording' ? 'Recording your voice message…' : voicemail === 'sending' ? 'Sending…' : `${info?.title ?? 'They'} didn’t answer`}</p>
            {voicemail === 'offer' && <p className="text-sm text-zinc-400">Leave a voice message? They’ll get it in the chat with a transcript.</p>}
            <div className="flex gap-3">
              {voicemail === 'offer' && <>
                <button type="button" onClick={() => onLeave(infoRef.current?.conversationId ?? null)} className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-sm font-semibold">Not now</button>
                <button type="button" onClick={() => void recordVoicemail()} className="px-5 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-sm font-bold inline-flex items-center gap-2"><Mic className="w-4 h-4" /> Record</button>
              </>}
              {voicemail === 'recording' && <>
                <button type="button" onClick={() => { vmRec.current?.rec.stop(); vmRec.current?.stream.getTracks().forEach((t) => t.stop()); vmRec.current = null; onLeave(infoRef.current?.conversationId ?? null); }} className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-sm font-semibold">Discard</button>
                <button type="button" onClick={() => void sendVoicemail()} className="px-5 py-2.5 rounded-full bg-indigo-500 hover:bg-indigo-400 text-sm font-bold inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" /> Send</button>
              </>}
              {voicemail === 'sending' && <Loader2 className="w-6 h-6 animate-spin" />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
    </>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { BarChart3, Captions, CaptionsOff, Check, ChevronDown, Volume2, SlidersHorizontal, Sparkles, X, Circle, Link2, Loader2, Maximize2, Mic, MicOff, Minimize2, MonitorUp, NotebookPen, Pause, PhoneOff, PictureInPicture2, RefreshCcw, Signal, Square, Users, Video, VideoOff, Hand, Smile, MoreHorizontal, DoorOpen, MessageSquare, Wand2, Languages, Presentation, MessageCircleQuestion, UserPlus, ListVideo } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { useCalls } from '@/store/calls';
import { authedJson } from '@/lib/authed-fetch';
import { ringback } from '@/lib/call-sounds';
import { CallRecorder, canRecord, uploadRecording, type RecSource } from '@/lib/call-recorder';
import { SfuLink, kindOf, type Layer, type MediaKind, type SfuTrack } from '@/lib/sfu-client';
import { type CleanMic, type NoiseMode, audioConstraints, chooseDevice, chosenDevice, cleanMic, listDevices, noiseMode, openMedia, setNoiseMode } from '@/lib/call-media';
import { captionsSupported, useCaptions } from '@/lib/use-captions';
import { canTranslateOnDevice, captionTranslator } from '@/lib/caption-translate';
import { isLanguage, languageName } from '@/lib/languages';
import { useLanguageStore } from '@/store/language';
import { LanguagePicker } from '@/components/chat/LanguagePicker';
import { PeoplePanel, type ControlAction, type Person } from './PeoplePanel';
import { FloatingReactions, ReactionBar, type Floating, type Reaction } from './Reactions';
import { CallChatPanel, useCallChat, type RoomLine } from './CallChat';
import { BackgroundSheet } from './BackgroundSheet';
import { BreakoutBar, BreakoutPanel, RoomPicker, roomId, type BreakoutView } from './BreakoutPanel';
import { PollCard, PollComposer, type PollView } from './CallPoll';
import { PULSE_MS, PulseButtons, PulseMeter, type PulseCounts, type PulseValue } from './ClassPulse';
import { OfficeBar, QueueStatus, turnAlert } from './OfficeHours';
import { WatchPicker, WatchStage, type WatchState } from './WatchTogether';
import { WebinarQA, type QaItem } from './WebinarQA';
import { PipCall, type PipTile } from './PipCall';
import { applyBackground, backgroundsSupported, customImage, saveBackground, saveCustomImage, savedBackground, type Background, type BackgroundEffect } from '@/lib/call-background';
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
// Class notes (class calls, the teacher): while on, everyone's browser captions their own speech
// and the teacher's browser collects the final captions; when notes stop, they're sent once to
// /api/calls/[id]/companion, which turns them into a study pack (src/server/class-companion.ts).

interface Ticket {
  kind: 'audio' | 'video'; type: 'chat' | 'group' | 'class'; title: string; oneToOne: boolean; conversationId: string | null; host: boolean; sfu?: boolean; max?: number;
  /** The chat the call's chat panel uses, or null: the call room's own chat (CallChat). */ chatId?: string | null;
  /** In a breakout room: which (BreakoutPanel). */ breakout?: { parent: string; n: number; name: string } | null;
  /** A webinar's audience (2.10): joins watching, without camera or microphone. */ audience?: boolean;
  path: string; iceServers: RTCIceServer[];
}
interface Peer { peerId: string; userId: string; name: string; host?: boolean; cohost?: boolean; hand?: number; sfu?: { sessionId: string; tracks: SfuTrack[] } }
type Quality = 'good' | 'fair' | 'poor' | null;
interface Remote {
  peer: Peer; stream: MediaStream | null; /** Their shared screen (sent beside their camera). */ screen: MediaStream | null; muted: boolean; camera: boolean; sharing: boolean; cc: boolean; recording: boolean; notes: boolean;
  state: RTCPeerConnectionState | 'new'; quality: Quality;
  /** SFU calls: their video isn't being received right now (to save data); tap to see it. */
  paused: boolean;
  /** Their connection is weak: they asked not to be sent video (audio-only fallback). */
  lowData: boolean;
  /** When their hand went up (the queue's order), or null. */
  hand: number | null;
}
/** prejoin: meetings (class, group, link calls) show a check-yourself screen before joining.
 *  lobby: in the waiting room until the host lets you in (cloudflare/worker.ts CallRoom). */
type Phase = 'starting' | 'prejoin' | 'lobby' | 'live' | 'ended' | 'error';
type Info = Omit<Ticket, 'path' | 'iceServers'>;
interface Caption { name: string; text: string; final: boolean; at: number; id?: string; lang?: string | null }
/** Chrome's Document Picture-in-Picture (2.12): a small always-on-top window that can hold the whole call. */
interface DocumentPip { requestWindow(o: { width: number; height: number }): Promise<Window> }
const documentPip = (): DocumentPip | null => (typeof window !== 'undefined' && 'documentPictureInPicture' in window ? (window as unknown as { documentPictureInPicture: DocumentPip }).documentPictureInPicture : null);
/** The floating window gets the page's styles (Tailwind), so the call looks the same there. */
function copyStyles(to: Window) {
  for (const sheet of [...document.styleSheets]) {
    try {
      const style = to.document.createElement('style');
      style.textContent = [...sheet.cssRules].map((r) => r.cssText).join('\n');
      to.document.head.appendChild(style);
    } catch {
      // A stylesheet from another address (fonts): linked instead.
      if (!sheet.href) continue;
      const link = to.document.createElement('link');
      link.rel = 'stylesheet';
      link.href = sheet.href;
      to.document.head.appendChild(link);
    }
  }
  to.document.documentElement.className = document.documentElement.className;
}

/** The language I read captions in (Stage 4 · 4.1): a language code, or "spoken" for no translation. */
const CC_LANG_KEY = 'universe:cc-lang';
/** Recent caption translations only (they're shown for a few seconds). */
const keepTrs = (t: Record<string, string>) => { const k = Object.keys(t); return k.length > 60 ? Object.fromEntries(k.slice(-40).map((x) => [x, t[x]])) : t; };
interface NoteLine { t: number; who: string; text: string }
/** Class notes sent to the server at most this big (fits a keepalive request if the tab closes). */
const MAX_NOTES_CHARS = 55_000;

const NO_ANSWER_MS = 45_000;

/** The video lines of a connection, in order: [0] camera, [1] shared screen. */
const videoLines = (pc: RTCPeerConnection) => pc.getTransceivers().filter((t) => t.receiver.track.kind === 'video');

/**
 * Quality for one-to-one and small calls: clear voice (Opus up to 64 kbps), a sharp camera, and a
 * screen share that keeps its resolution (text stays readable) and drops frames instead when the
 * connection is slow.
 */
async function tuneSenders(pc: RTCPeerConnection, sendCamera = true) {
  const set = async (sender: RTCRtpSender | undefined, enc: RTCRtpEncodingParameters, pref?: RTCDegradationPreference) => {
    if (!sender) return;
    const p = sender.getParameters();
    if (!p.encodings?.length) p.encodings = [{}];
    Object.assign(p.encodings[0], enc);
    if (pref) (p as RTCRtpSendParameters & { degradationPreference?: RTCDegradationPreference }).degradationPreference = pref;
    await sender.setParameters(p).catch(() => {});
  };
  const audio = pc.getTransceivers().find((t) => t.receiver.track.kind === 'audio');
  const [cam, screen] = videoLines(pc);
  await set(audio?.sender, { maxBitrate: 64_000 });
  // Someone on a weak connection asked for audio only: stop my camera to them (their screen stays).
  await set(cam?.sender, { maxBitrate: 1_500_000, maxFramerate: 30, active: sendCamera }, 'balanced');
  await set(screen?.sender, { maxBitrate: 2_500_000, maxFramerate: 30 }, 'maintain-resolution');
}
/** 720p. Bigger calls send it in three sizes (simulcast, src/lib/sfu-client.ts), so each viewer
 *  receives only what its tile needs. */
const cameraConstraints = (facingMode: string = 'user'): MediaTrackConstraints => ({ width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode });
/** "Chrome on Mac", for the call health log (no version, nothing that identifies the person). */
function deviceName() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux|CrOS/.test(ua) ? 'Linux' : 'other';
  return `${browser} on ${os}`;
}
/** The time, for handlers reached through the "More" sheet (React's linter can't tell that those
 *  only run on a tap, and flags Date.now in them). */
const nowMs = () => Date.now();
const CAPTION_MS = 5000;
const MAX_REC_MS = 2 * 3600_000;
const MAX_REC_BYTES = 950 * 1024 * 1024;

const fresh = (peer: Peer): Remote => ({ peer, stream: null, screen: null, muted: false, camera: false, sharing: false, cc: false, recording: false, notes: false, state: 'new', quality: null, paused: false, lowData: false, hand: peer.hand ?? null });

// One audio context and one timer measure everyone's voice (a call of 30 doesn't run 30 of
// each), and a tile re-renders only when its person starts or stops talking.
const meter = {
  ctx: null as AudioContext | null,
  timer: null as ReturnType<typeof setInterval> | null,
  subs: new Set<{ id: string; an: AnalyserNode; buf: Uint8Array<ArrayBuffer>; on: boolean; set: (on: boolean) => void }>(),
  /** How long each person has spoken in this call (ms), for the people panel's speaking-time bars. */
  talk: new Map<string, number>(),
};
/** Speaking time per person, read every second while shown. */
function useTalkTimes(on: boolean) {
  const [talk, setTalk] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!on) return;
    const read = () => setTalk(Object.fromEntries(meter.talk));
    const first = setTimeout(read, 0);
    const t = setInterval(read, 1000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [on]);
  return talk;
}
function useSpeaking(stream: MediaStream | null, id = '') {
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
    const sub = { id, an, buf: new Uint8Array(new ArrayBuffer(an.frequencyBinCount)), on: false, set: setSpeaking };
    meter.subs.add(sub);
    meter.timer ??= setInterval(() => {
      for (const s of meter.subs) {
        s.an.getByteFrequencyData(s.buf);
        let sum = 0;
        for (const v of s.buf) sum += v;
        const on = sum / s.buf.length / 60 > 0.12;
        if (on !== s.on) { s.on = on; s.set(on); }
        if (on && s.id) meter.talk.set(s.id, (meter.talk.get(s.id) ?? 0) + 200);
      }
    }, 200);
    return () => {
      meter.subs.delete(sub);
      src.disconnect();
      setSpeaking(false);
      if (!meter.subs.size && meter.timer) { clearInterval(meter.timer); meter.timer = null; }
    };
  }, [stream, id]);
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

/** Whether a video track is actually delivering frames (a muted track shows black). */
function useLiveVideo(stream: MediaStream | null) {
  const [, bump] = useState(0);
  useEffect(() => {
    const tracks = stream?.getVideoTracks() ?? [];
    const on = () => bump((n) => n + 1);
    for (const t of tracks) { t.addEventListener('mute', on); t.addEventListener('unmute', on); t.addEventListener('ended', on); }
    const add = () => on();
    stream?.addEventListener('addtrack', add);
    stream?.addEventListener('removetrack', add);
    return () => {
      for (const t of tracks) { t.removeEventListener('mute', on); t.removeEventListener('unmute', on); t.removeEventListener('ended', on); }
      stream?.removeEventListener('addtrack', add);
      stream?.removeEventListener('removetrack', add);
    };
  }, [stream]);
  return !!stream?.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled && !t.muted);
}

function Tile({ id, name, stream, mirrored, muted, camera, me, quality, state, paused, compact, animateLayout, onShow, videoRef, silent, screen, spotlight, className, hand }: {
  id: string; name: string; stream: MediaStream | null; mirrored?: boolean; muted?: boolean; camera: boolean; me?: boolean; quality?: Quality; state?: string; silent?: boolean;
  paused?: boolean; compact?: boolean; animateLayout?: boolean; onShow?: () => void; videoRef?: (v: HTMLVideoElement | null) => void;
  /** Showing a shared screen: fit it whole instead of cropping. */ screen?: boolean;
  /** Takes the whole first row (someone is sharing their screen). */ spotlight?: boolean;
  className?: string;
  /** Their place in the raised-hands queue. */ hand?: number;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const speaking = useSpeaking(muted ? null : stream, id);
  const live = useLiveVideo(stream);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    // Phones sometimes don't start a new source by themselves: a black tile with sound.
    if (stream) void v.play().catch(() => {});
  }, [stream, live]);
  const hasVideo = camera && !paused && live;
  return (
    <motion.div
      layout={animateLayout}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={spring.smooth}
      data-tile={id}
      className={cn('relative overflow-hidden bg-zinc-900/80 aspect-video flex items-center justify-center ring-2 transition-shadow duration-200', compact ? 'rounded-2xl' : 'rounded-3xl', spotlight && 'col-span-full', className, speaking ? 'ring-emerald-400/90 shadow-[0_0_40px_-8px_rgba(52,211,153,0.6)]' : 'ring-transparent')}
    >
      {/* Remote audio plays through this element too, so it stays even with the camera off. */}
      <video ref={(v) => { ref.current = v; videoRef?.(v); }} data-peer={id} autoPlay playsInline muted={me || silent}
        className={cn('absolute inset-0 w-full h-full transition-[opacity,transform] duration-500 ease-out', screen ? 'object-contain bg-black' : 'object-cover', hasVideo ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.03]', mirrored && !screen && '-scale-x-100')} />
      <AnimatePresence>
        {!hasVideo && (
          <motion.div key="avatar" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: speaking ? 1.08 : 1 }} exit={{ opacity: 0, scale: 0.85 }} transition={spring.smooth}
            className={cn('relative rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-white font-bold shadow-xl shadow-fuchsia-500/20', compact ? 'w-12 h-12 text-lg' : 'w-24 h-24 text-3xl')}>
            {initials(name)}
          </motion.div>
        )}
      </AnimatePresence>
      <span className={cn('absolute bottom-2 left-2 font-medium text-white bg-black/45 backdrop-blur-md rounded-full flex items-center gap-1.5 max-w-[85%]', compact ? 'text-[11px] px-2 py-0.5' : 'text-xs px-3 py-1')}>
        {muted && <MicOff className="w-3 h-3 shrink-0" />}{screen && <MonitorUp className="w-3 h-3 shrink-0" />}<span className="truncate">{me ? `${name} (you)` : name}{screen ? ' · screen' : ''}</span>
      </span>
      <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
        <AnimatePresence>
          {hand ? (
            <motion.span key="hand" initial={{ opacity: 0, scale: 0.5, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.5 }} transition={spring.snappy}
              className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-400 text-amber-950 rounded-full px-2 py-0.5 shadow-lg" aria-label={`Hand raised, number ${hand} in the queue`}>
              <motion.span initial={{ rotate: 0 }} animate={{ rotate: [0, 18, -10, 18, 0] }} transition={{ duration: 0.9, delay: 0.1 }} className="inline-block origin-bottom-right">✋</motion.span>{hand}
            </motion.span>
          ) : null}
        </AnimatePresence>
        {paused && onShow && (
          <button type="button" onClick={onShow} className="text-[11px] text-white bg-black/55 hover:bg-black/70 backdrop-blur-md rounded-full px-2.5 py-1 transition-colors">Show video</button>
        )}
        {state && state !== 'connected' && state !== 'new' && (
          <span className="text-[11px] text-white bg-black/55 backdrop-blur-md rounded-full px-2.5 py-1">{state === 'connecting' ? 'Connecting…' : state === 'failed' || state === 'disconnected' ? 'Reconnecting…' : state}</span>
        )}
      </div>
      {quality && !me && (
        <span className={cn('absolute top-2 right-2 bg-black/45 backdrop-blur-md rounded-full p-1.5', QUALITY[quality].className)} title={QUALITY[quality].label} aria-label={QUALITY[quality].label}><Signal className="w-3.5 h-3.5" /></span>
      )}
    </motion.div>
  );
}

/** Someone's shared screen, large and whole (never cropped). Double-click for full screen. */
function ScreenStage({ stream, name }: { stream: MediaStream | null; name: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const live = useLiveVideo(stream);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    if (stream) void v.play().catch(() => {});
  }, [stream, live]);
  return (
    <>
      {/* Muted: their voice plays from their camera tile (playing it twice would echo). */}
      <video ref={ref} autoPlay playsInline muted onDoubleClick={(e) => { void (e.currentTarget.requestFullscreen?.() ?? Promise.resolve()).catch(() => {}); }}
        className={cn('absolute inset-0 w-full h-full object-contain transition-opacity duration-500', live ? 'opacity-100' : 'opacity-0')} />
      {!live && <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading {name}’s screen…</div>}
      <span className="absolute top-3 left-3 text-xs font-medium text-white bg-black/55 backdrop-blur-md rounded-full px-3 py-1 inline-flex items-center gap-1.5"><MonitorUp className="w-3.5 h-3.5" />{name} is presenting</span>
    </>
  );
}

/** A live microphone level bar (no re-renders: the bar is moved directly). */
function MicMeter({ stream, muted }: { stream: MediaStream | null; muted: boolean }) {
  const bar = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const track = stream?.getAudioTracks()[0];
    if (!track || muted) { if (bar.current) bar.current.style.transform = 'scaleX(0)'; return; }
    let ctx: AudioContext;
    try { ctx = new AudioContext(); } catch { return; }
    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    let raf = 0;
    const tick = () => {
      an.getFloatTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v));
      if (bar.current) bar.current.style.transform = `scaleX(${Math.min(1, peak * 2.2)})`;
      raf = requestAnimationFrame(tick);
    };
    void ctx.resume().catch(() => {});
    tick();
    return () => { cancelAnimationFrame(raf); src.disconnect(); void ctx.close().catch(() => {}); };
  }, [stream, muted]);
  return (
    <span className="block h-1.5 w-full rounded-full bg-white/10 overflow-hidden" aria-hidden>
      <span ref={bar} className="block h-full w-full origin-left rounded-full bg-gradient-to-r from-emerald-400 via-indigo-400 to-fuchsia-500 transition-transform duration-75" style={{ transform: 'scaleX(0)' }} />
    </span>
  );
}

/** A short two-note chime, to check you can hear the call. */
function playTestSound() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, now + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.32);
      o.connect(g).connect(ctx.destination);
      o.start(now + i * 0.18);
      o.stop(now + i * 0.18 + 0.35);
    });
    setTimeout(() => void ctx.close().catch(() => {}), 900);
  } catch { /* no audio */ }
}

/** How good this device's connection looks, where the browser says (Chrome, Android). */
function networkGuess(): { label: string; weak: boolean } | null {
  const c = (navigator as Navigator & { connection?: { effectiveType?: string; rtt?: number; downlink?: number; saveData?: boolean } }).connection;
  if (!c?.effectiveType) return null;
  const weak = c.effectiveType === 'slow-2g' || c.effectiveType === '2g' || (c.rtt ?? 0) > 400 || (c.downlink ?? 10) < 0.7 || !!c.saveData;
  const fair = c.effectiveType === '3g' || (c.rtt ?? 0) > 200 || (c.downlink ?? 10) < 2;
  return { label: weak ? 'Weak connection: video may stutter' : fair ? 'Fair connection' : 'Good connection', weak };
}

function gridFor(count: number) {
  if (count <= 1) return 'grid-cols-1 max-w-3xl w-full mx-auto';
  if (count === 2) return 'grid-cols-1 sm:grid-cols-2 max-w-6xl w-full mx-auto';
  if (count <= 4) return 'grid-cols-2 max-w-5xl w-full mx-auto';
  if (count <= 9) return 'grid-cols-2 sm:grid-cols-3';
  if (count <= 16) return 'grid-cols-3 lg:grid-cols-4';
  return 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6';
}

export function CallView({ callId, myName, wantKind, onLeave, held = false, heldIndex = 0, minimized = false, onMinimize, onExpand, onResume, guest }: {
  callId: string; myName: string; wantKind?: 'audio' | 'video'; onLeave: (conversationId: string | null) => void;
  /** Joining a call link as a guest, without an account (Stage 4 · 2.11; src/app/guest/[id]). */
  guest?: { token: string };
  /** Another call is active: this one is on hold (your mic off, their audio silent). */
  held?: boolean; heldIndex?: number;
  /** Shrunk to a floating bar while you use the app (CallHost). */
  minimized?: boolean; onMinimize?: () => void; onExpand?: () => void; onResume?: () => void;
}) {
  const [voicemail, setVoicemail] = useState<null | 'offer' | 'recording' | 'sending'>(null);
  const isGuest = !!guest;
  /** The call in Chrome's floating window (2.12), while it's open. */
  const [pipWin, setPipWin] = useState<Window | null>(null);
  const vmRec = useRef<{ rec: MediaRecorder; stream: MediaStream; chunks: Blob[]; start: number } | null>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [camera, setCamera] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [remotes, setRemotes] = useState<Record<string, Remote>>({});
  const [seconds, setSeconds] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [talked, setTalked] = useState(false); // someone has connected at least once
  const [sfuQuality, setSfuQuality] = useState<Quality>(null);
  const sfuQualityRef = useRef<Quality>(null);
  const [cc, setCc] = useState(false);
  const [captions, setCaptions] = useState<Record<string, Caption>>({});
  // Translated captions (Stage 4 · 4.1): I read everyone's captions in my language (the app's,
  // unless I picked another or "as spoken"). `trs`: translations by caption id.
  const appLanguage = useLanguageStore((s) => s.language);
  const [ccChoice, setCcChoice] = useState<string | null | undefined>(() => {
    try { const v = localStorage.getItem(CC_LANG_KEY); return v === 'spoken' ? null : isLanguage(v) ? v : undefined; } catch { return undefined; }
  });
  const ccLang = ccChoice === undefined ? appLanguage : ccChoice;
  const [ccPick, setCcPick] = useState(false);
  const [trs, setTrs] = useState<Record<string, string>>({});
  /** What the call room knows I read in (null while my captions are off), and recent finished captions. */
  const ccLangRef = useRef<string | null>(null);
  const heard = useRef(new Map<string, { text: string; lang: string }>());
  const translator = useRef<ReturnType<typeof captionTranslator> | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [notes, setNotes] = useState(false);
  // Host controls (PeoplePanel): whether I run the call (the call room says: a link's creator is
  // only known there), co-host given to me, and the person everyone sees large (spotlight).
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const [meHost, setMeHost] = useState(false);
  const [meCohost, setMeCohost] = useState(false);
  const [spotlight, setSpotlightState] = useState<string | null>(null);
  const spotlightRef = useRef<string | null>(null);
  // Raised hand (when mine went up), reactions floating up, and the reactions and "More" sheets.
  const [myHand, setMyHand] = useState<number | null>(null);
  const [floats, setFloats] = useState<Floating[]>([]);
  const floatSeq = useRef(0);
  const reactLog = useRef<number[]>([]);
  const [reactOpen, setReactOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Chat in the call: the call room's own messages (calls without a chat), the panel, and when I
  // last looked (for the unread count on the Chat button).
  const [roomChat, setRoomChat] = useState<RoomLine[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSeenAt, setChatSeenAt] = useState(() => Date.now());
  // Waiting room: whether a host is here to let me in; for hosts, who's waiting and whether it's on.
  const [hostHere, setHostHere] = useState(false);
  const [lobby, setLobby] = useState<{ id: string; name: string }[]>([]);
  const [lobbyOn, setLobbyOn] = useState(false);
  // Office hours (4.7): my place in the line while I wait; for the teacher, how long the line is.
  const [line, setLine] = useState<{ pos: number; waiting: number; etaMin: number } | null>(null);
  const queued = useRef(false);
  const [officeLine, setOfficeLine] = useState<{ waiting: number; avgMin: number } | null>(null);
  // Watch together (4.8): the video everyone watches, the call room's clock minus mine (ms), who did
  // what last, and the sheet to start one.
  const [watch, setWatch] = useState<WatchState | null>(null);
  const skew = useRef(0);
  const [watchStatus, setWatchStatus] = useState<string | null>(null);
  const [watchPick, setWatchPick] = useState(false);
  const echoTip = useRef(false);
  // Breakout rooms (BreakoutPanel): the room I'm in (the call itself, or one of its rooms: my camera,
  // microphone and screen carry on when I move), the plan, the host's panel and the room picker.
  const [room, setRoom] = useState(callId);
  const roomRef = useRef(callId);
  const moving = useRef(false);
  const [bo, setBo] = useState<BreakoutView | null>(null);
  const [boOpen, setBoOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const noteSeen = useRef(0);
  const goRoomRef = useRef<(target: string) => void>(() => {});
  // A live poll or quick quiz in this room (CallPoll), and the host's composer.
  const [poll, setPoll] = useState<PollView | null>(null);
  const pollId = useRef<string | null>(null);
  const [pollCompose, setPollCompose] = useState(false);
  // Whether I can moderate, for the socket handler (set up once): hand-raise toasts are for hosts.
  const modRef = useRef(false);
  // Background blur or a picture (src/lib/call-background.ts): the camera as it comes (raw), and the
  // effect that makes what's sent. camSeq: a newer camera change wins over one still getting ready.
  const [bgChoice, setBgChoice] = useState<Background>(savedBackground);
  const bgRef = useRef<Background>(savedBackground());
  const [bgOpen, setBgOpen] = useState(false);
  const [bgBusy, setBgBusy] = useState(false);
  const [bgCustom, setBgCustom] = useState<string | null>(customImage);
  const effectRef = useRef<BackgroundEffect | null>(null);
  const rawCam = useRef<MediaStreamTrack | null>(null);
  const camSeq = useRef(0);
  // The latest mic and camera controls, for the host's requests (the socket handler is set up once).
  const actions = useRef<{ toggleCamera: () => Promise<void>; setMicOff: (off: boolean) => void; applyCamera: (raw: MediaStreamTrack | null) => Promise<boolean> } | null>(null);
  /** Stops my screen share (set where that's defined; watching a webinar stops it). */
  const stopShareRef = useRef<() => Promise<void>>(async () => {});
  const notesRef = useRef<{ start: number; lines: NoteLine[]; chars: number; pulse: (PulseCounts & { t: number })[] } | null>(null);
  // Classroom pulse (Stage 4 · 4.4): my tap (students), the counts (hosts), and when I last nudged.
  const [myPulse, setMyPulse] = useState<PulseValue>(null);
  const myPulseRef = useRef<PulseValue>(null);
  const pulseClear = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pulse, setPulse] = useState<PulseCounts | null>(null);
  const pulseNow = useRef<PulseCounts | null>(null);
  const pulseNudged = useRef(0);
  // Webinar mode (Stage 4 · 2.10): the stage and how many watch, whether I'm watching, Q&A, and an
  // invitation on stage (or "the webinar ended: you may talk") waiting for me to say yes.
  const [webinar, setWebinar] = useState<{ on: boolean; stage: string[]; audience: number } | null>(null);
  const [audienceMe, setAudienceMe] = useState(false);
  const audienceRef = useRef(false);
  const [qa, setQa] = useState<QaItem[]>([]);
  const [qaOpen, setQaOpen] = useState(false);
  const [stageInvite, setStageInvite] = useState<null | { by: string; ended: boolean }>(null);
  const ticketRef = useRef<Ticket | null>(null);
  const restartSfuRef = useRef<(() => Promise<void>) | null>(null);

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
  const myId = useRef<string | null>(null);
  // Meetings wait on the pre-join screen until "Join now".
  const joinConfirmed = useRef(false);
  const resumeJoin = useRef<(() => void) | null>(null);
  const [inRoom, setInRoom] = useState<string[] | null>(null);
  const stateRef = useRef({ muted: false, camera: true, sharing: false, cc: false, recording: false, notes: false, lowData: false });
  // Audio-only fallback: a poor connection for 10 s pauses incoming video (people's screens stay).
  const [audioOnly, setAudioOnly] = useState(false);
  const audioOnlyRef = useRef(false);
  const poorSince = useRef<number | null>(null);
  // Call health log: how this call went, sent once when it ends (connection numbers only).
  const stat = useRef({ joinAt: 0, peers: 0, worstRtt: 0, worstLoss: 0, relay: false, audioOnly: false, failure: null as string | null, sent: false });
  const autoAudioOnlyAfter = useRef(0);
  const ended = useRef(false);
  const everJoined = useRef(false);
  const talkStart = useRef<number | null>(null);
  const infoRef = useRef<Info | null>(null);
  const firstRemoteVideo = useRef<HTMLVideoElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<CallRecorder | null>(null);
  const recSourcesRef = useRef<() => RecSource[]>(() => []);
  // Each person's incoming audio and video, kept together (a camera turned on later arrives as a
  // separate track and must not replace their voice).
  const inbound = useRef(new Map<string, MediaStream>());
  // The cleaned microphone (noise suppression) and how to stop it.
  const micClean = useRef<CleanMic | null>(null);
  const rawMic = useRef<MediaStreamTrack | null>(null);

  const send = (msg: unknown) => { if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg)); };
  const announce = () => {
    send({ type: 'state', ...stateRef.current });
    send({ type: 'cc-lang', lang: ccLangRef.current, device: canTranslateOnDevice() });
    if (myPulseRef.current) send({ type: 'pulse', v: myPulseRef.current });
  };
  /** Pulse counts for the host: shown live, kept with class notes, and a nudge when many are lost. */
  const gotPulse = (c: PulseCounts) => {
    const before = pulseNow.current;
    pulseNow.current = c;
    setPulse(c);
    const n = notesRef.current;
    if (n && n.pulse.length < 2000) n.pulse.push({ t: Math.round((Date.now() - n.start) / 1000), ...c });
    const many = (x: PulseCounts | null) => !!x && x.lost >= Math.max(2, Math.ceil(x.total * 0.3));
    if (many(c) && !many(before) && Date.now() - pulseNudged.current > 3 * 60_000) {
      pulseNudged.current = Date.now();
      toast(`${c.lost} of ${c.total} students are lost right now`, { icon: '🤔', description: 'Maybe go over the last point again, or ask what’s unclear.', duration: 8000 });
    }
  };
  /** Watching a webinar: my camera, microphone and shared screen stop (nothing is sent). */
  const stopMyMedia = () => {
    if (screenRef.current) void stopShareRef.current();
    localRef.current?.getTracks().forEach((t) => t.stop());
    rawMic.current?.stop();
    rawCam.current?.stop();
    micClean.current?.stop();
    rawMic.current = null; rawCam.current = null; micClean.current = null;
    localRef.current = new MediaStream();
    setLocal(localRef.current);
    stateRef.current.camera = false; setCamera(false);
    stateRef.current.muted = true; setMuted(true);
  };
  /** On stage (I said yes to the host's invitation, or the webinar ended): microphone and camera on, then send. */
  const goOnStage = async () => {
    setStageInvite(null);
    try {
      const opened = await openMedia(infoRef.current?.kind === 'video' ? cameraConstraints() : false, noiseMode());
      rawMic.current = opened.getAudioTracks()[0] ?? null;
      micClean.current = rawMic.current ? await cleanMic(rawMic.current, noiseMode()) : null;
      rawCam.current = opened.getVideoTracks()[0] ?? null;
      localRef.current = new MediaStream([...(micClean.current ? [micClean.current.track] : []), ...(rawCam.current ? [rawCam.current] : [])]);
      setLocal(localRef.current);
      stateRef.current.camera = !!rawCam.current; setCamera(!!rawCam.current);
      stateRef.current.muted = false; setMuted(false);
    } catch {
      toast.error('Allow the microphone (and camera) to speak.');
      return;
    }
    audienceRef.current = false;
    setAudienceMe(false);
    await restartSfuRef.current?.();
    announce();
  };
  /** A guest link for this call link (2.11): copied, valid a day; guests wait for me to let them in. */
  const inviteGuests = async () => {
    try {
      const r = await authedJson<{ path: string }>(`/api/calls/${callId}/guests`, { method: 'POST', body: JSON.stringify({ hours: 24 }) });
      const url = `${location.origin}${r.path}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success('Guest link copied', { description: 'Anyone with it can ask to join for the next 24 hours, without an account. You let each guest in from the waiting room.', duration: 9000 });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  /** A student taps "I'm lost" or "Got it" (again to take it back); it clears itself after two minutes. */
  const tapPulse = (v: 'lost' | 'got') => {
    haptic('tap');
    const next = myPulseRef.current === v ? null : v;
    myPulseRef.current = next;
    setMyPulse(next);
    send({ type: 'pulse', v: next });
    if (pulseClear.current) clearTimeout(pulseClear.current);
    pulseClear.current = next ? setTimeout(() => { myPulseRef.current = null; setMyPulse(null); send({ type: 'pulse', v: null }); }, PULSE_MS) : null;
  };
  /** A translation arrived: shown, and the caption it belongs to stays up a little longer. */
  const gotTranslation = (id: string, text: string) => {
    setTrs((t) => keepTrs({ ...t, [id]: text }));
    setCaptions((c) => { const e = Object.entries(c).find(([, x]) => x.id === id); return e ? { ...c, [e[0]]: { ...e[1], at: Date.now() } } : c; });
  };

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
  const connectTo = useCallback((peer: Peer, offerer = false) => {
    pcs.current.get(peer.peerId)?.close();
    inbound.current.delete(peer.peerId);
    const pc = new RTCPeerConnection({ iceServers: ice.current });
    pcs.current.set(peer.peerId, pc);
    setR((r) => ({ ...r, [peer.peerId]: r[peer.peerId] ?? fresh(peer) }));
    const local = localRef.current;
    for (const track of local?.getTracks() ?? []) pc.addTrack(track, local!);
    // Always a video line, even in a voice call: turning the camera on or sharing the screen later
    // is then just a track swap, with no renegotiation (smooth, and nothing to get stuck).
    if (offerer && !local?.getVideoTracks().length) pc.addTransceiver('video', { direction: 'sendrecv', streams: local ? [local] : [] });
    // A second video line for screen sharing, so the camera keeps going while someone presents.
    if (offerer) pc.addTransceiver('video', { direction: 'sendrecv' });
    const screen = screenRef.current;
    if (screen) void videoLines(pc)[1]?.sender.replaceTrack(screen);
    pc.onicecandidate = (e) => { if (e.candidate) send({ type: 'signal', to: peer.peerId, data: { candidate: e.candidate } }); };
    pc.ontrack = (e) => {
      if (e.track.kind === 'video' && videoLines(pc).indexOf(e.transceiver) === 1) {
        patch(peer.peerId, { screen: new MediaStream([e.track]) });
        return;
      }
      const merged = inbound.current.get(peer.peerId) ?? new MediaStream();
      for (const t of merged.getTracks()) if (t.kind === e.track.kind && t.id !== e.track.id) merged.removeTrack(t);
      if (!merged.getTrackById(e.track.id)) merged.addTrack(e.track);
      inbound.current.set(peer.peerId, merged);
      patch(peer.peerId, { stream: new MediaStream(merged.getTracks()) });
    };
    // A dropped connection recovers by restarting ICE. Only one side offers the restart (the one
    // with the smaller id), so the two never offer at once.
    let lost: ReturnType<typeof setTimeout> | null = null;
    const restart = async () => {
      if (pc.signalingState !== 'stable' || pcs.current.get(peer.peerId) !== pc) return;
      try {
        await pc.setLocalDescription(await pc.createOffer({ iceRestart: true }));
        send({ type: 'signal', to: peer.peerId, data: { sdp: pc.localDescription } });
      } catch (e) { console.warn('ICE restart failed', e); }
    };
    pc.onconnectionstatechange = () => {
      patch(peer.peerId, { state: pc.connectionState });
      if (lost) { clearTimeout(lost); lost = null; }
      if (pc.connectionState === 'connected') { markTalking(); void tuneSenders(pc, !remotesRef.current[peer.peerId]?.lowData); }
      const mine = (myId.current ?? '') < peer.peerId;
      if (pc.connectionState === 'failed' && mine) void restart();
      if (pc.connectionState === 'disconnected' && mine) lost = setTimeout(() => { if (pc.connectionState === 'disconnected') void restart(); }, 3000);
    };
    return pc;
  }, [setR, patch]);

  // ── Bigger calls: what to receive from the SFU ─────────────────────────────────────────────
  /** Everyone's audio; video for a few people (pinned, then screen shares, then cameras), each
   *  camera in the size its tile shows (smaller in a crowd or beside a shared screen, and one step
   *  down while my connection is poor). */
  const syncSfu = useCallback(() => {
    const link = sfuRef.current;
    if (!link) return;
    const rs = Object.values(remotesRef.current).filter((r) => r.peer.sfu);
    const tracksOf = (r: Remote, kind: MediaKind) => r.peer.sfu!.tracks.filter((t) => kindOf(t) === kind).map((track) => ({ peerId: r.peer.peerId, sessionId: r.peer.sfu!.sessionId, track }));
    const slots = window.innerWidth < 640 ? 4 : 6;
    const score = (r: Remote) => (spotlightRef.current === r.peer.peerId ? 8 : 0) + (pinned.current === r.peer.peerId ? 4 : 0) + (r.sharing ? 2 : 0);
    const seen = new Set(audioOnlyRef.current ? [] : rs.filter((r) => r.camera).sort((a, b) => score(b) - score(a)).slice(0, slots).map((r) => r.peer.peerId));
    // Beside a shared screen or a spotlight, cameras sit in a small strip; the spotlit one is large.
    const sharingNow = rs.some((r) => r.sharing);
    const size: Layer = sharingNow || spotlightRef.current ? 'c' : seen.size <= (slots === 4 ? 1 : 2) ? 'a' : 'b';
    // A webinar's audience (often hundreds) receives cameras at 360p at most, to keep the SFU light.
    const down = (l: Layer): Layer => (sfuQualityRef.current === 'poor' ? (l === 'a' ? 'b' : 'c') : audienceRef.current && l === 'a' ? 'b' : l);
    const layerOf = (r: Remote): Layer => down(!sharingNow && spotlightRef.current === r.peer.peerId ? 'a' : size);
    // Screens being shared are always received; cameras for the few people on screen.
    const cams = rs.flatMap((r) => (seen.has(r.peer.peerId) ? tracksOf(r, 'video').map((x) => ({ ...x, layer: layerOf(r) })) : []));
    const pull = [...rs.flatMap((r) => [...tracksOf(r, 'audio'), ...(r.sharing ? tracksOf(r, 'screen') : [])]), ...cams];
    const drop = [
      ...rs.filter((r) => !seen.has(r.peer.peerId)).flatMap((r) => tracksOf(r, 'video')),
      ...rs.filter((r) => !r.sharing).flatMap((r) => tracksOf(r, 'screen')),
    ].filter((t) => link.isPulled(t.track.trackName));
    if (drop.length) {
      void link.drop(drop.map((t) => t.track.trackName)).catch((e) => console.warn('SFU drop failed', e));
      setR((r) => {
        const next = { ...r };
        for (const t of drop) {
          const x = next[t.peerId];
          if (!x) continue;
          next[t.peerId] = kindOf(t.track) === 'screen' ? { ...x, screen: null } : { ...x, stream: new MediaStream(x.stream?.getAudioTracks() ?? []) };
        }
        return next;
      });
    }
    setR((r) => {
      let changed = false;
      const next = { ...r };
      for (const x of rs) {
        const paused = x.camera && !seen.has(x.peer.peerId);
        if (next[x.peer.peerId] && next[x.peer.peerId].paused !== paused) { next[x.peer.peerId] = { ...next[x.peer.peerId], paused }; changed = true; }
      }
      return changed ? next : r;
    });
    if (pull.some((p) => !link.isPulled(p.track.trackName))) void link.pull(pull).catch((e) => console.warn('SFU pull failed', e));
    void link.prefer(cams).catch(() => { /* keeps the size it has */ });
  }, [setR]);

  /** My connection to the SFU; going into or out of "poor" changes the camera sizes I receive. */
  const noteSfuQuality = useCallback((q: Quality) => {
    const was = sfuQualityRef.current === 'poor';
    sfuQualityRef.current = q;
    setSfuQuality(q);
    if (was !== (q === 'poor')) syncSfu();
  }, [syncSfu]);

  /** Audio only (a weak connection): the others stop sending me their cameras, or start again. */
  const setLowData = useCallback((on: boolean) => {
    if (audioOnlyRef.current === on) return;
    audioOnlyRef.current = on;
    setAudioOnly(on);
    if (on) stat.current.audioOnly = true;
    poorSince.current = null;
    // Chose video again: don't switch it off by itself for a minute.
    if (!on) autoAudioOnlyAfter.current = Date.now() + 60_000;
    stateRef.current.lowData = on;
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ type: 'state', ...stateRef.current }));
    if (sfuRef.current) syncSfu();
  }, [syncSfu]);

  /** A reaction floating up the screen for three seconds. */
  const addFloat = useCallback((emoji: string, name: string) => {
    const id = ++floatSeq.current;
    setFloats((f) => [...f.slice(-23), { id, emoji, name, x: 4 + Math.random() * 30 }]);
    setTimeout(() => setFloats((f) => f.filter((y) => y.id !== id)), 3200);
  }, []);

  /** Who everyone sees large (the host's spotlight), or nobody. */
  const setSpotlight = useCallback((id: string | null) => {
    spotlightRef.current = id;
    setSpotlightState(id);
    if (sfuRef.current) syncSfu();
  }, [syncSfu]);

  const onSfuTrack = useCallback((peerId: string, kind: MediaKind, track: MediaStreamTrack) => {
    markTalking();
    setR((r) => {
      const x = r[peerId];
      if (!x) return r;
      if (kind === 'screen') return { ...r, [peerId]: { ...x, screen: new MediaStream([track]) } };
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

  /** Stops recording and saves it (or, `discard`, throws it away: it wasn't allowed). */
  const stopRecording = useCallback(async (discard = false) => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    setRecording(false);
    stateRef.current.recording = false;
    announce();
    const { blob, durationSec } = await rec.stop();
    if (discard || blob.size < 1024) return;
    const t = toast.loading('Saving the recording… 0%');
    try {
      const saved = await uploadRecording(callId, blob, durationSec, authedJson, (p) => toast.loading(`Saving the recording… ${Math.round(p * 100)}%`, { id: t }));
      toast.success(saved.message || `“${saved.title}” is saved`, { id: t });
    } catch (e) {
      toast.error((e as Error).message || 'Couldn’t save the recording.', { id: t, duration: 10_000 });
      // Don't lose the class: offer the file instead.
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `call-recording-${new Date().toISOString().slice(0, 16).replace(':', '-')}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
      a.click();
    }
  }, [callId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Class notes (class calls, the teacher) ───────────────────────────────────────────────
  /** Keeps a final caption for the study pack (only while my class notes are on). */
  const noteLine = (who: string, text: string) => {
    const n = notesRef.current;
    const clean = text.trim();
    if (!n || !clean || n.chars + clean.length > MAX_NOTES_CHARS) return;
    n.chars += clean.length;
    n.lines.push({ t: Math.round((Date.now() - n.start) / 1000), who, text: clean });
  };

  /** Stops class notes and sends them once to be turned into a study pack. */
  const submitNotes = useCallback(async () => {
    const n = notesRef.current;
    if (!n) return;
    notesRef.current = null;
    setNotes(false);
    stateRef.current.notes = false;
    announce();
    if (!n.lines.length) {
      toast.error('No transcript: captions need Chrome, Edge or Safari, and someone has to speak while class notes are on.', { duration: 10_000 });
      return;
    }
    const body = JSON.stringify({ transcript: n.lines, durationSec: Math.round((Date.now() - n.start) / 1000), pulse: n.pulse });
    const t = toast.loading(callId.startsWith('c_') ? 'Making the study pack…' : 'Making the meeting notes…');
    try {
      // keepalive: still delivered if the tab is closing (requests that size are allowed it).
      const res = await authedJson<{ message: string }>(`/api/calls/${callId}/companion`, { method: 'POST', body, keepalive: body.length < 60_000 });
      toast.success(res.message, { id: t, duration: 8000 });
    } catch (e) {
      toast.error((e as Error).message || 'Couldn’t save the class notes.', { id: t, duration: 10_000 });
    }
  }, [callId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Leaves the call. The last one out of a chat call records how it went (shown on the call in the chat). */
  const report = useCallback(() => {
    const st = stat.current, i = infoRef.current;
    if (st.sent || !i || (!st.joinAt && !st.failure)) return;
    st.sent = true;
    const seconds = talkStart.current ? Math.round((Date.now() - talkStart.current) / 1000) : 0;
    const failure = st.failure ?? (st.peers > 0 && !talkStart.current ? 'connect' : null);
    void authedJson(`/api/calls/${callId}/stat`, {
      method: 'POST', keepalive: true,
      body: JSON.stringify({
        mode: i.sfu ? 'sfu' : 'p2p', peers: st.peers, seconds, failure, device: deviceName(),
        setupMs: talkStart.current && st.joinAt ? talkStart.current - st.joinAt : null,
        worstRttMs: st.worstRtt || null, worstLoss: st.worstLoss || null, relay: st.relay, audioOnly: st.audioOnly,
      }),
    }).catch(() => {});
  }, [callId]);

  const finish = useCallback((why?: string) => {
    if (ended.current) return;
    ended.current = true;
    report();
    if (why) setNotice(why);
    const alone = sfuRef.current
      ? Object.values(remotesRef.current).length === 0
      : pcs.current.size === 0 || [...pcs.current.values()].every((pc) => pc.connectionState !== 'connected');
    if (recRef.current) void stopRecording();
    if (notesRef.current) void submitNotes();
    ws.current?.close(1000);
    for (const pc of pcs.current.values()) pc.close();
    pcs.current.clear();
    sfuRef.current?.close();
    sfuRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    effectRef.current?.stop();
    rawCam.current?.stop();
    rawMic.current?.stop();
    micClean.current?.stop();
    screenRef.current?.stop();
    const i = infoRef.current;
    if (alone && i?.type === 'chat' && roomRef.current === callId) {
      const durationSec = talkStart.current ? Math.round((Date.now() - talkStart.current) / 1000) : 0;
      void authedJson(`/api/calls/${callId}/end`, { method: 'POST', body: JSON.stringify({ durationSec, answered: everJoined.current }), keepalive: true }).catch(() => {});
    }
    setPhase('ended');
    // Nobody answered a one-to-one call: offer to leave a voice message (like voicemail).
    if (why === 'No answer' && i?.oneToOne && i.conversationId) { setVoicemail('offer'); return; }
    setTimeout(() => onLeave(i?.conversationId ?? null), why ? 1400 : 250);
  }, [callId, onLeave, stopRecording, submitNotes, report]);

  /**
   * Moves me to another room of this call (a breakout room, or back to the call itself): a new
   * connection to that room, with the same camera, microphone and screen.
   */
  const goRoom = useCallback((target: string) => {
    if (target === roomRef.current || ended.current) return;
    moving.current = true;
    roomRef.current = target;
    pinned.current = null;
    inbound.current.clear();
    setR(() => ({}));
    setCaptions({});
    setRoomChat([]);
    setMyHand(null);
    setSpotlight(null);
    setLobby([]);
    setPickOpen(false);
    setPoll(null);
    pollId.current = null;
    setWatch(null);
    setPhase('starting');
    setRoom(target);
  }, [setR, setSpotlight]);
  useEffect(() => { goRoomRef.current = goRoom; }, [goRoom]);

  // A call that couldn't connect while on hold (out of sight) closes itself instead of lingering.
  useEffect(() => {
    if (phase === 'error' && held) onLeave(null);
  }, [phase, held, onLeave]);

  // Speaking times start again for each call.
  useEffect(() => { meter.talk.clear(); }, [callId]);

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
    const waits = rpcWait.current;
    const known = new Map<string, Peer>();

    // Signals from one person are handled strictly in order, and ICE candidates that arrive before
    // the offer/answer they belong to wait for it (dropping them left calls stuck on "Connecting").
    const queues = new Map<string, Promise<void>>();
    const early = new Map<string, RTCIceCandidateInit[]>();
    const handle = async (from: string, data: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit; fresh?: boolean }) => {
      let pc = pcs.current.get(from);
      if (data.sdp?.type === 'offer' && (data.fresh || !pc)) {
        pc = connectTo(known.get(from) ?? { peerId: from, userId: '', name: 'Someone' });
      }
      if (!pc) return;
      if (data.sdp) {
        if (data.sdp.type === 'answer' && pc.signalingState !== 'have-local-offer') return; // stale answer
        if (data.sdp.type === 'offer' && pc.signalingState === 'have-local-offer') {
          // Both offered at once (rare): the smaller id wins, the other rolls back and answers.
          if ((myId.current ?? '') < from) return;
          await pc.setLocalDescription({ type: 'rollback' });
        }
        await pc.setRemoteDescription(data.sdp);
        for (const c of early.get(from) ?? []) await pc.addIceCandidate(c).catch(() => {});
        early.delete(from);
        if (data.sdp.type === 'offer') {
          // Answer every line send-and-receive, so this side can turn its camera on or share later.
          for (const t of pc.getTransceivers()) if (t.direction === 'recvonly' && !t.currentDirection) t.direction = 'sendrecv';
          await pc.setLocalDescription(await pc.createAnswer());
          send({ type: 'signal', to: from, data: { sdp: pc.localDescription } });
        }
      } else if (data.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
        else early.set(from, [...(early.get(from) ?? []), data.candidate]);
      }
    };
    const onSignal = (from: string, data: Parameters<typeof handle>[1]) => {
      const next = (queues.get(from) ?? Promise.resolve()).then(() => handle(from, data)).catch((e) => console.warn('call signal failed', e));
      queues.set(from, next);
      return next;
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
        if (Date.now() - lastQ > 1000) { lastQ = Date.now(); noteSfuQuality(link.pc.connectionState === 'connected' ? 'good' : link.pc.connectionState === 'failed' ? 'poor' : null); }
      };
      try {
        await sendOrWatch(link, you, false);
        syncSfu();
      } catch (e) {
        console.warn('SFU join failed', e);
        toast.error('Couldn’t connect to the call server. Trying again…');
        ws.current?.close();
      }
    };

    /** Sends my microphone, camera and screen, or (a webinar's audience) only receives. */
    const sendOrWatch = async (link: SfuLink, you: string, freshSession: boolean) => {
      if (audienceRef.current) return link.watch(freshSession);
      await link.start(you, localRef.current!, true, freshSession);
      if (stateRef.current.muted) await link.replace('audio', null);
      if (screenRef.current) await link.replace('screen', screenRef.current);
      if (!stateRef.current.camera) await link.replace('video', null);
    };

    /** Going on or off a webinar's stage: a fresh SFU session (the others drop what I sent before). */
    restartSfuRef.current = async () => {
      const t = ticketRef.current, you = myId.current;
      if (!t?.sfu || !you) return;
      sfuRef.current?.close();
      const link = new SfuLink(rpc, t.iceServers, onSfuTrack);
      sfuRef.current = link;
      setR((r) => Object.fromEntries(Object.entries(r).map(([id, x]) => [id, { ...x, stream: null, screen: null }])));
      try {
        await sendOrWatch(link, you, true);
        syncSfu();
      } catch (e) {
        toast.error((e as Error).message || 'Couldn’t switch. Please try again.');
      }
    };

    const open = async () => {
      if (cancelled || ended.current) return;
      let t: Ticket;
      try {
        t = guest
          ? await fetch('/api/guest/ticket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: room, token: guest.token, name: myName }) })
            .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error || 'Couldn’t join the call.'); return b as Ticket; })
          : await authedJson<Ticket>(`/api/calls/${room}/ticket`, { method: 'POST', body: JSON.stringify({ kind: wantKind }) });
      } catch (e) {
        if (room !== callId) {
          toast.error((e as Error).message || 'Couldn’t join that room.');
          goRoomRef.current(callId);
          return;
        }
        setError((e as Error).message || 'Couldn’t join the call.');
        setPhase('error');
        stat.current.failure = 'ticket';
        report();
        return;
      }
      ice.current = t.iceServers;
      ticketRef.current = t;
      audienceRef.current = !!t.audience;
      setAudienceMe(!!t.audience);
      infoRef.current = { kind: t.kind, type: t.type, title: t.title, oneToOne: t.oneToOne, conversationId: t.conversationId, chatId: t.chatId ?? null, host: t.host, sfu: t.sfu, max: t.max };
      setInfo(infoRef.current);
      const preview = t.type !== 'chat' && !joinConfirmed.current && !t.audience;
      if (!localRef.current && t.audience) {
        // A webinar's audience watches: no camera or microphone is asked for (2.10).
        localRef.current = new MediaStream();
        stateRef.current.camera = false; setCamera(false);
        stateRef.current.muted = true; setMuted(true);
        setLocal(localRef.current);
      } else if (!localRef.current) {
        try {
          // Voice calls start with the camera off (it can be turned on during the call).
          const video = t.kind === 'video' ? cameraConstraints() : false;
          const opened = await openMedia(video, noiseMode());
          if (cancelled) { opened.getTracks().forEach((x) => x.stop()); return; }
          // What's sent: the microphone through noise suppression, and the camera.
          rawMic.current = opened.getAudioTracks()[0] ?? null;
          micClean.current = rawMic.current ? await cleanMic(rawMic.current, noiseMode()) : null;
          const camTrack = opened.getVideoTracks()[0] ?? null;
          // A background chosen before: the camera waits for it, so your room is never shown first.
          const holdForBg = !!camTrack && savedBackground().kind !== 'none' && backgroundsSupported();
          rawCam.current = camTrack;
          localRef.current = new MediaStream([...(micClean.current ? [micClean.current.track] : []), ...(camTrack && !holdForBg ? [camTrack] : [])]);
          const cam = t.kind === 'video' && !!camTrack;
          stateRef.current.camera = cam;
          setCamera(cam);
          setLocal(localRef.current);
          if (holdForBg) void actions.current?.applyCamera(camTrack);
        } catch (e) {
          const name = (e as Error).name;
          setError(name === 'NotAllowedError' ? `Allow the ${t.kind === 'video' ? 'camera and microphone' : 'microphone'} to join the call.` : 'No microphone or camera was found.');
          setPhase('error');
          stat.current.failure = 'media';
          report();
          return;
        }
      }
      if (preview) {
        // Meetings: check yourself first. Joining fetches a fresh ticket (they expire quickly).
        setPhase('prejoin');
        resumeJoin.current = () => { joinConfirmed.current = true; meter.talk.clear(); setPhase('starting'); void open(); };
        void authedJson<{ names?: string[] }>(`/api/calls/${callId}/peers`).then((r) => setInRoom(r.names ?? [])).catch(() => setInRoom([]));
        return;
      }
      const url = new URL(t.path, window.location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const sock = new WebSocket(url);
      ws.current = sock;
      stat.current.joinAt ||= Date.now();
      sock.onmessage = async (ev) => {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === 'lobby') {
          // In the waiting room: nothing is shared until the host lets me in.
          retry = 0;
          stat.current.joinAt = 0;
          setHostHere(msg.hostHere === true);
          setPhase('lobby');
        } else if (msg.type === 'welcome') {
          retry = 0;
          stat.current.joinAt ||= Date.now();
          if (queued.current) { queued.current = false; setLine(null); turnAlert(t.title); }
          setLobby(Array.isArray(msg.lobby) ? msg.lobby.map((w: { peerId: string; name: string }) => ({ id: w.peerId, name: w.name })) : []);
          setLobbyOn(msg.lobbyOn === true);
          if (Array.isArray(msg.chat)) setRoomChat(msg.chat);
          setBo(msg.bo ?? null);
          pollId.current = msg.poll?.id ?? null;
          setPoll(msg.poll ?? null);
          if (typeof msg.now === 'number') skew.current = msg.now - Date.now();
          setWatch(msg.watch ? { ...msg.watch, marks: msg.watch.marks ?? [] } : null);
          if (msg.pulse) gotPulse(msg.pulse);
          setWebinar(msg.webinar?.on ? { on: true, stage: msg.webinar.stage ?? [], audience: msg.webinar.audience ?? 0 } : null);
          setQa(Array.isArray(msg.qa) ? msg.qa : []);
          if (msg.webinar?.on && !msg.host && !msg.cohost && !(msg.webinar.stage ?? []).includes(msg.you) && !audienceRef.current) {
            // A webinar started between my ticket and joining: watch.
            audienceRef.current = true;
            setAudienceMe(true);
            stopMyMedia();
          }
          setPhase('live');
          for (const p of msg.peers as Peer[]) known.set(p.peerId, p);
          myId.current = msg.you;
          setMyPeerId(msg.you);
          setMeHost(msg.host === true);
          setMeCohost(msg.cohost === true);
          modRef.current = msg.host === true || msg.cohost === true;
          setSpotlight(typeof msg.spotlight === 'string' ? msg.spotlight : null);
          announce();
          if (t.sfu) {
            await joinSfu(msg.you, msg.peers, t);
          } else {
            for (const p of msg.peers as Peer[]) {
              // Back after the signalling link dropped: calls that are still connected keep going.
              if (pcs.current.get(p.peerId)?.connectionState === 'connected') continue;
              const pc = connectTo(p, true);
              await pc.setLocalDescription(await pc.createOffer());
              send({ type: 'signal', to: p.peerId, data: { sdp: pc.localDescription, fresh: true } });
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
          // A new session (they went on or off a webinar's stage): what they sent before is gone.
          const before = remotesRef.current[msg.from]?.peer.sfu;
          if (before && before.sessionId !== msg.sessionId && sfuRef.current) {
            const old = before.tracks.map((x) => x.trackName).filter((n) => sfuRef.current!.isPulled(n));
            if (old.length) void sfuRef.current.drop(old).catch(() => {});
            setR((r) => (r[msg.from] ? { ...r, [msg.from]: { ...r[msg.from], stream: null, screen: null } } : r));
          }
          setR((r) => (r[msg.from] ? { ...r, [msg.from]: { ...r[msg.from], peer: { ...r[msg.from].peer, sfu: { sessionId: msg.sessionId, tracks: msg.tracks } } } } : r));
          syncSfu();
        } else if (msg.type === 'signal') {
          await onSignal(msg.from, msg.data);
        } else if (msg.type === 'state') {
          const before = remotesRef.current[msg.from];
          if (msg.recording && before && !before.recording) toast(`${before.peer.name} started recording this ${callId.startsWith('c_') ? 'class' : 'call'}`, { icon: '⏺' });
          if (msg.notes && before && !before.notes) toast(callId.startsWith('c_')
            ? `${before.peer.name} turned on class notes: what’s said in the class becomes a study pack (summary, notes and flashcards). Only text is kept, never audio.`
            : `${before.peer.name} turned on meeting notes: what’s said becomes notes (summary, decisions and action items) for everyone in the call. Only text is kept, never audio.`, { icon: '📝', duration: 8000 });
          patch(msg.from, { muted: msg.muted, camera: msg.camera, sharing: msg.sharing, cc: msg.cc === true, recording: msg.recording === true, notes: msg.notes === true, lowData: msg.lowData === true });
          const pc = pcs.current.get(msg.from);
          if (pc && before && before.lowData !== (msg.lowData === true)) void tuneSenders(pc, msg.lowData !== true);
          if (sfuRef.current && before && (before.camera !== msg.camera || before.sharing !== msg.sharing)) syncSfu();
        } else if (msg.type === 'caption') {
          const who = remotesRef.current[msg.from];
          if (msg.final) noteLine(who?.peer.name ?? 'Someone', String(msg.text));
          const lang = typeof msg.lang === 'string' ? msg.lang : null;
          if (msg.final && typeof msg.id === 'string' && lang) {
            heard.current.set(msg.id, { text: String(msg.text), lang });
            if (heard.current.size > 120) heard.current.delete(heard.current.keys().next().value!);
          }
          if (who && stateRef.current.cc) setCaptions((c) => {
            // Reading a translation: the last sentence stays up while they say the next one.
            const prev = c[msg.from];
            const translating = !!ccLangRef.current && !!lang && lang !== ccLangRef.current;
            if (translating && !msg.final && prev?.final && Date.now() - prev.at < CAPTION_MS) return c;
            return { ...c, [msg.from]: { name: who.peer.name, text: String(msg.text), final: !!msg.final, at: Date.now(), id: typeof msg.id === 'string' ? msg.id : undefined, lang } };
          });
        } else if (msg.type === 'cc-do') {
          // The call room asks me to translate a sentence for everyone reading my language.
          const h = typeof msg.id === 'string' ? heard.current.get(msg.id) : undefined;
          if (h && typeof msg.lang === 'string') {
            void translator.current?.translate(msg.id, h.text, h.lang, msg.lang).then((text) => {
              if (!text) return;
              send({ type: 'cc-tr', id: msg.id, lang: msg.lang, text });
              gotTranslation(msg.id, text);
            });
          }
        } else if (msg.type === 'pulse') {
          gotPulse({ lost: Number(msg.lost) || 0, got: Number(msg.got) || 0, total: Number(msg.total) || 0 });
        } else if (msg.type === 'stage') {
          if (msg.on) {
            // Invited on stage, or the webinar ended: I turn my microphone on when I'm ready.
            haptic('tap');
            setStageInvite({ by: String(msg.by ?? 'The host'), ended: msg.webinar === false });
          } else {
            // Back to the audience, or a webinar started: I stop sending.
            const was = audienceRef.current;
            audienceRef.current = true;
            setAudienceMe(true);
            setStageInvite(null);
            stopMyMedia();
            void restartSfuRef.current?.();
            if (!was) toast(msg.webinar ? `${msg.by} moved you to the audience. Raise your hand to ask to speak.` : `${msg.by} started a webinar: you’re watching. Raise your hand to ask to speak, and ask in Q&A.`, { icon: '🎙️', duration: 8000 });
          }
        } else if (msg.type === 'webinar') {
          setWebinar(msg.on ? { on: true, stage: msg.stage ?? [], audience: msg.audience ?? 0 } : null);
          if (!msg.on) setQa([]);
          // The people I hear about now (a webinar's audience only hears about the stage).
          const visible = new Map(((msg.peers ?? []) as Peer[]).map((p) => [p.peerId, p]));
          for (const p of visible.values()) known.set(p.peerId, p);
          const gone = Object.values(remotesRef.current).filter((x) => !visible.has(x.peer.peerId));
          const goneTracks = gone.flatMap((x) => x.peer.sfu?.tracks.map((t) => t.trackName) ?? []).filter((n) => sfuRef.current?.isPulled(n));
          if (goneTracks.length) void sfuRef.current?.drop(goneTracks).catch(() => {});
          setR((r) => Object.fromEntries([...visible].map(([id, p]) => [id, r[id] ? { ...r[id], peer: { ...r[id].peer, ...p } } : fresh(p)])));
          if (sfuRef.current) syncSfu();
        } else if (msg.type === 'audience') {
          setWebinar((w) => (w ? { ...w, audience: Number(msg.n) || 0 } : w));
        } else if (msg.type === 'qa') {
          setQa(Array.isArray(msg.items) ? msg.items : []);
        } else if (msg.type === 'cc-tr') {
          if (typeof msg.id === 'string' && typeof msg.text === 'string') gotTranslation(msg.id, msg.text);
        } else if (msg.type === 'left') {
          pcs.current.get(msg.peerId)?.close();
          pcs.current.delete(msg.peerId);
          inbound.current.delete(msg.peerId);
          const gone = remotesRef.current[msg.peerId];
          if (gone?.peer.sfu && sfuRef.current) void sfuRef.current.drop(gone.peer.sfu.tracks.map((x) => x.trackName)).catch(() => {});
          if (pinned.current === msg.peerId) pinned.current = null;
          setR((r) => Object.fromEntries(Object.entries(r).filter(([id]) => id !== msg.peerId)));
          setCaptions((c) => (c[msg.peerId] ? Object.fromEntries(Object.entries(c).filter(([id]) => id !== msg.peerId)) : c));
          if (sfuRef.current) syncSfu();
        } else if (msg.type === 'control') {
          // From the host: muted at once; unmuting is only asked for; camera off.
          if (msg.action === 'mute' && !stateRef.current.muted) {
            actions.current?.setMicOff(true);
            toast(`${msg.by} muted ${msg.all ? 'everyone' : 'you'}`, { icon: '🔇' });
          } else if (msg.action === 'ask-unmute' && stateRef.current.muted) {
            toast(`${msg.by} asks you to unmute`, { icon: '🎙️', duration: 12_000, action: { label: 'Unmute', onClick: () => actions.current?.setMicOff(false) } });
          } else if (msg.action === 'stop-video' && stateRef.current.camera) {
            void actions.current?.toggleCamera();
            toast(`${msg.by} turned your camera off`, { icon: '📷' });
          }
        } else if (msg.type === 'removed') {
          finish(`${msg.by || 'The host'} removed you from the call`);
        } else if (msg.type === 'role') {
          if (msg.peerId === myId.current) {
            setMeCohost(msg.cohost === true);
            modRef.current = msg.cohost === true;
            toast(msg.cohost ? `${msg.by} made you a co-host` : `${msg.by} took back co-host`, { icon: '🛡️' });
          } else {
            setR((r) => (r[msg.peerId] ? { ...r, [msg.peerId]: { ...r[msg.peerId], peer: { ...r[msg.peerId].peer, cohost: msg.cohost === true } } } : r));
          }
        } else if (msg.type === 'chat' && msg.line) {
          setRoomChat((c) => (c.some((x) => x.id === msg.line.id) ? c : [...c.slice(-199), msg.line]));
        } else if (msg.type === 'knock') {
          // Someone in the waiting room (only hosts and co-hosts hear this).
          const w = { id: String(msg.peer?.peerId), name: String(msg.peer?.name ?? 'Someone') };
          setLobby((l) => (l.some((x) => x.id === w.id) ? l : [...l, w]));
          // Office hours have their own line (OfficeBar), so no knock for each student.
          if (!callId.startsWith('o_')) toast(`${w.name} is waiting to join`, { icon: '🚪', duration: 15_000, action: { label: 'Let in', onClick: () => send({ type: 'control', action: 'admit', target: w.id }) } });
        } else if (msg.type === 'lobby-left') {
          setLobby((l) => l.filter((x) => x.id !== msg.peerId));
        } else if (msg.type === 'lobby-setting') {
          setLobbyOn(msg.on === true);
        } else if (msg.type === 'denied') {
          finish('The host didn’t let you in');
        } else if (msg.type === 'rec-blocked') {
          // The school doesn't allow recording calls with students under 18 (4.10): blocked as it
          // started (nothing kept), or someone under 18 just joined (what came before is saved).
          const startedAt = recRef.current?.startedAt ?? 0;
          void stopRecording(!msg.joined || Date.now() - startedAt < 5000);
          toast(msg.joined ? 'Recording stopped: someone under 18 joined, and your school doesn’t allow recording them. What was recorded before is saved.' : 'Your school doesn’t allow recording calls with students under 18.', { icon: '🔒', duration: 9000 });
        } else if (msg.type === 'watch') {
          if (typeof msg.now === 'number') skew.current = msg.now - Date.now();
          const w = msg.watch as WatchState | null;
          setWatch((prev) => (w ? { ...w, marks: w.marks ?? (prev?.id === w.id ? prev.marks : []) } : null));
          const verb = ({ play: 'pressed play', pause: 'paused for everyone', seek: 'moved the video', lock: w?.lock ? 'locked the controls' : 'let everyone control it' } as Record<string, string>)[msg.op];
          setWatchStatus(msg.op === 'start' ? null : verb ? `${msg.by} ${verb}` : null);
          if (msg.op === 'start' && w) {
            if (!w.mine) toast(`${msg.by} started a video for everyone`, { icon: '🎬' });
            if (!echoTip.current) { echoTip.current = true; toast('Headphones keep the video from echoing back to everyone.', { icon: '🎧', duration: 6000 }); }
          }
          if (msg.op === 'stop' && msg.by !== myName) toast(`${msg.by} stopped the video`, { icon: '⏹️' });
        } else if (msg.type === 'watch-mark') {
          setWatch((w) => (w && w.id === msg.id && msg.mark ? { ...w, marks: [...w.marks, msg.mark].slice(-300) } : w));
        } else if (msg.type === 'queue') {
          queued.current = true;
          setLine({ pos: Number(msg.pos) || 1, waiting: Number(msg.waiting) || 1, etaMin: Number(msg.etaMin) || 1 });
        } else if (msg.type === 'queue-size') {
          setOfficeLine({ waiting: Number(msg.waiting) || 0, avgMin: Number(msg.avgMin) || 5 });
        } else if (msg.type === 'office-done') {
          // The call screen closes soon after, so the thanks stays as a toast too.
          toast(`Thanks for coming! ${msg.by || 'Your teacher'} ended your turn.`, { icon: '👋' });
          finish('Thanks for coming! Your turn has ended.');
        } else if (msg.type === 'office-closed') {
          toast('Office hours have closed for now.', { icon: '🚪' });
          finish('Office hours have closed for now.');
        } else if (msg.type === 'hand') {
          const at = typeof msg.at === 'number' ? msg.at : null;
          if (msg.peerId === myId.current) setMyHand(at);
          else {
            const who = remotesRef.current[msg.peerId];
            if (at && who && !who.hand && modRef.current) toast(`${who.peer.name} raised their hand`, { icon: '✋' });
            patch(msg.peerId, { hand: at });
          }
        } else if (msg.type === 'react') {
          const who = remotesRef.current[msg.from];
          if (who && typeof msg.emoji === 'string') addFloat(msg.emoji, who.peer.name);
        } else if (msg.type === 'spotlight') {
          setSpotlight(typeof msg.peerId === 'string' ? msg.peerId : null);
        } else if (msg.type === 'breakout') {
          setBo(msg.bo ?? null);
        } else if (msg.type === 'poll') {
          // A new poll (not mine): a gentle nudge to answer.
          if (msg.poll && msg.poll.id !== pollId.current && !modRef.current) toast(`${msg.poll.by} asks: ${msg.poll.q}`, { icon: '📊', duration: 6000 });
          pollId.current = msg.poll?.id ?? null;
          setPoll(msg.poll ?? null);
        } else if (msg.type === 'bo-help') {
          // Someone in a breakout room asks the hosts to come (hosts only).
          const n = Number(msg.n);
          toast(`${msg.by} in ${msg.room} asks for help`, { icon: '🛟', duration: 20_000, action: { label: 'Join', onClick: () => goRoomRef.current(roomId(callId, n)) } });
        } else if (msg.type === 'declined') {
          toast(`${msg.name || 'They'} declined the call`);
          if (t.oneToOne && pcs.current.size === 0) finish('Declined');
        }
      };
      sock.onclose = (ev) => {
        const current = ws.current === sock;
        if (current) ws.current = null;
        if (ev.code === 4001) finish('The host removed you from the call');
        if (ev.code === 4003) finish('The host didn’t let you in');
        if (ev.code === 4005) finish('Thanks for coming! Your turn has ended.');
        if (ev.code === 4006) finish('Office hours have closed for now.');
        if (current) {
          for (const w of rpcWait.current.values()) w.reject(new Error('Disconnected'));
          rpcWait.current.clear();
        }
        // Small calls already connected keep going browser to browser; reconnect so new people can
        // join. Bigger calls rejoin the SFU on reconnect (a new session).
        if (!cancelled && !ended.current && retry < 6) setTimeout(open, Math.min(15_000, 1000 * 2 ** retry++));
        else if (!cancelled && !ended.current) stat.current.failure = 'dropped';
      };
    };
    void open();
    // Closing the tab mid-call still reports how it went.
    window.addEventListener('pagehide', report);

    return () => {
      window.removeEventListener('pagehide', report);
      // Into another room of this call: same call, so no report, and my media carries on.
      const switching = moving.current;
      moving.current = false;
      if (!switching) report();
      cancelled = true;
      const sock = ws.current;
      ws.current = null;
      sock?.close(1000);
      for (const w of waits.values()) w.reject(new Error('Disconnected'));
      waits.clear();
      for (const pc of conns.values()) pc.close();
      conns.clear();
      sfuRef.current?.close();
      sfuRef.current = null;
      if (switching) return;
      localRef.current?.getTracks().forEach((t) => t.stop());
      effectRef.current?.stop();
      rawCam.current?.stop();
      rawMic.current?.stop();
      micClean.current?.stop();
      screenRef.current?.stop();
    };
  }, [room, connectTo]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Packets lost since the last reading (not since the start, so a bad minute early on doesn't
    // stick, and a connection going bad now shows at once).
    const last = new WeakMap<RTCPeerConnection, { lost: number; got: number }>();
    const measure = async (pc: RTCPeerConnection): Promise<Quality> => {
      const stats = await pc.getStats().catch(() => null);
      let rtt: number | null = null, lost = 0, got = 0;
      stats?.forEach((s) => {
        if (s.type === 'candidate-pair' && s.state === 'succeeded' && typeof s.currentRoundTripTime === 'number') rtt = s.currentRoundTripTime;
        if (s.type === 'inbound-rtp') { lost += s.packetsLost ?? 0; got += s.packetsReceived ?? 0; }
      });
      const before = last.get(pc) ?? { lost: 0, got: 0 };
      last.set(pc, { lost, got });
      const dLost = Math.max(0, lost - before.lost), dGot = Math.max(0, got - before.got);
      const loss = dGot ? dLost / (dLost + dGot) : 0;
      // For the call health log: the worst moments, and whether the TURN relay carried the call.
      const st = stat.current;
      if (rtt !== null) st.worstRtt = Math.max(st.worstRtt, Math.round(rtt * 1000));
      st.worstLoss = Math.max(st.worstLoss, loss);
      st.peers = Math.max(st.peers, Object.keys(remotesRef.current).length);
      stats?.forEach((x) => {
        if (x.type === 'candidate-pair' && x.state === 'succeeded' && x.nominated && stats.get(x.localCandidateId)?.candidateType === 'relay') st.relay = true;
      });
      return rtt === null ? null : rtt > 0.4 || loss > 0.08 ? 'poor' : rtt > 0.2 || loss > 0.03 ? 'fair' : 'good';
    };
    const q = setInterval(async () => {
      const link = sfuRef.current;
      const readings: Quality[] = [];
      if (link) {
        if (link.pc.connectionState === 'connected') { const quality = await measure(link.pc); readings.push(quality); noteSfuQuality(quality); }
      } else {
        for (const [id, pc] of pcs.current) {
          if (pc.connectionState !== 'connected') continue;
          const quality = await measure(pc);
          readings.push(quality);
          if (remotesRef.current[id]?.quality !== quality) patch(id, { quality });
        }
      }
      // Audio-only fallback: poor for 10 s while someone's camera is on.
      if (!readings.includes('poor')) { poorSince.current = null; return; }
      poorSince.current ??= Date.now();
      const cameras = Object.values(remotesRef.current).some((r) => r.camera);
      if (cameras && !audioOnlyRef.current && Date.now() - poorSince.current >= 10_000 && Date.now() > autoAudioOnlyAfter.current) setLowData(true);
    }, 4000);
    return () => { clearInterval(t); clearInterval(q); };
  }, [phase, patch, noteSfuQuality, setLowData]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // ── Captions ──────────────────────────────────────────────────────────────────────────────
  // My browser listens only while someone in the call wants captions and I'm not muted.
  const someoneNotes = notes || list.some((r) => r.notes);
  const wantCaptions = phase === 'live' && (cc || someoneNotes || list.some((r) => r.cc));
  useCaptions(
    wantCaptions && !muted,
    (text, final) => {
      send({ type: 'caption', text, final, lang: navigator.language });
      if (final) noteLine(myName, text);
      if (stateRef.current.cc) setCaptions((c) => ({ ...c, me: { name: 'You', text, final, at: Date.now() } }));
    },
    (why) => toast.error(why),
  );
  // The call room learns which language I read in; translating happens on this device or the server.
  useEffect(() => {
    ccLangRef.current = cc ? ccLang : null;
    send({ type: 'cc-lang', lang: ccLangRef.current, device: canTranslateOnDevice() });
  }, [cc, ccLang]);
  useEffect(() => () => { if (pulseClear.current) clearTimeout(pulseClear.current); }, []);
  useEffect(() => {
    const t = captionTranslator(callId, (why) => toast(why, { icon: '🌐', duration: 9000 }), { server: !isGuest });
    translator.current = t;
    return () => { t.close(); translator.current = null; };
  }, [callId, isGuest]);
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

  const toggleNotes = () => {
    haptic('tap');
    if (notesRef.current) { void submitNotes(); return; }
    notesRef.current = { start: nowMs(), lines: [], chars: 0, pulse: pulseNow.current ? [{ t: 0, ...pulseNow.current }] : [] };
    setNotes(true);
    stateRef.current.notes = true;
    announce();
    const cls = callId.startsWith('c_');
    toast.success(!captionsSupported()
      ? `${cls ? 'Class' : 'Meeting'} notes are on, but this browser can’t caption your own voice: everyone else’s words are still collected. Chrome, Edge or Safari capture everyone.`
      : cls
        ? 'Class notes are on. Everyone sees the Notes badge. When you stop (or leave), the class gets a study pack: summary, notes, key moments, flashcards and a draft quiz for you to check.'
        : 'Meeting notes are on. Everyone sees the Notes badge. When you stop (or leave), the notes (summary, decisions and action items) are shared where the call happened.', { duration: 9000 });
  };

  useEffect(() => {
    if (!notes) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [notes]);

  // ── Recording (class teacher) ──────────────────────────────────────────────────────────────
  useEffect(() => { recSourcesRef.current = () => {
    const root = rootRef.current;
    const videoOf = (id: string) => root?.querySelector<HTMLVideoElement>(`video[data-peer="${CSS.escape(id)}"]`) ?? null;
    const kindNow = infoRef.current?.kind ?? 'audio';
    return [
      { name: myName, stream: local, video: videoOf('me'), showVideo: kindNow === 'video' && (camera || sharing), sharing },
      ...list.map((r) => ({ name: r.peer.name, stream: r.stream, video: videoOf(r.peer.peerId), showVideo: kindNow === 'video' && (r.camera || r.sharing) && !r.paused && !audioOnlyRef.current, sharing: r.sharing })),
    ];
  }; });

  const startRecording = async () => {
    // Before recording an hour: may I, and can it be saved (file storage, the owner's switch)?
    let goes = 'the chat';
    try {
      goes = (await authedJson<{ goes: string }>(`/api/calls/${callId}/recording`, { method: 'POST', body: JSON.stringify({ step: 'check' }) })).goes;
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }
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
    toast.success(`Recording. Everyone in the call sees the REC badge. It’s saved to ${goes} when you stop.`);
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
  /** Mutes or unmutes my microphone (the host's "mute" too; unmuting is only ever my choice). */
  const setMicOff = (off: boolean) => {
    localRef.current?.getAudioTracks().forEach((t) => { t.enabled = !off; });
    if (rawMic.current) rawMic.current.enabled = !off;
    // Through the SFU a muted mic sends nothing at all.
    void sfuRef.current?.replace('audio', off ? null : localRef.current?.getAudioTracks()[0] ?? null);
    setMuted(off);
    stateRef.current.muted = off;
    announce();
  };
  const toggleMute = () => {
    haptic('tap');
    setMicOff(!stateRef.current.muted);
  };
  /** Raises or lowers my hand (the call room keeps the queue's order). */
  const toggleHand = () => {
    haptic('tap');
    const up = !myHand;
    setMyHand(up ? Date.now() : null);
    send({ type: 'hand', up });
  };
  /** A reaction for everyone (a few a second at most, like the call room allows). */
  const react = (emoji: Reaction) => {
    const now = Date.now();
    reactLog.current = reactLog.current.filter((t) => now - t < 4000);
    if (reactLog.current.length >= 8) return;
    reactLog.current.push(now);
    haptic('tap');
    send({ type: 'react', emoji });
    addFloat(emoji, 'You');
  };
  /** Host controls, sent through the call room (it checks I'm allowed). */
  const control = (action: ControlAction, target?: string | null, on?: boolean) => send({ type: 'control', action, target: target ?? null, on: on === true });

  /** Sends this video (camera, screen or nothing) to everyone, without renegotiating. */
  const replaceVideo = async (track: MediaStreamTrack | null, isScreen = false) => {
    if (sfuRef.current) return sfuRef.current.replace(isScreen ? 'screen' : 'video', track);
    for (const pc of pcs.current.values()) {
      await videoLines(pc)[isScreen ? 1 : 0]?.sender.replaceTrack(track).catch(() => {});
    }
  };

  /** Sends this microphone track to everyone (after a device or noise-suppression change). */
  const replaceAudio = async (track: MediaStreamTrack) => {
    if (sfuRef.current) return sfuRef.current.replace('audio', stateRef.current.muted ? null : track);
    for (const pc of pcs.current.values()) {
      const sender = pc.getTransceivers().find((t) => t.receiver.track.kind === 'audio' && t.currentDirection !== 'stopped')?.sender;
      await sender?.replaceTrack(track).catch(() => {});
    }
  };

  /**
   * Puts a camera (or none) on my preview and sends it to everyone, through the background effect
   * when one is chosen. If the background can't be done here, the camera stays off rather than
   * showing your room instead.
   */
  const applyCamera = async (raw: MediaStreamTrack | null): Promise<boolean> => {
    const seq = ++camSeq.current;
    const oldRaw = rawCam.current, oldFx = effectRef.current;
    rawCam.current = raw;
    effectRef.current = null;
    let out = raw, ok = true;
    if (raw && bgRef.current.kind !== 'none') {
      setBgBusy(true);
      try {
        const fx = await applyBackground(raw, bgRef.current);
        if (seq !== camSeq.current) { fx.stop(); return false; }
        effectRef.current = fx;
        out = fx.track;
      } catch (e) {
        console.warn('Background unavailable', e);
        toast.error('Couldn’t apply your background, so your camera is off. Choose “None” in Background to use the camera without one.');
        raw.stop();
        rawCam.current = null;
        out = null;
        ok = false;
      } finally {
        if (seq === camSeq.current) setBgBusy(false);
      }
    }
    if (seq !== camSeq.current) return false;
    await replaceVideo(out);
    const stream = localRef.current;
    if (stream) {
      for (const old of stream.getVideoTracks()) { stream.removeTrack(old); if (old !== raw) old.stop(); }
      if (out) stream.addTrack(out);
      setLocal(new MediaStream(stream.getTracks()));
    }
    if (oldFx && oldFx !== effectRef.current) oldFx.stop();
    if (oldRaw && oldRaw !== raw) oldRaw.stop();
    if (!ok && stateRef.current.camera) { setCamera(false); stateRef.current.camera = false; announce(); }
    return ok;
  };

  /** A background for the camera (remembered for next time); applied at once if the camera is on. */
  const pickBackground = async (b: Background) => {
    haptic('tap');
    saveBackground(b);
    setBgChoice(b);
    bgRef.current = b;
    const raw = rawCam.current;
    if (!raw || raw.readyState === 'ended' || !stateRef.current.camera) return;
    if (effectRef.current && b.kind !== 'none') { effectRef.current.set(b); return; }
    await applyCamera(raw);
  };
  const uploadBackground = async (file: File) => {
    try {
      setBgCustom(await saveCustomImage(file));
      await pickBackground({ kind: 'image', id: 'custom' });
    } catch { toast.error('Couldn’t use that picture.'); }
  };

  // Turning the camera on works in any call, so a voice call becomes a video call; off releases
  // the camera (its light goes out) and everyone sees your picture again.
  const [cameraBusy, setCameraBusy] = useState(false);
  const toggleCamera = async () => {
    haptic('tap');
    if (cameraBusy) return;
    const next = !camera;
    if (next) {
      setCameraBusy(true);
      let track: MediaStreamTrack;
      try {
        const chosen = chosenDevice('cam');
        track = (await navigator.mediaDevices.getUserMedia({ video: { ...cameraConstraints(), ...(chosen ? { deviceId: { ideal: chosen } } : {}) } })).getVideoTracks()[0];
      } catch {
        toast.error('Allow the camera to turn on video.');
        setCameraBusy(false);
        return;
      }
      const ok = await applyCamera(track);
      setCameraBusy(false);
      if (!ok) return;
    } else {
      await applyCamera(null);
    }
    setCamera(next);
    stateRef.current.camera = next;
    announce();
  };

  useEffect(() => { actions.current = { toggleCamera, setMicOff, applyCamera }; });

  const flipCamera = async () => {
    const current = rawCam.current;
    if (!current) return;
    const facing = current.getSettings().facingMode === 'environment' ? 'user' : 'environment';
    try {
      const track = (await navigator.mediaDevices.getUserMedia({ video: cameraConstraints(facing) })).getVideoTracks()[0];
      await applyCamera(track);
    } catch { /* only one camera */ }
  };

  // ── Microphone, camera and noise suppression settings ─────────────────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [noise, setNoise] = useState<NoiseMode>(() => noiseMode());
  const [devices, setDevices] = useState<{ mics: { id: string; label: string }[]; cams: { id: string; label: string }[] }>({ mics: [], cams: [] });
  const [micId, setMicId] = useState<string | null>(null);
  const openSettings = async () => {
    setSettingsOpen((o) => !o);
    setDevices(await listDevices());
    setMicId(rawMic.current?.getSettings().deviceId ?? null);
  };
  /** Re-opens the microphone (another device, or another noise setting) without leaving the call. */
  const reopenMic = async (deviceId: string | null, mode: NoiseMode) => {
    try {
      const raw = (await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(mode, deviceId) })).getAudioTracks()[0];
      const clean = await cleanMic(raw, mode);
      raw.enabled = clean.track.enabled = !stateRef.current.muted;
      const stream = localRef.current;
      if (stream) { for (const old of stream.getAudioTracks()) stream.removeTrack(old); stream.addTrack(clean.track); }
      await replaceAudio(clean.track);
      const oldClean = micClean.current, oldRaw = rawMic.current;
      micClean.current = clean;
      rawMic.current = raw;
      oldClean?.stop();
      oldRaw?.stop();
      if (stream) setLocal(new MediaStream(stream.getTracks()));
      setMicId(raw.getSettings().deviceId ?? deviceId);
    } catch {
      toast.error('Couldn’t switch the microphone.');
    }
  };
  const pickNoise = (mode: NoiseMode) => {
    setNoise(mode);
    setNoiseMode(mode);
    void reopenMic(micId, mode);
  };
  const pickMic = (id: string) => { chooseDevice('mic', id); void reopenMic(id, noise); };
  const pickCam = async (id: string) => {
    chooseDevice('cam', id);
    if (!camera) return;
    try {
      const track = (await navigator.mediaDevices.getUserMedia({ video: { ...cameraConstraints(), deviceId: { exact: id } } })).getVideoTracks()[0];
      await applyCamera(track);
    } catch { toast.error('Couldn’t switch the camera.'); }
  };

  const stopShare = async () => {
    screenRef.current?.stop();
    screenRef.current = null;
    await replaceVideo(null, true);
    setSharing(false);
    stateRef.current.sharing = false;
    announce();
  };
  useEffect(() => { stopShareRef.current = stopShare; });
  // The floating window closes with the call.
  useEffect(() => { if (phase === 'ended' || phase === 'error') pipWin?.close(); }, [phase, pipWin]);
  useEffect(() => () => pipWin?.close(), [pipWin]);
  const toggleShare = async () => {
    if (sharing) return stopShare();
    try {
      // Full HD at up to 30 frames: sharp text, smooth scrolling and video.
      const track = (await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } } })).getVideoTracks()[0];
      track.contentHint = 'detail';
      screenRef.current = track;
      await replaceVideo(track, true);
      track.onended = () => { void stopShare(); };
      setSharing(true);
      stateRef.current.sharing = true;
      announce();
    } catch { /* cancelled */ }
  };

  const pip = async () => {
    // Chrome: the whole call with its controls in a floating window; elsewhere, the video only.
    const dpip = documentPip();
    if (dpip) {
      if (pipWin) { pipWin.close(); return; }
      try {
        const w = await dpip.requestWindow({ width: 340, height: 400 });
        copyStyles(w);
        w.document.title = info?.title ?? 'Call';
        w.addEventListener('pagehide', () => setPipWin(null));
        setPipWin(w);
      } catch { toast.error('The floating window isn’t available here.'); }
      return;
    }
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
  const showVideo = (peerId: string) => {
    if (audioOnlyRef.current) { setLowData(false); return; }
    pinned.current = peerId;
    syncSfu();
  };

  // A voice call becomes a video call as soon as anyone turns their camera on or shares a screen.
  const kind: 'audio' | 'video' = camera || sharing || list.some((r) => r.camera || r.sharing) ? 'video' : 'audio';
  const clock = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
  const canShare = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
  const canPip = documentPip() ? phase === 'live' : typeof document !== 'undefined' && document.pictureInPictureEnabled && kind === 'video' && list.length > 0;
  // Notes: the class's teacher (a study pack); whoever runs any other call, or either person in a
  // one-to-one call (meeting notes, Stage 4 · 2.8), from the main call (not a breakout room).
  const canNotes = !!info && (info.type === 'class' ? !!info.host : (meHost || meCohost || info.oneToOne) && room === callId);
  // Recording (Stage 4 · 2.9): the same people as notes (the class's teacher; whoever runs any other call).
  const canRec = canNotes && canRecord();
  const btn = 'w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors';
  const status = phase === 'prejoin' ? 'Ready to join?' : phase === 'lobby' ? 'In the waiting room' : phase === 'starting' ? 'Connecting…' : phase === 'error' ? 'Couldn’t join' : phase === 'ended' ? notice ?? 'Call ended' : waiting ? (info?.type === 'chat' && !talked ? 'Ringing…' : 'Waiting for others to join…') : `${kind === 'video' ? 'Video' : 'Voice'} call · ${clock(seconds)}`;
  const firstRemoteId = list[0]?.peer.peerId;
  // Presenting: someone's shared screen fills the stage (theirs first), cameras go to a strip below.
  const presenter: Remote | 'me' | null = list.find((r) => r.sharing && r.screen) ?? (sharing ? 'me' : null);
  const count = list.length + 1;
  const compact = count > 9;
  const someoneRecording = recording || list.some((r) => r.recording);
  const talk = useTalkTimes(peopleOpen && phase === 'live');
  const chat = useCallChat({ chatId: phase === 'live' ? info?.chatId ?? null : null, room: roomChat, sendRoom: (m) => send({ type: 'chat', ...m }) });
  const unread = chatOpen ? 0 : chat.lines.filter((l) => !l.mine && !l.note && l.at > chatSeenAt).length;
  /** One side panel at a time: people or chat. */
  const openPanel = (which: 'people' | 'chat' | 'rooms' | 'qa' | null) => {
    haptic('tap');
    setReactOpen(false);
    setMoreOpen(false);
    setQaOpen(which === 'qa');
    setBoOpen(which === 'rooms');
    setPeopleOpen(which === 'people');
    // Everything in the chat so far counts as seen.
    if (which === 'chat' || chatOpen) setChatSeenAt(Math.max(chatSeenAt, ...chat.lines.map((l) => l.at)));
    setChatOpen(which === 'chat');
  };
  // The host's spotlight: that person large, everyone else in the strip (a shared screen comes first).
  // A video watched together takes the stage (a shared screen comes first).
  const watching = !!watch && !presenter;
  const lit: Remote | 'me' | null = presenter || watching || !spotlight ? null : spotlight === myPeerId ? 'me' : list.find((r) => r.peer.peerId === spotlight) ?? null;
  const canModerate = meHost || meCohost;
  /** Class calls (and their breakout rooms) have the classroom pulse. */
  const isClassCall = callId.startsWith('c_');
  const roomN = room === callId ? null : Number(room.slice(room.lastIndexOf('~b') + 2)) || null;
  // Breakout rooms: everyone but the hosts goes to their room when the rooms open (or when the host
  // moves them), and back to the call when the rooms close; hosts go where they like (BreakoutPanel).
  useEffect(() => {
    if (phase !== 'live') return;
    const now = Date.now();
    const over = !bo || (bo.closing !== null && now >= bo.closing);
    const target = over ? callId : canModerate ? room : bo.mine ? roomId(callId, bo.mine) : callId;
    if (target !== room) {
      if (target === callId) {
        toast('Back in the main call', { id: 'bo-move', icon: '🚪' });
        goRoom(callId);
        return;
      }
      toast(`Moving you to ${bo?.rooms.find((r) => r.n === bo.mine)?.name ?? 'your room'}…`, { id: 'bo-move', icon: '🚪' });
      const t = setTimeout(() => goRoom(target), 1200);
      return () => clearTimeout(t);
    }
    if (bo?.closing && room !== callId) {
      const t = setTimeout(() => { toast('Back in the main call', { id: 'bo-move', icon: '🚪' }); goRoom(callId); }, Math.max(0, bo.closing - now));
      return () => clearTimeout(t);
    }
  }, [bo, room, callId, canModerate, phase, goRoom]);
  // A host's message to every room, once each (not one sent before I came).
  useEffect(() => {
    const note = bo?.note;
    if (!note || note.at <= noteSeen.current) return;
    const old = noteSeen.current === 0 && Date.now() - note.at > 60_000;
    noteSeen.current = note.at;
    if (!old) toast(`${note.by}: ${note.text}`, { icon: '📣', duration: 12_000 });
  }, [bo]);
  const people: Person[] = [
    { id: myPeerId ?? 'me', name: myName, me: true, host: meHost, cohost: meCohost, muted, camera, sharing, hand: myHand, talkMs: talk.me ?? 0, stage: webinar ? !audienceMe : undefined },
    ...list.map((r) => ({ id: r.peer.peerId, name: r.peer.name, host: r.peer.host, cohost: r.peer.cohost, muted: r.muted, camera: r.camera, sharing: r.sharing, hand: r.hand, talkMs: talk[r.peer.peerId] ?? 0, stage: webinar ? !!r.peer.host || !!r.peer.cohost || webinar.stage.includes(r.peer.peerId) : undefined })),
  ];
  // The raised-hands queue, by when each went up ("me" is my own tile).
  const queue = [...(myHand ? [{ id: 'me', at: myHand }] : []), ...list.filter((r) => r.hand).map((r) => ({ id: r.peer.peerId, at: r.hand! }))].sort((a, b) => a.at - b.at);
  const handPos = (id: string) => { const i = queue.findIndex((q) => q.id === id); return i < 0 ? undefined : i + 1; };
  // Everything that isn't a main control, in the "More" sheet.
  const touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  const canBg = backgroundsSupported();
  const moreItems: { key: 'cc' | 'cclang' | 'devices' | 'bg' | 'flip' | 'rec' | 'notes' | 'poll' | 'rooms' | 'pip' | 'webinar' | 'qa' | 'guests' | 'watch'; label: string; icon: typeof Mic; on?: boolean; tone?: string }[] = [
    ...(meHost && !isGuest && callId.startsWith('l_') && room === callId ? [{ key: 'guests' as const, label: 'Invite guests', icon: UserPlus }] : []),
    ...(webinar ? [{ key: 'qa' as const, label: qa.length ? `Q&A · ${qa.filter((q) => !q.answered).length}` : 'Q&A', icon: MessageCircleQuestion, on: qaOpen }] : []),
    { key: 'cc', label: cc ? 'Captions on' : 'Captions', icon: cc ? Captions : CaptionsOff, on: cc },
    ...(cc ? [{ key: 'cclang' as const, label: ccLang ? `Captions in ${languageName(ccLang)}` : 'Captions as spoken', icon: Languages }] : []),
    { key: 'devices', label: 'Devices & noise', icon: SlidersHorizontal },
    ...(canBg ? [{ key: 'bg' as const, label: 'Background', icon: Wand2, on: bgChoice.kind !== 'none' }] : []),
    ...(camera && touch ? [{ key: 'flip' as const, label: 'Flip camera', icon: RefreshCcw }] : []),
    ...(canRec ? [{ key: 'rec' as const, label: recording ? 'Stop recording' : info?.type === 'class' ? 'Record class' : 'Record call', icon: recording ? Square : Circle, on: recording, tone: recording ? '' : 'fill-rose-500 text-rose-500' }] : []),
    ...(canNotes ? [{ key: 'notes' as const, label: notes ? 'Stop notes' : info?.type === 'class' ? 'Class notes' : 'Meeting notes', icon: NotebookPen, on: notes }] : []),
    ...(canModerate && info && !info.oneToOne ? [{ key: 'poll' as const, label: 'Poll or quiz', icon: BarChart3, on: !!poll?.open }] : []),
    ...(!watch && !audienceMe && (canModerate || (!isClassCall && !webinar)) ? [{ key: 'watch' as const, label: 'Watch together', icon: ListVideo }] : []),
    ...(canModerate && info && !info.oneToOne ? [{ key: 'rooms' as const, label: 'Breakout rooms', icon: DoorOpen, on: !!bo }] : []),
    ...(canModerate && info?.sfu && !info.oneToOne && room === callId ? [{ key: 'webinar' as const, label: webinar ? 'End webinar mode' : 'Webinar mode', icon: Presentation, on: !!webinar }] : []),
    ...(canPip ? [{ key: 'pip' as const, label: documentPip() ? (pipWin ? 'Close floating window' : 'Pop out the call') : 'Picture in picture', icon: PictureInPicture2, on: !!pipWin }] : []),
  ];
  const runMore = (key: (typeof moreItems)[number]['key']) => {
    haptic('tap');
    setMoreOpen(false);
    if (key === 'cc') toggleCc();
    else if (key === 'cclang') setCcPick(true);
    else if (key === 'guests') void inviteGuests();
    else if (key === 'qa') openPanel(qaOpen ? null : 'qa');
    else if (key === 'webinar') {
      control('webinar', null, !webinar);
      if (!webinar) toast('Webinar mode: you and your co-hosts are on stage; everyone else watches and can ask in Q&A or raise a hand. Bring people on stage from People.', { icon: '🎙️', duration: 9000 });
    }
    else if (key === 'devices') void openSettings();
    else if (key === 'bg') setBgOpen(true);
    else if (key === 'flip') void flipCamera();
    else if (key === 'rec') { if (recording) void stopRecording(); else void startRecording(); }
    else if (key === 'notes') toggleNotes();
    else if (key === 'rooms') openPanel('rooms');
    else if (key === 'poll') setPollCompose(true);
    else if (key === 'watch') setWatchPick(true);
    else void pip();
  };
  const lines = Object.entries(captions).sort((a, b) => a[1].at - b[1].at).slice(-3);

  return (
    <>
    {/* Minimised: a floating bar (like the iPhone's), the call keeps going while you use the app. */}
    <AnimatePresence>
      {minimized && !held && phase !== 'error' && (
        <motion.div key="mini" initial={{ y: 40, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 40, opacity: 0, scale: 0.96 }} transition={spring.smooth}
          className="fixed left-1/2 -translate-x-1/2 z-[290] bottom-[calc(var(--mobile-tabbar-h,0px)+env(safe-area-inset-bottom)+0.75rem)] lg:bottom-6 flex items-center gap-2 pl-2 pr-1.5 py-1.5 rounded-full bg-[#121830]/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/40 text-white max-w-[min(94vw,26rem)]" role="region" aria-label="Call in progress">
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
              {someoneNotes && (
                <motion.span key="notes" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={spring.snappy} className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold tracking-wide bg-amber-500/90 text-amber-950 rounded-full px-2 py-0.5" title="Notes are on: what’s said becomes notes or a study pack (text only)">
                  <NotebookPen className="w-3 h-3" />Notes
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
          {phase === 'live' ? (
            <button type="button" onClick={() => openPanel(peopleOpen ? null : 'people')} aria-expanded={peopleOpen} aria-label={`People in the call: ${count}`} title="People"
              className={cn('ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors', peopleOpen ? 'bg-white text-zinc-900' : 'text-zinc-200 bg-white/[0.06] hover:bg-white/15')}>
              <Users className="w-4 h-4" />{count}<span className="hidden sm:inline font-normal">in call</span>
              <AnimatePresence>
                {canModerate && lobby.length > 0 && (
                  <motion.span key="knock" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={spring.snappy} className="ml-0.5 min-w-5 h-5 px-1 rounded-full bg-amber-400 text-amber-950 text-[11px] font-bold flex items-center justify-center" aria-label={`${lobby.length} waiting to join`}>{lobby.length}</motion.span>
                )}
              </AnimatePresence>
            </button>
          ) : <span className="text-xs text-zinc-400 ml-1">{count} in call</span>}
        </div>
      </motion.header>

      {phase === 'error' ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-zinc-300 max-w-sm">{error}</p>
          <button type="button" onClick={() => onLeave(info?.conversationId ?? null)} className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-sm font-semibold">Back</button>
        </motion.div>
      ) : phase === 'prejoin' ? (
        <motion.main initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} className="flex-1 overflow-y-auto p-4 flex items-center justify-center">
          <div className="w-full max-w-4xl grid md:grid-cols-[1.4fr_1fr] gap-6 items-center">
            <Tile id="me" name={myName} stream={local} mirrored muted={muted} camera={camera} me />
            <div className="space-y-4">
              <div>
                <p className="text-2xl font-bold">{info?.title ?? 'Call'}</p>
                <p className="text-sm text-zinc-400 mt-1">
                  {callId.startsWith('o_') && !info?.host ? 'You’ll wait in line, and the call starts by itself when it’s your turn.'
                    : inRoom === null ? 'Checking who’s here…' : inRoom.length === 0 ? 'Nobody else is here yet.' : `${inRoom.slice(0, 3).join(', ')}${inRoom.length > 3 ? ` and ${inRoom.length - 3} more` : ''} ${inRoom.length === 1 ? 'is' : 'are'} in the call.`}
                </p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-zinc-400"><span className="inline-flex items-center gap-1.5">{muted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}{muted ? 'Microphone off' : 'Say something to test your microphone'}</span></div>
                <MicMeter stream={local} muted={muted} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={playTestSound} className="px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/20 text-sm font-medium inline-flex items-center gap-1.5"><Volume2 className="w-4 h-4" /> Test speaker</button>
                <button type="button" onClick={() => void openSettings()} className="px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/20 text-sm font-medium inline-flex items-center gap-1.5"><SlidersHorizontal className="w-4 h-4" /> Devices & noise</button>
                {canBg && <button type="button" onClick={() => setBgOpen(true)} className={cn('px-3.5 py-2 rounded-full text-sm font-medium inline-flex items-center gap-1.5', bgChoice.kind !== 'none' ? 'bg-gradient-to-r from-indigo-500/50 to-fuchsia-500/50' : 'bg-white/10 hover:bg-white/20')}><Wand2 className="w-4 h-4" /> Background</button>}
              </div>
              {bgBusy && <p className="text-xs text-fuchsia-200 inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Applying your background…</p>}
              {(() => {
                const net = typeof navigator !== 'undefined' ? networkGuess() : null;
                return net && (
                  <p className={cn('text-xs inline-flex items-center gap-1.5', net.weak ? 'text-amber-300' : 'text-emerald-300')}>
                    <Signal className="w-3.5 h-3.5" />{net.label}
                    {net.weak && camera && <button type="button" onClick={() => void toggleCamera().then(() => resumeJoin.current?.())} className="underline underline-offset-2 font-semibold">Join with camera off</button>}
                  </p>
                );
              })()}
              <motion.button whileTap={{ scale: 0.97 }} type="button" onClick={() => { haptic('tap'); resumeJoin.current?.(); }}
                className="w-full py-3.5 rounded-2xl font-bold text-base bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-fuchsia-500/30">
                {callId.startsWith('o_') && !info?.host ? 'Join the line' : 'Join now'}
              </motion.button>
            </div>
          </div>
        </motion.main>
      ) : phase === 'lobby' ? (
        <motion.main key="lobby" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} className="flex-1 overflow-y-auto p-4 flex items-center justify-center">
          <div className="w-full max-w-4xl grid md:grid-cols-[1.4fr_1fr] gap-6 items-center">
            <Tile id="me" name={myName} stream={local} mirrored muted={muted} camera={camera} me />
            <div className="space-y-4 text-center md:text-left">
              <div className="relative w-14 h-14 mx-auto md:mx-0">
                <span className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 animate-ping opacity-25" />
                <span className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-xl shadow-fuchsia-500/30"><DoorOpen className="w-7 h-7" /></span>
              </div>
              {callId.startsWith('o_') ? <QueueStatus queue={line} hostHere={hostHere} /> : (
              <div>
                <p className="text-2xl font-bold">You’re in the waiting room</p>
                <AnimatePresence mode="wait">
                  <motion.p key={hostHere ? 'here' : 'away'} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className="text-sm text-zinc-400 mt-1">
                    {hostHere ? 'The host knows you’re here and will let you in soon.' : 'The host isn’t here yet. You’ll join as soon as they let you in.'}
                  </motion.p>
                </AnimatePresence>
              </div>
              )}
              <p className="text-xs text-zinc-500">Nobody sees or hears you until you’re let in.</p>
              <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                <button type="button" onClick={() => void openSettings()} className="px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/20 text-sm font-medium inline-flex items-center gap-1.5"><SlidersHorizontal className="w-4 h-4" /> Devices & noise</button>
                {canBg && <button type="button" onClick={() => setBgOpen(true)} className="px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/20 text-sm font-medium inline-flex items-center gap-1.5"><Wand2 className="w-4 h-4" /> Background</button>}
              </div>
            </div>
          </div>
        </motion.main>
      ) : (
        presenter || watching || lit ? (
          <main className="flex-1 min-h-0 flex flex-col gap-3 p-3 sm:p-4">
            <motion.div layout transition={spring.smooth} className="relative flex-1 min-h-0 rounded-3xl overflow-hidden bg-black ring-1 ring-white/10">
              {presenter === 'me' ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center p-6 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.25),transparent_70%)]">
                  <span className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-xl shadow-fuchsia-500/30"><MonitorUp className="w-8 h-8" /></span>
                  <p className="font-semibold text-lg">You’re sharing your screen</p>
                  <p className="text-sm text-zinc-400 max-w-xs">Everyone sees it now. Your camera stays on for them too.</p>
                  <button type="button" onClick={() => void stopShare()} className="px-5 py-2.5 rounded-full bg-rose-600 hover:bg-rose-500 text-sm font-semibold">Stop sharing</button>
                </div>
              ) : presenter ? (
                <ScreenStage stream={presenter.screen} name={presenter.peer.name} />
              ) : watching && watch ? (
                <WatchStage watch={watch} skew={skew} mod={canModerate} status={watchStatus} held={held} onSend={send} />
              ) : lit === 'me' ? (
                <Tile key="me" id="me" name={myName} stream={local} mirrored muted={muted} camera={camera} me hand={handPos('me')} className="absolute inset-0 h-full w-full aspect-auto rounded-none" />
              ) : lit ? (
                <Tile key={lit.peer.peerId} id={lit.peer.peerId} name={lit.peer.name} stream={lit.stream} silent={held} muted={lit.muted} camera={lit.camera} quality={lit.quality} state={lit.state}
                  paused={lit.paused || audioOnly} onShow={() => showVideo(lit.peer.peerId)} hand={handPos(lit.peer.peerId)} className="absolute inset-0 h-full w-full aspect-auto rounded-none"
                  videoRef={lit.peer.peerId === firstRemoteId ? (v) => { firstRemoteVideo.current = v; } : undefined} />
              ) : null}
            </motion.div>
            <div className="shrink-0 h-24 sm:h-32 flex gap-2 overflow-x-auto justify-center">
              <AnimatePresence initial={false}>
                {lit !== 'me' && <Tile key="me" id="me" name={myName} stream={local} mirrored muted={muted} camera={camera} me compact hand={handPos('me')} className="h-full shrink-0" />}
                {list.filter((r) => r !== lit).map((r) => (
                  <Tile key={r.peer.peerId} id={r.peer.peerId} name={r.peer.name} stream={r.stream} silent={held} muted={r.muted} camera={r.camera} quality={r.quality} state={r.state}
                    paused={r.paused || audioOnly} onShow={() => showVideo(r.peer.peerId)} compact hand={handPos(r.peer.peerId)} className="h-full shrink-0"
                    videoRef={r.peer.peerId === firstRemoteId ? (v) => { firstRemoteVideo.current = v; } : undefined} />
                ))}
              </AnimatePresence>
            </div>
          </main>
        ) : (
        <main className={cn('flex-1 overflow-y-auto p-4 grid content-center', compact ? 'gap-2' : 'gap-4', gridFor(count))}>
          <AnimatePresence initial={false}>
            <Tile key="me" id="me" name={myName} stream={local} mirrored muted={muted} camera={camera} me compact={compact} animateLayout={count <= 12} hand={handPos('me')} />
            {list.map((r) => (
              <Tile key={r.peer.peerId} id={r.peer.peerId} name={r.peer.name} stream={r.stream} silent={held} muted={r.muted} camera={r.camera} quality={r.quality} state={r.state}
                paused={r.paused || audioOnly} onShow={() => showVideo(r.peer.peerId)} compact={compact} animateLayout={count <= 12} hand={handPos(r.peer.peerId)}
                videoRef={r.peer.peerId === firstRemoteId ? (v) => { firstRemoteVideo.current = v; } : undefined} />
            ))}
          </AnimatePresence>
          {waiting && info?.type === 'chat' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center" aria-hidden>
              <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" /><span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" /></span>
            </motion.div>
          )}
        </main>
        )
      )}

      {/* Breakout rooms, and the audio-only fallback */}
      <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+4.5rem)] z-20 px-3 flex flex-col items-center gap-2 pointer-events-none">
        {phase === 'live' && (
          <BreakoutBar bo={bo} room={roomN} mod={canModerate}
            onHelp={() => { haptic('tap'); send({ type: 'bo-help' }); toast.success('The host knows you’d like help.'); }}
            onMain={() => goRoom(callId)} onPick={() => { haptic('tap'); setPickOpen(true); }} onManage={() => openPanel('rooms')} />
        )}
        <AnimatePresence>
          {phase === 'live' && isClassCall && canModerate && pulse && pulse.lost + pulse.got > 0 && <PulseMeter key="pulse" counts={pulse} />}
          {phase === 'live' && callId.startsWith('o_') && canModerate && (
            <OfficeBar key="office" line={officeLine} onNext={() => { haptic('tap'); control('office-next'); }}
              students={Object.values(remotes).filter((x) => !x.peer.host && !x.peer.cohost).map((x) => ({ userId: x.peer.userId, name: x.peer.name }))} />
          )}
          {phase === 'live' && webinar && (
            <motion.p key="webinar" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring.smooth}
              className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-black/55 backdrop-blur-xl border border-white/10 px-3 py-1.5 text-xs font-semibold" role="status">
              <Presentation className="w-3.5 h-3.5 text-fuchsia-300" />Webinar · {webinar.audience} watching
            </motion.p>
          )}
          {phase === 'live' && stageInvite && (
            <motion.div key="invite" initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={spring.smooth}
              className="pointer-events-auto w-[min(92vw,22rem)] rounded-2xl bg-[#121830]/95 backdrop-blur-xl border border-white/10 p-4 shadow-2xl" role="alertdialog" aria-label="Invited to speak">
              <p className="font-semibold">{stageInvite.ended ? 'The webinar is over' : `${stageInvite.by} invited you on stage`}</p>
              <p className="text-sm text-zinc-400 mt-0.5">{stageInvite.ended ? 'Everyone can talk now. Turn on your microphone when you’re ready.' : 'Everyone will hear you, and see you if your camera is on.'}</p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => void goOnStage()} className="flex-1 h-10 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-sm font-semibold">{stageInvite.ended ? 'Turn on microphone' : 'Join the stage'}</button>
                <button type="button" onClick={() => setStageInvite(null)} className="h-10 px-4 rounded-full bg-white/10 hover:bg-white/15 text-sm font-semibold">Not now</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {audioOnly && phase === 'live' && (() => {
            const now = info?.sfu ? sfuQuality : list.some((r) => r.quality === 'poor') ? 'poor' : list.some((r) => r.quality === 'fair') ? 'fair' : list.some((r) => r.quality === 'good') ? 'good' : null;
            return (
              <motion.div key="audio-only" role="status" initial={{ opacity: 0, y: -14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -14, scale: 0.96 }} transition={spring.smooth}
                className="pointer-events-auto w-full max-w-lg rounded-2xl bg-[#1b1a2e]/90 border border-amber-400/30 backdrop-blur-xl shadow-2xl px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <Signal className={cn('w-4 h-4 shrink-0', now === 'good' ? 'text-emerald-300' : 'text-amber-300')} />
                <p className="text-sm flex-1 min-w-[12rem]">
                  <span className="font-semibold">{now === 'good' ? 'Your connection looks better.' : 'Weak connection.'}</span>{' '}
                  <span className="text-zinc-300">Video is paused so you can keep talking; shared screens stay on.</span>
                </p>
                <div className="flex gap-2">
                  {camera && <button type="button" onClick={() => void toggleCamera()} className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors">Turn my camera off</button>}
                  <button type="button" onClick={() => { haptic('tap'); setLowData(false); }} className="px-3 py-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-xs font-semibold">Resume video</button>
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </div>

      {ccPick && (
        <div className="fixed inset-x-0 bottom-32 z-[320] flex justify-center pointer-events-none">
          <div className="relative w-64 pointer-events-auto">
            <LanguagePicker title="Read captions in" placement="above" align="left" value={ccLang} offLabel="As spoken (no translation)" suggested={[appLanguage]}
              onPick={(l) => { setCcChoice(l); try { localStorage.setItem(CC_LANG_KEY, l ?? 'spoken'); } catch { /* private mode */ } setCcPick(false); }}
              onClose={() => setCcPick(false)} />
          </div>
        </div>
      )}
      {/* Live captions */}
      <div className="pointer-events-none px-4 flex justify-center" aria-live="polite">
        <div className="w-full max-w-3xl flex flex-col items-center gap-1.5">
          <AnimatePresence initial={false}>
            {cc && lines.map(([id, c]) => {
              const tr = c.final && c.id && ccLang && c.lang && c.lang !== ccLang ? trs[c.id] : undefined;
              return (
                <motion.p key={id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring.smooth} className="max-w-full rounded-2xl bg-black/65 backdrop-blur-md px-4 py-2 text-[15px] leading-snug text-center shadow-lg">
                  <span className="font-semibold text-indigo-300 mr-1.5">{c.name}</span>
                  <span className={cn(!c.final && 'text-zinc-200')}>{tr ?? c.text}</span>
                  {tr && <Languages className="inline w-3.5 h-3.5 ml-1.5 -mt-0.5 text-fuchsia-300/80" aria-label={`Translated from ${languageName(c.lang!)}`} />}
                </motion.p>
              );
            })}
          </AnimatePresence>
          {phase === 'live' && isClassCall && !canModerate && <PulseButtons value={myPulse} onPick={tapPulse} />}
        </div>
      </div>

      <motion.footer initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...spring.smooth, delay: 0.05 }} className="px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3 flex items-center justify-center">
        <div className="flex items-center gap-2 sm:gap-3 rounded-full bg-white/[0.06] backdrop-blur-xl border border-white/10 px-3 py-2.5 shadow-2xl max-w-full overflow-x-auto">
          {phase !== 'error' && phase !== 'ended' && (
            <>
              {audienceMe ? (
                <span className="shrink-0 inline-flex items-center gap-1.5 px-3 h-11 rounded-full bg-white/10 text-xs font-semibold text-zinc-200" title="You’re watching this webinar. Raise your hand to ask to speak."><Presentation className="w-4 h-4 text-fuchsia-300" />Watching</span>
              ) : (
                <>
                  <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute'} className={cn(btn, 'shrink-0', muted ? 'bg-white text-zinc-900' : 'bg-white/10 hover:bg-white/20')}>{muted ? <MicOff /> : <Mic />}</motion.button>
                  <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={() => void toggleCamera()} aria-pressed={camera} disabled={cameraBusy}
                    aria-label={camera ? 'Turn camera off' : 'Turn camera on'} title={camera ? 'Turn camera off' : kind === 'audio' ? 'Switch to video' : 'Turn camera on'}
                    className={cn(btn, 'shrink-0', camera ? 'bg-gradient-to-br from-indigo-500 to-fuchsia-500' : 'bg-white/10 hover:bg-white/20')}>
                    {cameraBusy ? <Loader2 className="animate-spin" /> : camera ? <Video /> : <VideoOff />}
                  </motion.button>
                </>
              )}
              {phase !== 'live' && <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={() => void openSettings()} aria-expanded={settingsOpen} aria-label="Microphone, camera and noise suppression" title="Microphone, camera and noise suppression" className={cn(btn, 'shrink-0', settingsOpen ? 'bg-white text-zinc-900' : 'bg-white/10 hover:bg-white/20')}><SlidersHorizontal /></motion.button>}
              {phase === 'live' && (
                <>
                  {canShare && !audienceMe && <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={toggleShare} aria-pressed={sharing} aria-label={sharing ? 'Stop sharing' : 'Share screen'} title={sharing ? 'Stop sharing' : 'Share your screen'} className={cn(btn, 'shrink-0', sharing ? 'bg-gradient-to-br from-indigo-500 to-fuchsia-500' : 'bg-white/10 hover:bg-white/20')}><MonitorUp /></motion.button>}
                  <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={toggleHand} aria-pressed={!!myHand} aria-label={myHand ? 'Lower your hand' : audienceMe ? 'Raise your hand to ask to speak' : 'Raise your hand'} title={myHand ? 'Lower your hand' : audienceMe ? 'Raise your hand to ask to speak' : 'Raise your hand'}
                    className={cn(btn, 'shrink-0', !audienceMe && 'hidden sm:flex', myHand ? 'bg-amber-400 text-amber-950 hover:bg-amber-300' : 'bg-white/10 hover:bg-white/20')}><Hand /></motion.button>
                  <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={() => { haptic('tap'); setMoreOpen(false); setReactOpen((o) => !o); }} aria-expanded={reactOpen} aria-label="Reactions and raise hand" title="Reactions"
                    className={cn(btn, 'shrink-0 relative', reactOpen ? 'bg-white text-zinc-900' : 'bg-white/10 hover:bg-white/20')}>
                    <Smile />
                    {myHand && <span className="sm:hidden absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-amber-400 text-[11px] flex items-center justify-center" aria-hidden>✋</span>}
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={() => openPanel(chatOpen ? null : 'chat')} aria-expanded={chatOpen} aria-label={unread ? `Chat, ${unread} new` : 'Chat'} title="Chat"
                    className={cn(btn, 'shrink-0 relative', chatOpen ? 'bg-white text-zinc-900' : 'bg-white/10 hover:bg-white/20')}>
                    <MessageSquare />
                    <AnimatePresence>
                      {unread > 0 && (
                        <motion.span key={unread} initial={{ scale: 0.4 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={spring.snappy} className="absolute top-0.5 right-0.5 min-w-5 h-5 px-1 rounded-full bg-fuchsia-500 text-white text-[11px] font-bold flex items-center justify-center" aria-hidden>{unread > 9 ? '9+' : unread}</motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={() => { haptic('tap'); setReactOpen(false); setMoreOpen((o) => !o); }} aria-expanded={moreOpen} aria-label="More options" title="More"
                    className={cn(btn, 'shrink-0 relative', moreOpen ? 'bg-white text-zinc-900' : 'bg-white/10 hover:bg-white/20')}>
                    <MoreHorizontal />
                    {(cc || recording || notes) && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-fuchsia-400" aria-hidden />}
                  </motion.button>
                </>
              )}
            </>
          )}
          <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={() => finish()} aria-label="Leave call" className={cn(btn, 'shrink-0 bg-rose-600 hover:bg-rose-500')}><PhoneOff /></motion.button>
        </div>
      </motion.footer>
      <FloatingReactions items={floats} />
      <BackgroundSheet open={bgOpen && (phase === 'live' || phase === 'prejoin' || phase === 'lobby')} onClose={() => setBgOpen(false)} value={bgChoice} onPick={(b) => void pickBackground(b)} busy={bgBusy} custom={bgCustom} onUpload={(f) => void uploadBackground(f)} />
      <ReactionBar open={reactOpen && phase === 'live'} onClose={() => setReactOpen(false)} onReact={react} hand={!!myHand} onHand={toggleHand} />
      <AnimatePresence>
        {moreOpen && phase === 'live' && (
          <>
            <motion.div key="more-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMoreOpen(false)} className="absolute inset-0 z-30" aria-hidden />
            <div key="more" className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] z-40 px-3 flex justify-center pointer-events-none">
              <motion.div role="dialog" aria-label="More call options" initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.96 }} transition={spring.smooth}
                className="pointer-events-auto w-full max-w-sm rounded-3xl bg-[#121830]/95 backdrop-blur-2xl border border-white/10 shadow-2xl p-2 grid grid-cols-3 gap-1">
                {moreItems.map((it, i) => (
                  <motion.div key={it.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.snappy, delay: i * 0.02 }}>
                    <button type="button" onClick={() => runMore(it.key)} aria-pressed={it.on}
                      className={cn('w-full h-full flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-xs font-medium text-center transition-colors active:scale-95', it.on ? 'bg-gradient-to-br from-indigo-500/40 to-fuchsia-500/40 text-white' : 'text-zinc-200 hover:bg-white/[0.08]')}>
                      <it.icon className={cn('w-5 h-5', it.tone)} />{it.label}
                    </button>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
      <CallChatPanel open={chatOpen && phase === 'live'} onClose={() => openPanel(null)} lines={chat.lines} onSend={chat.send} linked={chat.linked} title={info?.title ?? 'the chat'} />
      <BreakoutPanel open={boOpen && phase === 'live' && canModerate} onClose={() => setBoOpen(false)} bo={bo} room={roomN}
        people={list.map((r) => ({ id: r.peer.peerId, name: r.peer.name, host: r.peer.host || r.peer.cohost }))}
        onSend={(m) => send({ type: 'control', ...m })} onJoin={(n) => goRoom(n === null ? callId : roomId(callId, n))} />
      <AnimatePresence>
        {phase === 'live' && poll && (
          <PollCard key={poll.id} poll={poll} mod={canModerate} onVote={(n) => send({ type: 'vote', id: poll.id, n })} onSend={(m) => send({ type: 'control', ...m })} />
        )}
      </AnimatePresence>
      <WatchPicker open={watchPick && phase === 'live'} callId={room} onClose={() => setWatchPick(false)} onStart={(src) => send({ type: 'watch', op: 'start', src })} />
      <PollComposer open={pollCompose && phase === 'live' && canModerate} onClose={() => setPollCompose(false)} onStart={(m) => send({ type: 'control', ...m })} questionsFor={info?.type === 'class' ? room : null} />
      <RoomPicker open={pickOpen && phase === 'live'} onClose={() => setPickOpen(false)} bo={bo} onPick={(n) => send({ type: 'bo-pick', n })} />
      {pipWin && createPortal(
        <PipCall title={info?.title ?? 'Call'} clock={clock(seconds)} muted={muted} camera={camera} hand={!!myHand} watching={audienceMe}
          tiles={[
            ...list.filter((r) => r.sharing && r.screen).slice(0, 1).map((r): PipTile => ({ id: `${r.peer.peerId}-screen`, name: r.peer.name, stream: r.screen, video: true, muted: r.muted, screen: true })),
            ...[...list].sort((a, b) => Number(b.camera) - Number(a.camera)).slice(0, 3).map((r): PipTile => ({ id: r.peer.peerId, name: r.peer.name, stream: r.stream, video: r.camera && !r.paused && !!r.stream?.getVideoTracks().length, muted: r.muted })),
            ...(audienceMe ? [] : [{ id: 'me', name: myName, stream: local, video: camera, muted, me: true } satisfies PipTile]),
          ]}
          onMute={toggleMute} onCamera={() => void toggleCamera()} onHand={toggleHand}
          onBack={() => { pipWin.close(); window.focus(); }} onLeave={() => { pipWin.close(); finish(); }} />,
        pipWin.document.body,
      )}
      <WebinarQA open={qaOpen && phase === 'live' && !!webinar} onClose={() => setQaOpen(false)} items={qa} canModerate={canModerate}
        onAsk={(text, anon) => send({ type: 'qa-ask', text, anon })} onVote={(id, up) => send({ type: 'qa-vote', id, up })}
        onAnswer={(id, on) => control('qa-answer', id, on)} onHide={(id) => control('qa-hide', id)} />
      <PeoplePanel open={peopleOpen && phase === 'live'} onClose={() => setPeopleOpen(false)} people={people} canModerate={canModerate} isHost={meHost} spotlight={spotlight} onControl={control} onLowerMyHand={toggleHand} lobby={lobby} lobbyOn={lobbyOn} />
      {/* Microphone, camera and noise suppression */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div key="settings" initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.98 }} transition={spring.smooth}
            role="dialog" aria-label="Call settings"
            className="absolute inset-x-3 sm:inset-x-auto sm:right-6 bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] sm:w-96 max-h-[60vh] overflow-y-auto rounded-3xl bg-[#121830]/95 backdrop-blur-2xl border border-white/10 shadow-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Sound and video</p>
              <button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close" className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-fuchsia-300" /> Noise suppression</p>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-white/[0.06]">
                {([['strong', 'Strong'], ['standard', 'Standard'], ['off', 'Off']] as const).map(([m, label]) => (
                  <button key={m} type="button" onClick={() => pickNoise(m)} aria-pressed={noise === m} className={cn('relative isolate py-2 rounded-xl text-sm font-semibold transition-colors', noise === m ? 'text-white' : 'text-zinc-400 hover:text-white')}>
                    {noise === m && <motion.span layoutId="noise-pill" transition={spring.snappy} className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500" />}
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-400">{noise === 'strong' ? 'AI removes background noise (fans, typing, traffic, voices far away) on this device, and silences the gaps between your words.' : noise === 'standard' ? 'Your browser’s own noise reduction.' : 'Your microphone as it is (for music).'}</p>
            </section>
            {devices.mics.length > 0 && (
              <section className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Microphone</p>
                {devices.mics.map((d) => (
                  <button key={d.id} type="button" onClick={() => pickMic(d.id)} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-left hover:bg-white/[0.06]">
                    <span className="flex-1 truncate">{d.label}</span>{micId === d.id && <Check className="w-4 h-4 text-emerald-400" />}
                  </button>
                ))}
              </section>
            )}
            {devices.cams.length > 0 && (
              <section className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Camera</p>
                {devices.cams.map((d) => (
                  <button key={d.id} type="button" onClick={() => void pickCam(d.id)} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-left hover:bg-white/[0.06]">
                    <span className="flex-1 truncate">{d.label}</span>{(local?.getVideoTracks()[0]?.getSettings().deviceId ?? chosenDevice('cam')) === d.id && <Check className="w-4 h-4 text-emerald-400" />}
                  </button>
                ))}
              </section>
            )}
            <p className="text-[11px] text-zinc-500">An iPhone or iPad near this computer is only used if you pick it here, so the phone stays free for its own calls.</p>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Voicemail: nobody answered, leave a voice message instead. */}
      <AnimatePresence>
        {voicemail && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={spring.smooth} className="absolute inset-x-0 bottom-0 p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] bg-[#121830]/95 backdrop-blur-xl border-t border-white/10 flex flex-col items-center gap-3 text-center">
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

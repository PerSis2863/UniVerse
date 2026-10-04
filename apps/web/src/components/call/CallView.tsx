'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Link2, Maximize2, Mic, MicOff, Minimize2, MonitorUp, PhoneOff, PictureInPicture2, RefreshCcw, Signal, Video, VideoOff } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { ringback } from '@/lib/call-sounds';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// A UniVerse call (src/server/calls.ts). Each person connects straight to each other person
// (WebRTC); the call's room (cloudflare/worker.ts CallRoom) only passes connection details.
// Whoever joins sends offers to everyone already there, so two people never offer at once.

interface Ticket { kind: 'audio' | 'video'; type: 'chat' | 'group' | 'class'; title: string; oneToOne: boolean; conversationId: string | null; path: string; iceServers: RTCIceServer[] }
interface Peer { peerId: string; userId: string; name: string }
type Quality = 'good' | 'fair' | 'poor' | null;
interface Remote { peer: Peer; stream: MediaStream | null; muted: boolean; camera: boolean; sharing: boolean; state: RTCPeerConnectionState | 'new'; quality: Quality }
type Phase = 'starting' | 'live' | 'ended' | 'error';
type Info = Omit<Ticket, 'path' | 'iceServers'>;

const NO_ANSWER_MS = 45_000;

/** How loud a stream is right now (0–1), sampled a few times a second, for the speaking ring. */
function useLevel(stream: MediaStream | null) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream || !stream.getAudioTracks().length) return;
    let ctx: AudioContext;
    try { ctx = new AudioContext(); } catch { return; }
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 256;
    src.connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);
    const t = setInterval(() => {
      an.getByteFrequencyData(buf);
      let sum = 0;
      for (const v of buf) sum += v;
      setLevel(Math.min(1, sum / buf.length / 60));
    }, 180);
    return () => { clearInterval(t); void ctx.close(); };
  }, [stream]);
  return level;
}

function initials(name: string) {
  return name.split(/\s+/).map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
}

const QUALITY: Record<Exclude<Quality, null>, { label: string; className: string }> = {
  good: { label: 'Good connection', className: 'text-emerald-400' },
  fair: { label: 'Fair connection', className: 'text-amber-400' },
  poor: { label: 'Weak connection', className: 'text-rose-400' },
};

function Tile({ name, stream, mirrored, muted, camera, me, quality, state, videoRef }: {
  name: string; stream: MediaStream | null; mirrored?: boolean; muted?: boolean; camera: boolean; me?: boolean; quality?: Quality; state?: string; videoRef?: (v: HTMLVideoElement | null) => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const level = useLevel(muted ? null : stream);
  useEffect(() => { if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream; }, [stream]);
  const hasVideo = camera && !!stream?.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled);
  const speaking = level > 0.12;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={spring.smooth}
      className={cn('relative rounded-3xl overflow-hidden bg-zinc-900/80 aspect-video flex items-center justify-center ring-2 transition-shadow duration-200', speaking ? 'ring-emerald-400/90 shadow-[0_0_40px_-8px_rgba(52,211,153,0.6)]' : 'ring-transparent')}
    >
      {/* Remote audio plays through this element too, so it stays even with the camera off. */}
      <video ref={(v) => { ref.current = v; videoRef?.(v); }} autoPlay playsInline muted={me} className={cn('w-full h-full object-cover transition-opacity duration-300', !hasVideo && 'opacity-0 absolute', mirrored && '-scale-x-100')} />
      {!hasVideo && (
        <motion.div animate={{ scale: speaking ? 1.08 : 1 }} transition={spring.snappy} className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-white text-3xl font-bold shadow-xl shadow-fuchsia-500/20">
          {initials(name)}
        </motion.div>
      )}
      <span className="absolute bottom-3 left-3 text-xs font-medium text-white bg-black/45 backdrop-blur-md rounded-full px-3 py-1 flex items-center gap-1.5">
        {muted && <MicOff className="w-3 h-3" />}{me ? `${name} (you)` : name}
      </span>
      {quality && !me && (
        <span className={cn('absolute top-3 right-3 bg-black/45 backdrop-blur-md rounded-full p-1.5', QUALITY[quality].className)} title={QUALITY[quality].label} aria-label={QUALITY[quality].label}><Signal className="w-3.5 h-3.5" /></span>
      )}
      {state && state !== 'connected' && state !== 'new' && (
        <span className="absolute top-3 left-3 text-[11px] text-white bg-black/55 backdrop-blur-md rounded-full px-2.5 py-1">{state === 'connecting' ? 'Connecting…' : state === 'failed' || state === 'disconnected' ? 'Reconnecting…' : state}</span>
      )}
    </motion.div>
  );
}

export function CallView({ callId, myName, wantKind, onLeave }: { callId: string; myName: string; wantKind?: 'audio' | 'video'; onLeave: (conversationId: string | null) => void }) {
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

  const ws = useRef<WebSocket | null>(null);
  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const localRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStreamTrack | null>(null);
  const ice = useRef<RTCIceServer[]>([]);
  const stateRef = useRef({ muted: false, camera: true, sharing: false });
  const ended = useRef(false);
  const everJoined = useRef(false);
  const talkStart = useRef<number | null>(null);
  const infoRef = useRef<Info | null>(null);
  const firstRemoteVideo = useRef<HTMLVideoElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const send = (msg: unknown) => { if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg)); };
  const patch = (peerId: string, p: Partial<Remote>) => setRemotes((r) => (r[peerId] ? { ...r, [peerId]: { ...r[peerId], ...p } } : r));
  const announce = () => send({ type: 'state', ...stateRef.current });

  const connectTo = useCallback((peer: Peer) => {
    const pc = new RTCPeerConnection({ iceServers: ice.current });
    pcs.current.set(peer.peerId, pc);
    setRemotes((r) => ({ ...r, [peer.peerId]: r[peer.peerId] ?? { peer, stream: null, muted: false, camera: true, sharing: false, state: 'new', quality: null } }));
    for (const track of localRef.current?.getTracks() ?? []) pc.addTrack(track, localRef.current!);
    if (screenRef.current) void pc.getTransceivers().find((t) => t.receiver.track.kind === 'video')?.sender.replaceTrack(screenRef.current);
    pc.onicecandidate = (e) => { if (e.candidate) send({ type: 'signal', to: peer.peerId, data: { candidate: e.candidate } }); };
    pc.ontrack = (e) => patch(peer.peerId, { stream: e.streams[0] ?? new MediaStream([e.track]) });
    pc.onconnectionstatechange = () => {
      patch(peer.peerId, { state: pc.connectionState });
      if (pc.connectionState === 'connected') {
        everJoined.current = true;
        talkStart.current ??= Date.now();
        setTalked(true);
      }
      if (pc.connectionState === 'failed') pc.restartIce();
    };
    return pc;
  }, []);

  /** Leaves the call. The last one out of a chat call records how it went (shown on the call in the chat). */
  const finish = useCallback((why?: string) => {
    if (ended.current) return;
    ended.current = true;
    if (why) setNotice(why);
    const alone = pcs.current.size === 0 || [...pcs.current.values()].every((pc) => pc.connectionState !== 'connected');
    ws.current?.close(1000);
    for (const pc of pcs.current.values()) pc.close();
    pcs.current.clear();
    localRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current?.stop();
    const i = infoRef.current;
    if (alone && i?.type === 'chat') {
      const durationSec = talkStart.current ? Math.round((Date.now() - talkStart.current) / 1000) : 0;
      void authedJson(`/api/calls/${callId}/end`, { method: 'POST', body: JSON.stringify({ durationSec, answered: everJoined.current }), keepalive: true }).catch(() => {});
    }
    setPhase('ended');
    setTimeout(() => onLeave(i?.conversationId ?? null), why ? 1400 : 250);
  }, [callId, onLeave]);

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
      infoRef.current = { kind: t.kind, type: t.type, title: t.title, oneToOne: t.oneToOne, conversationId: t.conversationId };
      setInfo(infoRef.current);
      if (!localRef.current) {
        try {
          localRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: t.kind === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false });
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
          for (const p of msg.peers as Peer[]) {
            known.set(p.peerId, p);
            const pc = connectTo(p);
            await pc.setLocalDescription(await pc.createOffer());
            send({ type: 'signal', to: p.peerId, data: { sdp: pc.localDescription } });
          }
          announce();
        } else if (msg.type === 'joined') {
          known.set(msg.peer.peerId, msg.peer);
          setRemotes((r) => ({ ...r, [msg.peer.peerId]: r[msg.peer.peerId] ?? { peer: msg.peer, stream: null, muted: false, camera: true, sharing: false, state: 'new', quality: null } }));
          announce();
        } else if (msg.type === 'signal') {
          await onSignal(msg.from, msg.data).catch((e) => console.warn('call signal failed', e));
        } else if (msg.type === 'state') {
          patch(msg.from, { muted: msg.muted, camera: msg.camera, sharing: msg.sharing });
        } else if (msg.type === 'left') {
          pcs.current.get(msg.peerId)?.close();
          pcs.current.delete(msg.peerId);
          setRemotes((r) => Object.fromEntries(Object.entries(r).filter(([id]) => id !== msg.peerId)));
        } else if (msg.type === 'declined') {
          toast(`${msg.name || 'They'} declined the call`);
          if (t.oneToOne && pcs.current.size === 0) finish('Declined');
        }
      };
      sock.onclose = () => {
        if (ws.current === sock) ws.current = null;
        // Calls already connected keep going browser to browser; reconnect so new people can join.
        if (!cancelled && !ended.current && retry < 6) setTimeout(open, Math.min(15_000, 1000 * 2 ** retry++));
      };
    };
    void open();

    return () => {
      cancelled = true;
      ws.current?.close(1000);
      for (const pc of conns.values()) pc.close();
      conns.clear();
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
    const q = setInterval(async () => {
      for (const [id, pc] of pcs.current) {
        if (pc.connectionState !== 'connected') continue;
        const stats = await pc.getStats().catch(() => null);
        let rtt: number | null = null, lost = 0, got = 0;
        stats?.forEach((s) => {
          if (s.type === 'candidate-pair' && s.state === 'succeeded' && typeof s.currentRoundTripTime === 'number') rtt = s.currentRoundTripTime;
          if (s.type === 'inbound-rtp') { lost += s.packetsLost ?? 0; got += s.packetsReceived ?? 0; }
        });
        const loss = got ? lost / (lost + got) : 0;
        const quality: Quality = rtt === null ? null : rtt > 0.4 || loss > 0.08 ? 'poor' : rtt > 0.2 || loss > 0.03 ? 'fair' : 'good';
        patch(id, { quality });
      }
    }, 4000);
    return () => { clearInterval(t); clearInterval(q); };
  }, [phase]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleMute = () => {
    const next = !muted;
    localRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setMuted(next);
    stateRef.current.muted = next;
    announce();
  };

  const toggleCamera = () => {
    const next = !camera;
    localRef.current?.getVideoTracks().forEach((t) => { t.enabled = next; });
    setCamera(next);
    stateRef.current.camera = next;
    announce();
  };

  const replaceVideo = async (track: MediaStreamTrack | null) => {
    for (const pc of pcs.current.values()) {
      const sender = pc.getTransceivers().find((t) => t.receiver.track.kind === 'video')?.sender;
      await sender?.replaceTrack(track).catch(() => {});
    }
  };

  const flipCamera = async () => {
    const current = localRef.current?.getVideoTracks()[0];
    const facing = current?.getSettings().facingMode === 'environment' ? 'user' : 'environment';
    try {
      const fresh = (await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } })).getVideoTracks()[0];
      await replaceVideo(fresh);
      if (current) { localRef.current!.removeTrack(current); current.stop(); }
      localRef.current!.addTrack(fresh);
      setLocal(new MediaStream(localRef.current!.getTracks()));
    } catch { /* only one camera */ }
  };

  const stopShare = async () => {
    screenRef.current?.stop();
    screenRef.current = null;
    await replaceVideo(localRef.current?.getVideoTracks()[0] ?? null);
    setSharing(false);
    stateRef.current.sharing = false;
    announce();
  };
  const toggleShare = async () => {
    if (sharing) return stopShare();
    try {
      const track = (await navigator.mediaDevices.getDisplayMedia({ video: true })).getVideoTracks()[0];
      screenRef.current = track;
      await replaceVideo(track);
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

  const kind = info?.kind ?? wantKind ?? 'audio';
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const canShare = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && kind === 'video';
  const canPip = typeof document !== 'undefined' && document.pictureInPictureEnabled && kind === 'video' && list.length > 0;
  const btn = 'w-14 h-14 rounded-full flex items-center justify-center transition-colors';
  const status = phase === 'starting' ? 'Connecting…' : phase === 'error' ? 'Couldn’t join' : phase === 'ended' ? notice ?? 'Call ended' : waiting ? (info?.type === 'chat' && !talked ? 'Ringing…' : 'Waiting for others to join…') : `${kind === 'video' ? 'Video' : 'Voice'} call · ${time}`;
  const firstRemoteId = list[0]?.peer.peerId;

  return (
    <motion.div ref={rootRef} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="fixed inset-0 z-[300] text-white flex flex-col bg-[radial-gradient(ellipse_at_top,#1e1b4b_0%,#0b0e1a_55%)]">
      <motion.header initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={spring.smooth} className="px-5 pt-[calc(env(safe-area-inset-top)+0.9rem)] pb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold truncate text-lg">{info?.title ?? 'Call'}</p>
          <AnimatePresence mode="wait">
            <motion.p key={status.replace(/\d/g, '')} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }} className={cn('text-sm', phase === 'ended' && notice ? 'text-rose-300' : 'text-zinc-400')} role="status">{status}</motion.p>
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-1">
          {info && info.type !== 'chat' && <button type="button" onClick={copyInvite} aria-label="Copy call link" title="Copy call link" className="p-2.5 rounded-full hover:bg-white/10"><Link2 className="w-5 h-5" /></button>}
          <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} className="p-2.5 rounded-full hover:bg-white/10 hidden sm:block">{fullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}</button>
          <span className="text-xs text-zinc-400 ml-1">{list.length + 1} in call</span>
        </div>
      </motion.header>

      {phase === 'error' ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-zinc-300 max-w-sm">{error}</p>
          <button type="button" onClick={() => onLeave(info?.conversationId ?? null)} className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-sm font-semibold">Back</button>
        </motion.div>
      ) : (
        <main className={cn('flex-1 overflow-y-auto p-4 grid gap-4 content-center', list.length === 0 ? 'grid-cols-1 max-w-3xl w-full mx-auto' : list.length === 1 ? 'grid-cols-1 sm:grid-cols-2 max-w-6xl w-full mx-auto' : 'grid-cols-2 lg:grid-cols-3')}>
          <AnimatePresence initial={false}>
            <Tile key="me" name={myName} stream={local} mirrored={!sharing} muted={muted} camera={kind === 'video' && camera} me />
            {list.map((r) => (
              <Tile key={r.peer.peerId} name={r.peer.name} stream={r.stream} muted={r.muted} camera={kind === 'video' && (r.camera || r.sharing)} quality={r.quality} state={r.state}
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

      <motion.footer initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...spring.smooth, delay: 0.05 }} className="px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3 flex items-center justify-center">
        <div className="flex items-center gap-3 rounded-full bg-white/[0.06] backdrop-blur-xl border border-white/10 px-3 py-2.5 shadow-2xl">
          {phase !== 'error' && phase !== 'ended' && (
            <>
              <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute'} className={cn(btn, muted ? 'bg-white text-zinc-900' : 'bg-white/10 hover:bg-white/20')}>{muted ? <MicOff /> : <Mic />}</motion.button>
              {kind === 'video' && <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={toggleCamera} aria-pressed={!camera} aria-label={camera ? 'Turn camera off' : 'Turn camera on'} className={cn(btn, !camera ? 'bg-white text-zinc-900' : 'bg-white/10 hover:bg-white/20')}>{camera ? <Video /> : <VideoOff />}</motion.button>}
              {kind === 'video' && <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={flipCamera} aria-label="Switch camera" className={cn(btn, 'bg-white/10 hover:bg-white/20 sm:hidden')}><RefreshCcw /></motion.button>}
              {canShare && <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={toggleShare} aria-pressed={sharing} aria-label={sharing ? 'Stop sharing' : 'Share screen'} className={cn(btn, 'hidden sm:flex', sharing ? 'bg-indigo-500' : 'bg-white/10 hover:bg-white/20')}><MonitorUp /></motion.button>}
              {canPip && <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={pip} aria-label="Picture in picture" className={cn(btn, 'bg-white/10 hover:bg-white/20')}><PictureInPicture2 /></motion.button>}
            </>
          )}
          <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={() => finish()} aria-label="Leave call" className={cn(btn, 'bg-rose-600 hover:bg-rose-500')}><PhoneOff /></motion.button>
        </div>
      </motion.footer>
    </motion.div>
  );
}

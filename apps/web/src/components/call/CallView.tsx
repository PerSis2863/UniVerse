'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, MonitorUp, PhoneOff, RefreshCcw, Video, VideoOff } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { cn } from '@/lib/utils';

// A UniVerse call (src/server/calls.ts). Each person connects straight to each other person
// (WebRTC); the call's room (cloudflare/worker.ts CallRoom) only passes connection details.
// Whoever joins sends offers to everyone already there, so two people never offer at once.

interface Ticket { kind: 'audio' | 'video'; title: string; path: string; iceServers: RTCIceServer[] }
interface Peer { peerId: string; userId: string; name: string }
interface Remote { peer: Peer; stream: MediaStream | null; muted: boolean; camera: boolean; sharing: boolean; state: RTCPeerConnectionState | 'new' }
type Phase = 'starting' | 'live' | 'ended' | 'error';

function Tile({ name, stream, mirrored, muted, camera, me, speaking }: { name: string; stream: MediaStream | null; mirrored?: boolean; muted?: boolean; camera: boolean; me?: boolean; speaking?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream; }, [stream]);
  const hasVideo = camera && !!stream?.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled);
  return (
    <div className={cn('relative rounded-2xl overflow-hidden bg-zinc-900 aspect-video flex items-center justify-center', speaking && 'ring-2 ring-emerald-400')}>
      {/* Remote audio plays through this element too, so it stays even with the camera off. */}
      <video ref={ref} autoPlay playsInline muted={me} className={cn('w-full h-full object-cover', !hasVideo && 'opacity-0 absolute', mirrored && '-scale-x-100')} />
      {!hasVideo && (
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-white text-2xl font-bold">
          {name.split(/\s+/).map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
        </div>
      )}
      <span className="absolute bottom-2 left-2 text-xs font-medium text-white bg-black/50 rounded-lg px-2 py-1 flex items-center gap-1">
        {muted && <MicOff className="w-3 h-3" />}{me ? `${name} (you)` : name}
      </span>
    </div>
  );
}

export function CallView({ callId, myName, onLeave }: { callId: string; myName: string; onLeave: () => void }) {
  const [phase, setPhase] = useState<Phase>('starting');
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<'audio' | 'video'>('audio');
  const [title, setTitle] = useState('Call');
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [camera, setCamera] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [remotes, setRemotes] = useState<Record<string, Remote>>({});
  const [seconds, setSeconds] = useState(0);

  const ws = useRef<WebSocket | null>(null);
  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const localRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStreamTrack | null>(null);
  const ice = useRef<RTCIceServer[]>([]);
  const stateRef = useRef({ muted: false, camera: true, sharing: false });
  const ended = useRef(false);

  const send = (msg: unknown) => { if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg)); };
  const patch = (peerId: string, p: Partial<Remote>) => setRemotes((r) => (r[peerId] ? { ...r, [peerId]: { ...r[peerId], ...p } } : r));
  const announce = () => send({ type: 'state', ...stateRef.current });

  const connectTo = useCallback((peer: Peer) => {
    const pc = new RTCPeerConnection({ iceServers: ice.current });
    pcs.current.set(peer.peerId, pc);
    setRemotes((r) => ({ ...r, [peer.peerId]: r[peer.peerId] ?? { peer, stream: null, muted: false, camera: true, sharing: false, state: 'new' } }));
    for (const track of localRef.current?.getTracks() ?? []) pc.addTrack(track, localRef.current!);
    if (screenRef.current) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      void sender?.replaceTrack(screenRef.current);
    }
    pc.onicecandidate = (e) => { if (e.candidate) send({ type: 'signal', to: peer.peerId, data: { candidate: e.candidate } }); };
    pc.ontrack = (e) => patch(peer.peerId, { stream: e.streams[0] ?? new MediaStream([e.track]) });
    pc.onconnectionstatechange = () => {
      patch(peer.peerId, { state: pc.connectionState });
      if (pc.connectionState === 'failed') pc.restartIce();
    };
    return pc;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const conns = pcs.current;
    let retry = 0;

    const onSignal = async (from: string, data: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }, peer?: Peer) => {
      let pc = pcs.current.get(from);
      if (!pc && data.sdp?.type === 'offer') pc = connectTo(peer ?? { peerId: from, userId: '', name: 'Someone' });
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

    const known = new Map<string, Peer>();
    const open = async () => {
      if (cancelled || ended.current) return;
      let t: Ticket;
      try {
        t = await authedJson<Ticket>(`/api/calls/${callId}/ticket`, { method: 'POST' });
      } catch (e) {
        setError((e as Error).message || 'Couldn’t join the call.');
        setPhase('error');
        return;
      }
      ice.current = t.iceServers;
      setKind(t.kind);
      setTitle(t.title);
      if (!localRef.current) {
        try {
          localRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: t.kind === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false });
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
          setRemotes((r) => ({ ...r, [msg.peer.peerId]: r[msg.peer.peerId] ?? { peer: msg.peer, stream: null, muted: false, camera: true, sharing: false, state: 'new' } }));
          announce();
        } else if (msg.type === 'signal') {
          await onSignal(msg.from, msg.data, known.get(msg.from)).catch((e) => console.warn('call signal failed', e));
        } else if (msg.type === 'state') {
          patch(msg.from, { muted: msg.muted, camera: msg.camera, sharing: msg.sharing });
        } else if (msg.type === 'left') {
          pcs.current.get(msg.peerId)?.close();
          pcs.current.delete(msg.peerId);
          setRemotes((r) => Object.fromEntries(Object.entries(r).filter(([id]) => id !== msg.peerId)));
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

  useEffect(() => {
    if (phase !== 'live') return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

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

  const toggleShare = async () => {
    if (sharing) {
      screenRef.current?.stop();
      screenRef.current = null;
      await replaceVideo(localRef.current?.getVideoTracks()[0] ?? null);
      setSharing(false);
    } else {
      try {
        const track = (await navigator.mediaDevices.getDisplayMedia({ video: true })).getVideoTracks()[0];
        screenRef.current = track;
        await replaceVideo(track);
        track.onended = () => { void toggleShareOff(); };
        setSharing(true);
      } catch { return; /* cancelled */ }
    }
    stateRef.current.sharing = !sharing;
    announce();
  };
  const toggleShareOff = async () => {
    screenRef.current = null;
    await replaceVideo(localRef.current?.getVideoTracks()[0] ?? null);
    setSharing(false);
    stateRef.current.sharing = false;
    announce();
  };

  const leave = () => {
    ended.current = true;
    ws.current?.close(1000);
    for (const pc of pcs.current.values()) pc.close();
    pcs.current.clear();
    localRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current?.stop();
    setPhase('ended');
    onLeave();
  };

  const list = Object.values(remotes);
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const canShare = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && kind === 'video';
  const btn = 'w-14 h-14 rounded-full flex items-center justify-center transition-colors';

  return (
    <div className="fixed inset-0 z-[300] bg-[#0b0e1a] text-white flex flex-col">
      <header className="px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 flex items-center justify-between">
        <div className="min-w-0">
          <p className="font-semibold truncate">{title}</p>
          <p className="text-xs text-zinc-400" role="status">
            {phase === 'starting' ? 'Connecting…' : phase === 'error' ? 'Couldn’t join' : list.length === 0 ? 'Waiting for others to join…' : `${kind === 'video' ? 'Video' : 'Voice'} call · ${time}`}
          </p>
        </div>
        <span className="text-xs text-zinc-500">{list.length + 1} in call</span>
      </header>

      {phase === 'error' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-zinc-300 max-w-sm">{error}</p>
          <button type="button" onClick={onLeave} className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-sm font-semibold">Back</button>
        </div>
      ) : (
        <main className={cn('flex-1 overflow-y-auto p-3 grid gap-3 content-center', list.length === 0 ? 'grid-cols-1 max-w-3xl w-full mx-auto' : list.length === 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 lg:grid-cols-3')}>
          <Tile name={myName} stream={local} mirrored={!sharing} muted={muted} camera={kind === 'video' && camera} me />
          {list.map((r) => (
            <div key={r.peer.peerId} className="relative">
              <Tile name={r.peer.name} stream={r.stream} muted={r.muted} camera={kind === 'video' && (r.camera || r.sharing)} />
              {r.state !== 'connected' && r.state !== 'new' && <span className="absolute top-2 right-2 text-[11px] bg-black/60 rounded-lg px-2 py-0.5">{r.state === 'connecting' ? 'Connecting…' : r.state === 'failed' ? 'Connection lost, retrying…' : r.state}</span>}
            </div>
          ))}
        </main>
      )}

      <footer className="px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 flex items-center justify-center gap-3">
        {phase !== 'error' && (
          <>
            <button type="button" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute'} className={cn(btn, muted ? 'bg-white text-zinc-900' : 'bg-white/10 hover:bg-white/20')}>{muted ? <MicOff /> : <Mic />}</button>
            {kind === 'video' && <button type="button" onClick={toggleCamera} aria-pressed={!camera} aria-label={camera ? 'Turn camera off' : 'Turn camera on'} className={cn(btn, !camera ? 'bg-white text-zinc-900' : 'bg-white/10 hover:bg-white/20')}>{camera ? <Video /> : <VideoOff />}</button>}
            {kind === 'video' && <button type="button" onClick={flipCamera} aria-label="Switch camera" className={cn(btn, 'bg-white/10 hover:bg-white/20 sm:hidden')}><RefreshCcw /></button>}
            {canShare && <button type="button" onClick={toggleShare} aria-pressed={sharing} aria-label={sharing ? 'Stop sharing' : 'Share screen'} className={cn(btn, 'hidden sm:flex', sharing ? 'bg-indigo-500' : 'bg-white/10 hover:bg-white/20')}><MonitorUp /></button>}
          </>
        )}
        <button type="button" onClick={leave} aria-label="Leave call" className={cn(btn, 'bg-rose-600 hover:bg-rose-500')}><PhoneOff /></button>
      </footer>
    </div>
  );
}

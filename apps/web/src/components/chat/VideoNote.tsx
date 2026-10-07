'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Circle, RotateCcw, Send, Square, Volume2, X } from 'lucide-react';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Video notes (Stage 4 · 1.7): round videos of up to a minute, like Telegram's. Recorded here at a
// modest bitrate (a minute is a few MB), sent as a VIDEO message marked videoNote; in the chat they
// play silently in a circle, and a tap plays them with sound from the start.

const MAX_SEC = 60;

export function VideoNoteRecorder({ onSend, onClose }: { onSend: (file: File, durationSec: number) => Promise<void>; onClose: () => void }) {
  const preview = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const [phase, setPhase] = useState<'ready' | 'recording' | 'review' | 'sending'>('ready');
  const [secs, setSecs] = useState(0);
  const [result, setResult] = useState<{ url: string; file: File; secs: number } | null>(null);

  useEffect(() => {
    let alive = true;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } }, audio: { echoCancellation: true, noiseSuppression: true } })
      .then((s) => { if (!alive) { s.getTracks().forEach((t) => t.stop()); return; } stream.current = s; if (preview.current) { preview.current.srcObject = s; void preview.current.play().catch(() => {}); } })
      .catch(() => { toast.error('Allow the camera and microphone to record a video note.'); onClose(); });
    return () => { alive = false; if (rec.current?.state === 'recording') rec.current.stop(); stream.current?.getTracks().forEach((t) => t.stop()); };
  }, [onClose]);

  useEffect(() => {
    if (phase !== 'recording') return;
    const t = setInterval(() => {
      const s = (Date.now() - started.current) / 1000;
      setSecs(s);
      if (s >= MAX_SEC) rec.current?.stop();
    }, 100);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const start = () => {
    const s = stream.current;
    if (!s) return;
    const mime = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
    const r = new MediaRecorder(s, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 700_000, audioBitsPerSecond: 64_000 });
    chunks.current = [];
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      const type = (r.mimeType || 'video/webm').split(';')[0];
      const blob = new Blob(chunks.current, { type });
      const took = Math.min(MAX_SEC, Math.max(1, Math.round((Date.now() - started.current) / 1000)));
      const file = new File([blob], `video-note-${Date.now()}.${type.includes('mp4') ? 'mp4' : 'webm'}`, { type });
      setResult({ url: URL.createObjectURL(blob), file, secs: took });
      setPhase('review');
    };
    started.current = Date.now();
    setSecs(0);
    r.start(250);
    rec.current = r;
    setPhase('recording');
  };
  const send = async () => {
    if (!result) return;
    setPhase('sending');
    try { await onSend(result.file, result.secs); onClose(); } catch { setPhase('review'); }
  };

  const ring = 2 * Math.PI * 118;
  const done = phase === 'recording' ? Math.min(1, secs / MAX_SEC) : 0;
  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[95] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center gap-6 p-6" role="dialog" aria-label="Record a video note">
      <button type="button" onClick={onClose} aria-label="Cancel" className="absolute top-[calc(env(safe-area-inset-top)+1rem)] right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center"><X className="w-5 h-5" /></button>
      <motion.div initial={{ scale: 0.85 }} animate={{ scale: 1 }} transition={spring.smooth} className="relative w-64 h-64">
        <svg className="absolute -inset-3 w-[17.5rem] h-[17.5rem] -rotate-90" viewBox="0 0 248 248" aria-hidden>
          <circle cx="124" cy="124" r="118" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="6" />
          <circle cx="124" cy="124" r="118" fill="none" stroke="url(#vn)" strokeWidth="6" strokeLinecap="round" strokeDasharray={ring} strokeDashoffset={ring * (1 - done)} />
          <defs><linearGradient id="vn" x1="0" x2="1"><stop offset="0" stopColor="#6366f1" /><stop offset="1" stopColor="#d946ef" /></linearGradient></defs>
        </svg>
        <video ref={preview} muted playsInline className={cn('absolute inset-0 w-full h-full rounded-full object-cover -scale-x-100 bg-zinc-900', phase === 'review' || phase === 'sending' ? 'hidden' : '')} />
        {result && (phase === 'review' || phase === 'sending') && <video src={result.url} autoPlay loop playsInline className="absolute inset-0 w-full h-full rounded-full object-cover -scale-x-100 bg-zinc-900" />}
      </motion.div>
      <p className="text-white/80 text-sm tabular-nums h-5">{phase === 'recording' ? `${Math.floor(secs)}s of ${MAX_SEC}s` : phase === 'ready' ? 'Up to a minute' : `${result?.secs ?? 0}s`}</p>
      <div className="flex items-center gap-4">
        {phase === 'ready' && <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={start} aria-label="Start recording" className="w-16 h-16 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-xl"><Circle className="w-7 h-7 fill-current" /></motion.button>}
        {phase === 'recording' && <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={() => rec.current?.stop()} aria-label="Stop" className="w-16 h-16 rounded-full bg-white text-rose-600 flex items-center justify-center shadow-xl"><Square className="w-6 h-6 fill-current" /></motion.button>}
        {(phase === 'review' || phase === 'sending') && (
          <>
            <button type="button" disabled={phase === 'sending'} onClick={() => { setResult(null); setPhase('ready'); }} className="px-5 py-3 rounded-full bg-white/10 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"><RotateCcw className="w-4 h-4" />Retake</button>
            <button type="button" disabled={phase === 'sending'} onClick={() => void send()} className="px-6 py-3 rounded-full bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"><Send className="w-4 h-4" />{phase === 'sending' ? 'Sending…' : 'Send'}</button>
          </>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}

/** A video note in the chat: a silent loop in a circle; tap for sound from the start, tap again to pause. */
export function VideoNoteBubble({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [sound, setSound] = useState(false);
  const [progress, setProgress] = useState(0);
  const tap = () => {
    const v = ref.current;
    if (!v) return;
    if (!sound) { v.muted = false; v.loop = false; v.currentTime = 0; void v.play().catch(() => {}); setSound(true); }
    else if (v.paused) void v.play().catch(() => {});
    else v.pause();
  };
  const ring = 2 * Math.PI * 94;
  return (
    <button type="button" onClick={tap} aria-label={sound ? 'Pause video note' : 'Play video note with sound'} className="relative block w-48 h-48 m-1">
      <video ref={ref} src={url} autoPlay muted loop playsInline preload="metadata"
        onTimeUpdate={(e) => sound && setProgress(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
        onEnded={(e) => { const v = e.currentTarget; v.muted = true; v.loop = true; setSound(false); setProgress(0); void v.play().catch(() => {}); }}
        className="w-full h-full rounded-full object-cover bg-black" />
      <AnimatePresence>
        {sound && (
          <motion.svg key="ring" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute -inset-1 w-[12.5rem] h-[12.5rem] -rotate-90 pointer-events-none" viewBox="0 0 200 200" aria-hidden>
            <circle cx="100" cy="100" r="94" fill="none" stroke="white" strokeOpacity="0.9" strokeWidth="4" strokeLinecap="round" strokeDasharray={ring} strokeDashoffset={ring * (1 - progress)} />
          </motion.svg>
        )}
      </AnimatePresence>
      {!sound && <span className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 rounded-full p-1.5 text-white"><Volume2 className="w-3.5 h-3.5" /></span>}
    </button>
  );
}

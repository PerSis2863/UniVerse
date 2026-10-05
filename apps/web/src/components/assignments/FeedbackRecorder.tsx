'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { FileText, Loader2, Mic, Square, Trash2, Video } from 'lucide-react';
import { uploadChatFile } from '@/components/chat/chat-client';
import { authedJson } from '@/lib/authed-fetch';
import { spring } from '@/lib/motion';

// Feedback studio (upgrade 8): the teacher records voice or video feedback for one answer. It's
// uploaded like a chat voice note and the student plays it with their grade. Up to 5 minutes, at a
// bitrate that keeps it under the 25 MB upload limit.

const MAX_MS = 5 * 60_000;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function FeedbackRecorder({ submissionId, media, onChange }: {
  submissionId: string;
  media: { url: string | null; kind: string | null; transcript: string | null };
  onChange: () => void;
}) {
  const [rec, setRec] = useState<null | { kind: 'AUDIO' | 'VIDEO'; started: number }>(null);
  const [secs, setSecs] = useState(0);
  const [busy, setBusy] = useState<null | 'upload' | 'transcribe' | 'remove'>(null);
  const live = useRef<{ mr: MediaRecorder; stream: MediaStream; chunks: Blob[] } | null>(null);
  const preview = useRef<HTMLVideoElement>(null);

  const start = async (kind: 'AUDIO' | 'VIDEO') => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: kind === 'VIDEO' ? { width: { ideal: 640 }, height: { ideal: 360 } } : false });
      const types = kind === 'VIDEO' ? ['video/webm;codecs=vp8,opus', 'video/mp4', 'video/webm'] : ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
      const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t));
      const mr = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64_000, ...(kind === 'VIDEO' ? { videoBitsPerSecond: 500_000 } : {}) });
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.start(1000);
      live.current = { mr, stream, chunks };
      setSecs(0);
      setRec({ kind, started: Date.now() });
      if (kind === 'VIDEO') requestAnimationFrame(() => { if (preview.current) preview.current.srcObject = stream; });
    } catch {
      toast.error(kind === 'VIDEO' ? 'Allow the camera and microphone to record video feedback.' : 'Allow the microphone to record voice feedback.');
    }
  };

  const stop = async () => {
    const l = live.current;
    const kind = rec?.kind;
    if (!l || !kind) return;
    live.current = null;
    setRec(null);
    await new Promise<void>((resolve) => { l.mr.onstop = () => resolve(); l.mr.stop(); });
    l.stream.getTracks().forEach((t) => t.stop());
    const type = l.mr.mimeType || (kind === 'VIDEO' ? 'video/webm' : 'audio/webm');
    const blob = new Blob(l.chunks, { type });
    if (blob.size < 2000) return toast.error('That recording was too short.');
    setBusy('upload');
    try {
      const ext = type.includes('mp4') ? (kind === 'VIDEO' ? 'mp4' : 'm4a') : 'webm';
      const url = await uploadChatFile(new File([blob], `feedback-${Date.now()}.${ext}`, { type }));
      await authedJson(`/api/assignments/submissions/${submissionId}/media`, { method: 'POST', body: JSON.stringify({ url, kind }) });
      toast.success(`${kind === 'VIDEO' ? 'Video' : 'Voice'} feedback attached. The student gets it with their grade.`);
      onChange();
    } catch (e) { toast.error((e as Error).message || 'Couldn’t save the recording.'); } finally { setBusy(null); }
  };

  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => {
      const s = Math.round((Date.now() - rec.started) / 1000);
      setSecs(s);
      if (s * 1000 >= MAX_MS) { toast('Five minutes reached: saving your feedback.'); void stop(); }
    }, 500);
    return () => clearInterval(t);
  });

  const transcribe = async () => {
    setBusy('transcribe');
    try { await authedJson(`/api/assignments/submissions/${submissionId}/media/transcribe`, { method: 'POST' }); onChange(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const remove = async () => {
    setBusy('remove');
    try { await authedJson(`/api/assignments/submissions/${submissionId}/media`, { method: 'DELETE' }); onChange(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/10 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-zinc-900 dark:text-white mr-auto">Voice or video feedback</span>
        {!rec && !media.url && (
          <>
            <button type="button" onClick={() => void start('AUDIO')} disabled={!!busy} className="btn-secondary btn-sm rounded-full inline-flex"><Mic className="w-3.5 h-3.5" /> Voice</button>
            <button type="button" onClick={() => void start('VIDEO')} disabled={!!busy} className="btn-secondary btn-sm rounded-full inline-flex"><Video className="w-3.5 h-3.5" /> Video</button>
          </>
        )}
        {busy === 'upload' && <span className="text-xs text-zinc-500 inline-flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</span>}
      </div>
      <AnimatePresence>
        {rec && (
          <motion.div key="rec" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring.snappy} className="flex items-center gap-3">
            {rec.kind === 'VIDEO' && <video ref={preview} autoPlay muted playsInline className="w-32 aspect-video rounded-lg bg-black object-cover" />}
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-rose-600 dark:text-rose-400"><span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> Recording {clock(secs)} / 5:00</span>
            <button type="button" onClick={() => void stop()} className="btn-primary btn-sm rounded-full inline-flex ml-auto"><Square className="w-3.5 h-3.5 fill-current" /> Stop and attach</button>
          </motion.div>
        )}
      </AnimatePresence>
      {media.url && !rec && (
        <div className="space-y-2">
          {media.kind === 'VIDEO'
            ? <video src={media.url} controls preload="metadata" className="w-full max-h-64 rounded-lg bg-black" />
            : <audio src={media.url} controls preload="metadata" className="w-full" />}
          {media.transcript && <p className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">{media.transcript}</p>}
          <div className="flex flex-wrap gap-2">
            {!media.transcript && <button type="button" onClick={transcribe} disabled={!!busy} className="btn-ghost btn-sm inline-flex">{busy === 'transcribe' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} Add transcript (AI)</button>}
            <button type="button" onClick={remove} disabled={!!busy} className="btn-ghost btn-sm inline-flex text-rose-500">{busy === 'remove' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Remove</button>
          </div>
        </div>
      )}
    </div>
  );
}

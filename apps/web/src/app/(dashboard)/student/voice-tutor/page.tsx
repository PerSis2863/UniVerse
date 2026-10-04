'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Loader2, Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { authedJson } from '@/lib/authed-fetch';
import { fetcher } from '@/lib/fetcher';
import { cn } from '@/lib/utils';

// Spoken conversation with the AI tutor (Gemini Live). The server hands out a single-use token
// with the tutor's instructions locked in (/api/tutor/voice); the browser then streams the
// microphone straight to Gemini and plays the spoken replies, with live captions.

type Phase = 'idle' | 'starting' | 'live' | 'ending';
interface Line { who: 'you' | 'tutor'; text: string }

const toBase64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export default function VoiceTutorPage() {
  const { data: courses } = useSWR<{ id: string; code: string; name: string }[]>('/courses/my', fetcher);
  const [courseId, setCourseId] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const live = useRef<{ stop: () => void; setMuted: (m: boolean) => void } | null>(null);

  useEffect(() => () => live.current?.stop(), []);
  useEffect(() => {
    if (phase !== 'live' || secondsLeft === null) return;
    const t = setInterval(() => setSecondsLeft((s) => (s === null ? null : Math.max(0, s - 1))), 1000);
    return () => clearInterval(t);
  }, [phase, secondsLeft === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (who: Line['who'], text: string) => setLines((l) => {
    const last = l[l.length - 1];
    if (last && last.who === who) return [...l.slice(0, -1), { who, text: last.text + text }];
    return [...l, { who, text }].slice(-40);
  });

  const start = async () => {
    setPhase('starting');
    setLines([]);
    let mic: MediaStream | null = null;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      const t = await authedJson<{ token: string; model: string; minutes: number }>('/api/tutor/voice', { method: 'POST', body: JSON.stringify({ courseId: courseId || undefined }) });
      const { GoogleGenAI, Modality } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: t.token, httpOptions: { apiVersion: 'v1alpha' } });

      const input = new AudioContext({ sampleRate: 16000 });
      const output = new AudioContext({ sampleRate: 24000 });
      await input.audioWorklet.addModule('/voice-worklet.js');
      const source = input.createMediaStreamSource(mic);
      const capture = new AudioWorkletNode(input, 'pcm-capture');
      source.connect(capture);
      let playAt = 0;
      const playing = new Set<AudioBufferSourceNode>();
      let isMuted = false;
      let closed = false;

      const session = await ai.live.connect({
        model: t.model,
        config: { responseModalities: [Modality.AUDIO] },
        callbacks: {
          onmessage: (m) => {
            const sc = m.serverContent;
            if (!sc) return;
            if (sc.interrupted) { for (const s of playing) try { s.stop(); } catch { /* done */ } playing.clear(); playAt = 0; setSpeaking(false); }
            if (sc.inputTranscription?.text) add('you', sc.inputTranscription.text);
            if (sc.outputTranscription?.text) add('tutor', sc.outputTranscription.text);
            for (const part of sc.modelTurn?.parts ?? []) {
              const data = part.inlineData?.data;
              if (!data) continue;
              const bin = atob(data);
              const pcm = new Int16Array(bin.length / 2);
              for (let i = 0; i < pcm.length; i++) pcm[i] = (bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)) << 16 >> 16;
              const buf = output.createBuffer(1, pcm.length, 24000);
              const ch = buf.getChannelData(0);
              for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
              const node = output.createBufferSource();
              node.buffer = buf;
              node.connect(output.destination);
              playAt = Math.max(playAt, output.currentTime);
              node.start(playAt);
              playAt += buf.duration;
              playing.add(node);
              setSpeaking(true);
              node.onended = () => { playing.delete(node); if (!playing.size) setSpeaking(false); };
            }
          },
          onerror: () => toast.error('The voice connection had a problem.'),
          onclose: () => { if (!closed) stop(); },
        },
      });

      capture.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (isMuted || closed) return;
        session.sendRealtimeInput({ audio: { data: toBase64(e.data), mimeType: 'audio/pcm;rate=16000' } });
      };

      const stop = () => {
        if (closed) return;
        closed = true;
        setPhase('ending');
        try { session.close(); } catch { /* closed */ }
        capture.port.onmessage = null;
        source.disconnect();
        mic?.getTracks().forEach((tr) => tr.stop());
        void input.close();
        void output.close();
        live.current = null;
        setSpeaking(false);
        setSecondsLeft(null);
        setPhase('idle');
      };
      live.current = { stop, setMuted: (m) => { isMuted = m; } };
      setMuted(false);
      setSecondsLeft(t.minutes * 60);
      setPhase('live');
    } catch (e) {
      mic?.getTracks().forEach((tr) => tr.stop());
      const err = e as Error & { name?: string };
      toast.error(err.name === 'NotAllowedError' ? 'Allow the microphone to talk with the tutor.' : err.message || 'Couldn’t start the voice tutor.');
      setPhase('idle');
    }
  };

  useEffect(() => { if (secondsLeft === 0) live.current?.stop(); }, [secondsLeft]);

  return (
    <>
      <Topbar title="Voice tutor" subtitle="Talk through a topic out loud with your AI tutor" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="rounded-3xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] p-6 text-center space-y-4">
            <div className={cn('w-24 h-24 mx-auto rounded-full flex items-center justify-center transition-all', phase === 'live' ? 'bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-xl shadow-fuchsia-500/30' : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-400', speaking && 'scale-110')}>
              {phase === 'starting' ? <Loader2 className="w-9 h-9 animate-spin" /> : speaking ? <Volume2 className="w-9 h-9" /> : <Mic className="w-9 h-9" />}
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status">
              {phase === 'live' ? (speaking ? 'Tutor is speaking… (just talk to interrupt)' : muted ? 'Muted' : 'Listening…') : phase === 'starting' ? 'Connecting…' : 'Ask about anything you’re studying. You can interrupt at any time.'}
              {phase === 'live' && secondsLeft !== null && <span className="block text-xs text-zinc-500 mt-1">{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')} left</span>}
            </p>
            {phase === 'idle' && (
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <select aria-label="Course (optional)" value={courseId} onChange={(e) => setCourseId(e.target.value)} className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-white">
                  <option value="">Any topic</option>
                  {courses?.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                </select>
                <button type="button" className="btn-primary" onClick={start}><Mic className="w-4 h-4" /> Start talking</button>
              </div>
            )}
            {phase === 'live' && (
              <div className="flex gap-2 justify-center">
                <button type="button" className="btn-secondary" onClick={() => { const m = !muted; setMuted(m); live.current?.setMuted(m); }} aria-pressed={muted}>
                  {muted ? <><Mic className="w-4 h-4" /> Unmute</> : <><MicOff className="w-4 h-4" /> Mute</>}
                </button>
                <button type="button" className="btn-danger" onClick={() => live.current?.stop()}><PhoneOff className="w-4 h-4" /> End</button>
              </div>
            )}
            <p className="text-[11px] text-zinc-500">Sessions last up to 10 minutes and count as one AI request. Audio goes to Google Gemini for the conversation and isn&apos;t stored by UniVerse.</p>
          </div>

          {lines.length > 0 && (
            <section aria-label="Captions" className="space-y-2">
              {lines.map((l, i) => (
                <p key={i} className={cn('text-sm rounded-2xl px-4 py-2 max-w-[85%]', l.who === 'you' ? 'ml-auto bg-indigo-500 text-white' : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-800 dark:text-zinc-200')}>{l.text}</p>
              ))}
            </section>
          )}
        </div>
      </div>
    </>
  );
}

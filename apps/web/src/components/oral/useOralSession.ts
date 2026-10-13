'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { authedFetch, authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { openMic, startLiveVoice, type LiveHandle } from '@/lib/live-voice';
import type { Criterion, Line, OralKind } from '@/lib/oral';
import type { OralView } from './OralResult';

// One oral with the AI examiner (Stage 5 · D11): starts the voice session (/api/orals start), keeps
// the transcript and the clock, and at the end sends it (with the recording, for an oral check) to
// be scored or to go to the teacher.

export type OralStart = { checkId: string } | { kind: OralKind; topic: string; courseId?: string; lang?: string; minutes: number };
type Started = { token: string; model: string; minutes: number; rubric: Criterion[]; kind: OralKind; topic: string; lang: string; title: string; attempt: boolean };
export type OralPhase = 'idle' | 'starting' | 'live' | 'saving' | 'done';

const KICKOFF = 'Begin the exam now.';
const MAX_UPLOAD = 4 * 1024 * 1024;

export function useOralSession(onSaved: () => void) {
  const [phase, setPhase] = useState<OralPhase>('idle');
  const [lines, setLines] = useState<Line[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [info, setInfo] = useState<Started | null>(null);
  const [result, setResult] = useState<OralView | null>(null);
  const live = useRef<{ handle: LiveHandle; info: Started; start: OralStart; at: number; ends: number } | null>(null);
  const said = useRef<Line[]>([]);
  const finishing = useRef(false);

  const add = (who: Line['who'], text: string) => {
    const l = said.current;
    const last = l[l.length - 1];
    said.current = last && last.who === who ? [...l.slice(0, -1), { who, text: last.text + text }] : [...l, { who, text }];
    setLines(said.current.slice(-60));
  };

  const finish = async () => {
    const s = live.current;
    if (!s || finishing.current) return;
    finishing.current = true;
    setPhase('saving');
    setSpeaking(false);
    const blob = await s.handle.stop().catch(() => null);
    const durationSec = Math.round((Date.now() - s.at) / 1000);
    let audioUrl: string | null = null;
    if (s.info.attempt && blob && blob.size > 0 && blob.size <= MAX_UPLOAD) {
      try {
        const r = await authedFetch('/api/upload?filename=oral-check.webm', { method: 'POST', headers: { 'Content-Type': blob.type || 'audio/webm' }, body: blob });
        if (r.ok) audioUrl = ((await r.json()) as { url?: string }).url ?? null;
      } catch { /* the transcript still goes */ }
      if (!audioUrl) toast('The recording couldn’t be uploaded', { description: 'Your answers still go to your teacher as text.' });
    }
    const start = s.start;
    const body = s.info.attempt && 'checkId' in start
      ? { action: 'finish', checkId: start.checkId, durationSec, lines: said.current, audioUrl }
      : { action: 'finish', kind: s.info.kind, topic: s.info.topic, lang: s.info.lang, courseId: 'courseId' in start ? start.courseId : undefined, durationSec, lines: said.current };
    try {
      const r = await authedJson<OralView & { id: string | null }>('/api/orals', { method: 'POST', body: JSON.stringify(body) });
      setResult(s.info.attempt && r.id ? await authedJson<OralView>(`/api/orals/${r.id}`) : r);
      setPhase('done');
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t save the oral.'));
      setPhase('idle');
    } finally {
      live.current = null;
      setLeft(null);
    }
  };
  const finishRef = useRef(finish);
  useEffect(() => { finishRef.current = finish; });

  const begin = async (start: OralStart) => {
    setPhase('starting');
    setLines([]);
    setResult(null);
    said.current = [];
    finishing.current = false;
    let mic: MediaStream | null = null;
    try {
      mic = await openMic();
      const t = await authedJson<Started>('/api/orals', { method: 'POST', body: JSON.stringify({ action: 'start', ...start }) });
      const handle = await startLiveVoice({
        mic, token: t.token, model: t.model, kickoff: KICKOFF, record: t.attempt,
        onText: add, onSpeaking: setSpeaking,
        onError: () => toast.error('The voice connection had a problem.'),
        onClosed: () => void finishRef.current(),
      });
      const at = Date.now();
      live.current = { handle, info: t, start, at, ends: at + t.minutes * 60_000 };
      setInfo(t);
      setMuted(false);
      setLeft(t.minutes * 60);
      setPhase('live');
    } catch (e) {
      mic?.getTracks().forEach((tr) => tr.stop());
      const err = e as Error & { name?: string };
      toast.error(err.name === 'NotAllowedError' ? 'Allow the microphone to talk with the examiner.' : errorMessage(e, 'Couldn’t start the oral.'));
      setPhase('idle');
    }
  };

  // The clock; at the end the oral is sent by itself.
  useEffect(() => {
    if (phase !== 'live') return;
    const t = setInterval(() => {
      const s = live.current;
      if (!s) return;
      const sec = Math.max(0, Math.round((s.ends - Date.now()) / 1000));
      setLeft(sec);
      if (sec === 0) void finishRef.current();
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Leaving the page during an oral check still sends what was said (without the recording).
  useEffect(() => {
    if (phase !== 'live') return;
    const away = () => {
      const s = live.current;
      if (!s || !s.info.attempt || !('checkId' in s.start) || finishing.current) return;
      finishing.current = true;
      void authedFetch('/api/orals', { method: 'POST', keepalive: true, body: JSON.stringify({ action: 'finish', checkId: s.start.checkId, durationSec: Math.round((Date.now() - s.at) / 1000), lines: said.current }) }).catch(() => {});
    };
    window.addEventListener('pagehide', away);
    return () => window.removeEventListener('pagehide', away);
  }, [phase]);

  // Closing the page part way stops the microphone.
  useEffect(() => () => { void live.current?.handle.stop(); }, []);

  return {
    phase, lines, speaking, muted, left, info, result,
    begin, finish: () => void finish(),
    toggleMute: () => { const m = !muted; setMuted(m); live.current?.handle.setMuted(m); },
    reset: () => { setPhase('idle'); setResult(null); setInfo(null); },
  };
}
export type OralSession = ReturnType<typeof useOralSession>;

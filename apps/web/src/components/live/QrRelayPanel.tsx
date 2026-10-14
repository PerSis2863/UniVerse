'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Bell, BrainCircuit, Loader2, Pause, Play, QrCode as QrIcon, ShieldCheck, SkipForward, StickyNote, Trash2, WifiOff, X } from 'lucide-react';
import { QrCode } from '@/components/ui/QrCode';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { spring } from '@/lib/motion';
import { MAX_RELAY_BYTES, fromBase45, loopId, packRelay, toBase45, toFrames, type FrameSize, type PreparedRelay, type RelayKind } from '@/lib/qr-relay';
import { cn } from '@/lib/utils';

// Stage 5 · D17, offline classroom relay (teacher's Live class page): pick a note, an announcement or
// a quiz without pictures; the server signs it; this screen shows it as a loop of QR codes that
// students' phones read with no internet (Offline courses → Scan from the teacher's screen,
// src/components/offline/QrRelayScan.tsx). Prepared items stay on this computer, so they can be
// shown later with no connection too.

interface Ready { key: string; kind: RelayKind; title: string; course: string; data: string; signed: boolean; at: string }
type Choices = { announcements: { id: string; title: string; createdAt: string; problem: string | null }[]; quizzes: { id: string; title: string; questions: number; problem: string | null }[] };

const READY_KEY = 'uv-relay-ready';
const READY_EVENT = 'uv-relay-ready';
const MAX_READY = 8;
const KINDS = [
  { id: 'NOTE', label: 'Note', icon: StickyNote },
  { id: 'ANNOUNCEMENT', label: 'Announcement', icon: Bell },
  { id: 'QUIZ', label: 'Quiz', icon: BrainCircuit },
] as const;
const SPEEDS = [{ fps: 2, label: 'Slow' }, { fps: 4, label: 'Normal' }, { fps: 6, label: 'Fast' }] as const;
const SIZES: { id: FrameSize; label: string }[] = [{ id: 'small', label: 'Small' }, { id: 'normal', label: 'Medium' }, { id: 'large', label: 'Large' }];

// The ready list lives in this browser's storage (it may be unavailable: private windows).
const readRaw = () => { try { return localStorage.getItem(READY_KEY) ?? '[]'; } catch { return '[]'; } };
const subscribe = (cb: () => void) => {
  window.addEventListener(READY_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => { window.removeEventListener(READY_EVENT, cb); window.removeEventListener('storage', cb); };
};
function saveReady(list: Ready[]) {
  try { localStorage.setItem(READY_KEY, JSON.stringify(list.slice(0, MAX_READY))); } catch { /* storage full or blocked: it's still shown now */ }
  window.dispatchEvent(new Event(READY_EVENT));
}
function parseReady(raw: string): Ready[] {
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.filter((r) => r && typeof r.data === 'string' && typeof r.title === 'string') : []; } catch { return []; }
}

const kindLabel = (k: RelayKind) => KINDS.find((x) => x.id === k)?.label ?? k;

export function QrRelayPanel({ courseId, courseCode }: { courseId: string; courseCode: string }) {
  const raw = useSyncExternalStore(subscribe, readRaw, () => '[]');
  const ready = useMemo(() => parseReady(raw), [raw]);
  const [kind, setKind] = useState<RelayKind>('NOTE');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showing, setShowing] = useState<Ready | null>(null);
  const { data: choices, error } = useSWR<Choices>(courseId && kind !== 'NOTE' ? `/api/classroom/relay?courseId=${encodeURIComponent(courseId)}` : null, authedJson);

  const prepare = async () => {
    setBusy(true);
    try {
      const body = kind === 'NOTE' ? { courseId, kind, title, text } : { courseId, kind, id: picked };
      const p = await authedJson<PreparedRelay & { title: string; kind: RelayKind }>('/api/classroom/relay', { method: 'POST', body: JSON.stringify(body) });
      const bytes = packRelay(p);
      if (bytes.length > MAX_RELAY_BYTES) throw new Error('This is too long to send as codes. Shorten it, or split it into two.');
      const r: Ready = { key: kind === 'NOTE' ? `NOTE:${Date.now()}` : `${kind}:${picked}`, kind: p.kind, title: p.title, course: courseCode, data: toBase45(bytes), signed: !!p.signature, at: new Date().toISOString() };
      saveReady([r, ...ready.filter((x) => x.key !== r.key)]);
      if (kind === 'NOTE') { setTitle(''); setText(''); }
      setShowing(r);
    } catch (e) {
      toast.error(errorMessage(e, 'Couldn’t prepare it.'));
    } finally {
      setBusy(false);
    }
  };

  const options = kind === 'ANNOUNCEMENT' ? choices?.announcements : kind === 'QUIZ' ? choices?.quizzes : undefined;
  const canPrepare = !!courseId && !busy && (kind === 'NOTE' ? !!title.trim() && !!text.trim() : !!picked && !!options?.some((o) => o.id === picked && !o.problem));

  return (
    <section className="panel p-5 space-y-4" aria-labelledby="relay-title">
      <div className="flex items-start gap-4">
        <span className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0"><WifiOff className="w-6 h-6 text-emerald-700 dark:text-emerald-300" aria-hidden /></span>
        <div className="flex-1 min-w-0">
          <h2 id="relay-title" className="font-semibold text-zinc-900 dark:text-white">Send to phones with no internet</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">A note, an announcement or a quiz without pictures, shown on this screen as moving codes. Students open <b>Offline courses → Scan from the teacher’s screen</b>; their phones need no connection. Quiz answers are sent when a phone is next online.</p>
        </div>
      </div>

      {courseId ? (
        <div className="space-y-3">
          <div role="group" aria-label="What to send" className="inline-flex flex-wrap rounded-xl bg-zinc-100 dark:bg-white/[0.06] p-1">
            {KINDS.map((k) => (
              <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => { setKind(k.id); setPicked(null); }}
                className={cn('px-3 py-1.5 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 transition-colors', kind === k.id ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white')}>
                <k.icon className="w-4 h-4" aria-hidden /> {k.label}
              </button>
            ))}
          </div>

          {kind === 'NOTE' ? (
            <div className="space-y-2">
              <input aria-label="Note title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Homework for Friday" className="input" />
              <textarea aria-label="Note text" value={text} maxLength={6000} rows={4} onChange={(e) => setText(e.target.value)} placeholder="What students should read or do" className="input" />
              <p className="text-xs text-zinc-500">{text.length} / 6000 characters. Short notes need just one or two codes.</p>
            </div>
          ) : error ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">{errorMessage(error, 'Couldn’t load the course’s items.')}</p>
          ) : !options ? (
            <div className="h-20 rounded-xl skeleton" />
          ) : options.length === 0 ? (
            <p className="text-sm text-zinc-500">{kind === 'QUIZ' ? 'No quizzes in this course yet.' : 'No announcements in this course yet.'}</p>
          ) : (
            <fieldset className="space-y-1 max-h-64 overflow-y-auto">
              <legend className="sr-only">{kind === 'QUIZ' ? 'Quiz' : 'Announcement'}</legend>
              {options.map((o) => (
                <label key={o.id} className={cn('flex items-center gap-3 p-2 rounded-xl', o.problem ? 'opacity-70' : 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/[0.03]')}>
                  <input type="radio" name="relay-item" value={o.id} checked={picked === o.id} disabled={!!o.problem} onChange={() => setPicked(o.id)} className="accent-indigo-500" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-zinc-900 dark:text-white truncate">{o.title}</span>
                    <span className="block text-xs text-zinc-500">{o.problem ? `Can’t send: ${o.problem.toLowerCase()}` : 'questions' in o ? `${o.questions} question${o.questions === 1 ? '' : 's'}` : new Date(o.createdAt).toLocaleDateString()}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <button type="button" onClick={() => void prepare()} disabled={!canPrepare} aria-busy={busy || undefined} className="btn-primary">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrIcon className="w-4 h-4" />} Show as codes
          </button>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Pick a course above to prepare something new.</p>
      )}

      {ready.length > 0 && (
        <div className="pt-3 border-t border-zinc-200/70 dark:border-white/[0.07]">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Ready to show on this computer</h3>
          <p className="text-xs text-zinc-500">These work with no connection too.</p>
          <ul className="mt-2 space-y-1">
            {ready.map((r) => (
              <li key={r.key} className="flex items-center gap-2">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-zinc-900 dark:text-white truncate">{r.title}</span>
                  <span className="block text-xs text-zinc-500">{kindLabel(r.kind)} · {r.course}{r.signed ? '' : ' · not signed'}</span>
                </span>
                <button type="button" onClick={() => setShowing(r)} className="btn-secondary btn-sm"><QrIcon className="w-4 h-4" aria-hidden /> Show</button>
                <button type="button" onClick={() => saveReady(ready.filter((x) => x.key !== r.key))} className="btn-ghost btn-sm text-rose-600 dark:text-rose-400" aria-label={`Remove “${r.title}”`}><Trash2 className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AnimatePresence>{showing && <CodeLoop key={showing.key} ready={showing} onClose={() => setShowing(null)} />}</AnimatePresence>
    </section>
  );
}

/** The item as a loop of codes, full screen for the projector. */
function CodeLoop({ ready, onClose }: { ready: Ready; onClose: () => void }) {
  const [id] = useState(loopId);
  const [size, setSize] = useState<FrameSize>('normal');
  const [fps, setFps] = useState(4);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0);
  const frames = useMemo(() => toFrames(fromBase45(ready.data), id, size), [ready.data, id, size]);
  const i = tick % frames.length;
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (paused || frames.length < 2) return;
    const t = setInterval(() => setTick((n) => n + 1), Math.round(1000 / fps));
    return () => clearInterval(t);
  }, [paused, fps, frames.length]);
  useEffect(() => {
    box.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  return (
    <motion.div ref={box} tabIndex={-1} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={spring.smooth}
      className="fixed inset-0 z-[150] bg-white dark:bg-zinc-950 flex flex-col items-center justify-center p-4 sm:p-6 text-center overflow-y-auto outline-none" role="dialog" aria-modal="true" aria-label={`Codes for ${ready.title}`}>
      <button type="button" onClick={onClose} className="absolute top-3 right-3 p-2 rounded-full text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10" aria-label="Close"><X className="w-6 h-6" /></button>
      <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white px-10">{ready.title}</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">{ready.course} · On phones: <b>Offline courses → Scan from the teacher’s screen</b></p>
      <div className="mt-4 rounded-3xl bg-white p-3 sm:p-4 shadow-xl">
        <QrCode value={frames[i]} size={480} title={`Code ${i + 1} of ${frames.length}`} className="block w-[min(84vw,58vh)] h-auto" />
      </div>
      <p className="mt-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100 tabular-nums" aria-live="off">Code {i + 1} of {frames.length}</p>
      <div className="mt-1 flex flex-wrap justify-center gap-1 max-w-md" aria-hidden>
        {frames.map((_, n) => <span key={n} className={cn('w-1.5 h-1.5 rounded-full', n === i ? 'bg-indigo-500' : 'bg-zinc-300 dark:bg-zinc-700')} />)}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused} className="btn-secondary btn-sm">{paused ? <Play className="w-4 h-4" aria-hidden /> : <Pause className="w-4 h-4" aria-hidden />} {paused ? 'Play' : 'Pause'}</button>
        {paused && <button type="button" onClick={() => setTick((n) => n + 1)} className="btn-secondary btn-sm"><SkipForward className="w-4 h-4" aria-hidden /> Next code</button>}
        <Choice<number> label="Speed" value={fps} options={SPEEDS.map((s) => ({ id: s.fps, label: s.label }))} onChange={setFps} />
        <Choice<FrameSize> label="Code size" value={size} options={SIZES} onChange={(s) => { setSize(s); setTick(0); }} />
      </div>
      <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400 max-w-md">
        {ready.signed ? <span className="inline-flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden /> Signed: phones can check it came from you.</span> : 'Not signed (this site has no signing key), so phones can’t check who sent it.'}{' '}
        Phones far away read <b>Large</b> codes more easily; slower phones like <b>Slow</b>.
      </p>
    </motion.div>
  );
}

function Choice<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center rounded-xl bg-zinc-100 dark:bg-white/[0.06] p-1">
      <span className="px-2 text-xs text-zinc-600 dark:text-zinc-400">{label}</span>
      {options.map((o) => (
        <button key={String(o.id)} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}
          className={cn('px-2.5 py-1 rounded-lg text-xs font-medium', value === o.id ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-600 dark:text-zinc-400')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

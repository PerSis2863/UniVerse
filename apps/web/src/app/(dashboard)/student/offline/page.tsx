'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Bell, BookOpen, BrainCircuit, Calendar, CloudOff, Download, FileText, Layers, Loader2, PenLine, RefreshCw, Trash2, WifiOff } from 'lucide-react';
import { OfflineAssignment, OfflineQuiz, OutboxList } from '@/components/offline/OfflineWork';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, STUDENT_COURSE_TABS } from '@/components/layout/SectionTabs';
import { confirmDialog } from '@/components/ui/Dialogs';
import { deletePack, getPack, listPacks, offlineSupported, savedFileUrl, savePack, type Pack, type PackSummary } from '@/lib/offline-packs';
import { cn } from '@/lib/utils';
import { TabPill } from '@/components/ui/Glide';

const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb); };
};
const noSubscribe = () => () => {};
const mb = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : b < 1024 ** 3 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${(b / 1024 ** 3).toFixed(1)} GB`);

/** Courses saved on this device (src/lib/offline-packs.ts), readable with no connection. */
export default function OfflinePage() {
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [open, setOpen] = useState<Pack | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Browser-only facts, read without a server/client mismatch (the server assumes yes).
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const supported = useSyncExternalStore(noSubscribe, offlineSupported, () => true);

  const load = useCallback(() => { listPacks().then(setPacks).catch(() => setPacks([])); }, []);
  useEffect(() => { load(); }, [load]);

  const refresh = async (p: PackSummary) => {
    setBusy(p.courseId);
    try { await savePack(p.courseId); toast.success(`${p.code} updated`); load(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const remove = async (p: PackSummary) => {
    if (!(await confirmDialog({ title: `Remove ${p.code} from this device?`, confirmLabel: 'Remove', destructive: true }))) return;
    await deletePack(p.courseId);
    if (open?.summary.courseId === p.courseId) setOpen(null);
    load();
  };

  return (
    <>
      <Topbar title="Offline courses" subtitle="Courses saved on this device: open them with no connection" />
      <SectionTabs tabs={STUDENT_COURSE_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-5">
          {!online && <p className="rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300 text-sm p-3 flex items-center gap-2"><WifiOff className="w-4 h-4" /> You&apos;re offline. Saved courses still open, and quizzes and assignments you finish are sent when you&apos;re back.</p>}
          <OutboxList />
          {!supported ? (
            <p className={`panel p-6 text-sm text-zinc-500`}>This browser can&apos;t save courses for offline use.</p>
          ) : packs === null ? (
            <div className="h-24 rounded-2xl skeleton" />
          ) : packs.length === 0 ? (
            <div className={`panel p-8 text-center space-y-2`}>
              <CloudOff className="w-10 h-10 text-zinc-400 mx-auto" />
              <p className="font-semibold text-zinc-900 dark:text-white">No courses saved yet</p>
              <p className="text-sm text-zinc-500">Open a course in Blackboard and tap <b>Save offline</b>. Its announcements, materials, reading list, your flashcards, and open quizzes and assignments are kept on this device.</p>
            </div>
          ) : open ? (
            <PackView pack={open} onBack={() => setOpen(null)} />
          ) : (
            <div className="grid gap-3 stagger">
              {packs.map((p) => (
                <div key={p.courseId} className={`panel p-4 flex items-center gap-3`}>
                  <button type="button" onClick={async () => setOpen(await getPack(p.courseId))} className="flex-1 min-w-0 text-left">
                    <p className="font-semibold text-zinc-900 dark:text-white truncate">{p.code} · {p.name}</p>
                    <p className="text-xs text-zinc-500">{p.savedFiles} of {p.files} files · {mb(p.bytes)} · saved {new Date(p.savedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </button>
                  <button type="button" className="btn-ghost" disabled={!online || busy === p.courseId} onClick={() => refresh(p)} aria-label={`Update ${p.code}`} title="Update with the latest">
                    {busy === p.courseId ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </button>
                  <button type="button" className="btn-ghost text-rose-500" onClick={() => remove(p)} aria-label={`Remove ${p.code}`}><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              <StorageNote />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StorageNote() {
  const [text, setText] = useState('');
  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => { if (e.usage !== undefined && e.quota) setText(`Using ${mb(e.usage)} of ${mb(e.quota)} available on this device.`); }).catch(() => {});
  }, []);
  return text ? <p className="text-xs text-zinc-500">{text}</p> : null;
}

function PackView({ pack, onBack }: { pack: Pack; onBack: () => void }) {
  const [tab, setTab] = useState<'news' | 'files' | 'reading' | 'cards' | 'calendar' | 'quizzes' | 'work'>('files');
  const quizzes = pack.quizzes ?? [];
  const work = pack.assignments ?? [];
  const tabs = [
    { id: 'files', label: 'Materials', icon: FileText, n: pack.files.length },
    { id: 'quizzes', label: 'Quizzes', icon: BrainCircuit, n: quizzes.length },
    { id: 'work', label: 'Assignments', icon: PenLine, n: work.length },
    { id: 'news', label: 'Announcements', icon: Bell, n: pack.board.announcements.length },
    { id: 'cards', label: 'Flashcards', icon: Layers, n: pack.cards.length },
    { id: 'reading', label: 'Reading list', icon: BookOpen, n: pack.board.readings.length },
    { id: 'calendar', label: 'Calendar', icon: Calendar, n: pack.board.events.length },
  ] as const;

  const openFile = async (url: string, saved: boolean) => {
    const local = saved ? await savedFileUrl(url) : null;
    if (local) { window.open(local, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(local), 60_000); return; }
    if (navigator.onLine) window.open(url, '_blank', 'noopener');
    else toast.error('This file wasn’t saved, so it needs a connection.');
  };

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">← All saved courses</button>
      <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{pack.board.course.code} · {pack.board.course.name}</h2>
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn('relative isolate px-3 py-1.5 rounded-xl text-sm font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors', tab === t.id ? 'text-white' : 'bg-zinc-100 dark:bg-white/[0.05] text-zinc-700 dark:text-zinc-300')}>
            {tab === t.id && <TabPill id="offline-tab" />}
            <t.icon className="w-4 h-4" /> {t.label} <span className="opacity-70">{t.n}</span>
          </button>
        ))}
      </div>
      <div className={`panel divide-y divide-zinc-200 dark:divide-white/[0.06]`}>
        {tab === 'files' && (pack.files.length ? pack.files.map((f) => (
          <button key={f.url} type="button" onClick={() => openFile(f.url, f.saved)} className="w-full text-left p-4 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
            <FileText className="w-5 h-5 text-indigo-500 shrink-0" />
            <span className="flex-1 min-w-0"><span className="block text-sm font-medium text-zinc-900 dark:text-white truncate">{f.title}</span><span className="block text-xs text-zinc-500">{f.saved ? `Saved · ${mb(f.bytes)}` : 'Needs a connection'}</span></span>
            {f.saved ? <Download className="w-4 h-4 text-emerald-500" aria-label="Saved" /> : <CloudOff className="w-4 h-4 text-zinc-400" aria-label="Not saved" />}
          </button>
        )) : <p className="p-4 text-sm text-zinc-500">No materials.</p>)}
        {tab === 'quizzes' && (quizzes.length ? quizzes.map((q) => <OfflineQuiz key={q.id} quiz={q} />) : <p className="p-4 text-sm text-zinc-500">{pack.quizzes ? 'No open quizzes when this course was saved.' : 'Update this course (↻) to take its open quizzes offline.'}</p>)}
        {tab === 'work' && (work.length ? work.map((a) => <OfflineAssignment key={a.id} assignment={a} />) : <p className="p-4 text-sm text-zinc-500">{pack.assignments ? 'No open assignments when this course was saved.' : 'Update this course (↻) to write its open assignments offline.'}</p>)}
        {tab === 'news' && (pack.board.announcements.length ? pack.board.announcements.map((a) => (
          <article key={a.id} className="p-4"><h3 className="font-medium text-zinc-900 dark:text-white">{a.title}</h3><p className="text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-line mt-1">{a.body}</p><p className="text-xs text-zinc-500 mt-1">{new Date(a.createdAt).toLocaleDateString()} · {a.author.name}</p></article>
        )) : <p className="p-4 text-sm text-zinc-500">No announcements.</p>)}
        {tab === 'cards' && (pack.cards.length ? <Cards cards={pack.cards} /> : <p className="p-4 text-sm text-zinc-500">No flashcards for this course. Make some with the AI tutor.</p>)}
        {tab === 'reading' && (pack.board.readings.length ? pack.board.readings.map((r) => (
          <div key={r.id} className="p-4"><p className="text-sm font-medium text-zinc-900 dark:text-white">{r.title}</p>{r.description && <p className="text-xs text-zinc-500 mt-0.5">{r.description}</p>}</div>
        )) : <p className="p-4 text-sm text-zinc-500">No readings.</p>)}
        {tab === 'calendar' && (pack.board.events.length ? pack.board.events.map((e) => (
          <div key={e.id} className="p-4 flex justify-between gap-3 text-sm"><span className="text-zinc-900 dark:text-white">{e.title}</span><span className="text-zinc-500 shrink-0">{new Date(e.startAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
        )) : <p className="p-4 text-sm text-zinc-500">No events.</p>)}
      </div>
    </div>
  );
}

/** Flip-through flashcards (practice only offline; reviews are recorded online in the tutor). */
function Cards({ cards }: { cards: Pack['cards'] }) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const c = cards[i];
  return (
    <div className="p-5 space-y-4">
      <button type="button" onClick={() => setFlipped((f) => !f)} className="w-full min-h-40 rounded-2xl border border-zinc-200 dark:border-white/10 p-6 text-center flex items-center justify-center text-lg text-zinc-900 dark:text-white" aria-label={flipped ? 'Answer (tap to see the question)' : 'Question (tap to see the answer)'}>
        {flipped ? c.back : c.front}
      </button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" className="btn-secondary" disabled={i === 0} onClick={() => { setI(i - 1); setFlipped(false); }}>Previous</button>
        <span className="text-zinc-500">{i + 1} / {cards.length}</span>
        <button type="button" className="btn-secondary" disabled={i === cards.length - 1} onClick={() => { setI(i + 1); setFlipped(false); }}>Next</button>
      </div>
    </div>
  );
}

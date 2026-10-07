'use client';

import { use, useCallback, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Eye, FlaskConical, ListChecks, Loader2, Lock, Play, Plus, Trash2, Unlock, Users, XCircle } from 'lucide-react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { spring } from '@/lib/motion';
import { canRun, runJavaScript, runPython, type CodeTest, type RunResult } from '@/lib/code-runner';
import { Topbar } from '@/components/layout/Topbar';
import { authedJson } from '@/lib/authed-fetch';
import { useAuthStore } from '@/store/auth';
import { confirmDialog } from '@/components/ui/Dialogs';
import type { Status } from '@/components/code/CodeEditor';
import { PresenceStack, type Present } from '@/components/ui/PresenceStack';

// The editor (CodeMirror + Yjs) loads only on this page.
const CodeEditor = dynamic(() => import('@/components/code/CodeEditor').then((m) => m.CodeEditor), { ssr: false, loading: () => <div className="h-[60vh] rounded-xl skeleton" /> });

interface Room { id: string; title: string; language: string; locked: boolean; canManage: boolean; canEdit: boolean; canEditTests?: boolean; tests?: CodeTest[]; course: { code: string; name: string } }

const STATUS_TEXT: Record<Status, string> = { connecting: 'Connecting…', live: 'Live', offline: 'Reconnecting…', unavailable: 'Live editing is unavailable right now' };

const noop = () => {};

export default function CodeRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const { data: room, error, mutate } = useSWR<Room>(`/api/code/${id}`, authedJson);
  const [status, setStatus] = useState<{ s: Status; canEdit: boolean }>({ s: 'connecting', canEdit: false });
  const [present, setPresent] = useState<Present[]>([]);
  const [output, setOutput] = useState<RunResult | null>(null);
  const [running, setRunning] = useState<'run' | 'check' | null>(null);
  const [loadingPy, setLoadingPy] = useState(false);
  const [editTests, setEditTests] = useState<CodeTest[] | null>(null);
  const getText = useRef<() => string>(() => '');

  const onStatus = useCallback((s: Status, canEdit: boolean) => setStatus({ s, canEdit }), []);
  const onReady = useCallback((fn: () => string) => { getText.current = fn; }, []);

  // Run (just the code) or Check (the code, then the teacher's tests), on this device (3.6).
  const run = async (check: boolean) => {
    if (!room) return;
    setRunning(check ? 'check' : 'run');
    const tests = check ? room.tests ?? [] : [];
    try {
      setOutput(room.language === 'python' ? await runPython(getText.current(), tests, setLoadingPy) : await runJavaScript(getText.current(), tests));
    } finally { setRunning(null); }
  };
  const saveTests = async () => {
    if (!editTests) return;
    try {
      await authedJson(`/api/code/${id}`, { method: 'PATCH', body: JSON.stringify({ tests: editTests }) });
      await mutate();
      setEditTests(null);
      toast.success(editTests.length ? 'Tests saved: students can press Check' : 'Tests removed');
    } catch (e) { toast.error((e as Error).message); }
  };
  const patch = async (body: Record<string, unknown>) => {
    try { await authedJson(`/api/code/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); mutate(); } catch (e) { toast.error((e as Error).message); }
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this code room?', message: 'The code is deleted for everyone.', destructive: true, confirmLabel: 'Delete' }))) return;
    try { await authedJson(`/api/code/${id}`, { method: 'DELETE' }); router.push('/code'); } catch (e) { toast.error((e as Error).message); }
  };

  if (error) return <><Topbar title="Code room" /><p className="p-8 text-sm text-rose-500">{(error as Error).message}</p></>;
  const runnable = !!room && canRun(room.language);
  const tests = room?.tests ?? [];
  const passed = output?.tests.filter((t) => t.ok).length ?? 0;

  return (
    <>
      <Topbar title={room?.title ?? 'Code room'} sharedId={room ? `code-room:${id}` : undefined} subtitle={room ? `${room.course.code} · ${room.course.name}` : undefined} />
      <div className="flex-1 p-3 md:p-6 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link href="/code" className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-white mr-auto"><ArrowLeft className="w-4 h-4" /> Code rooms</Link>
            <span className={`text-xs font-semibold ${status.s === 'live' ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'}`} role="status">● {STATUS_TEXT[status.s]}</span>
            {status.s === 'live' && !status.canEdit && <span className="text-xs text-zinc-500 inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> View only</span>}
            {present.length ? <PresenceStack people={present} /> : <span className="text-xs text-zinc-500 inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Only you</span>}
            {room?.canManage && (
              <>
                <button type="button" className="btn-secondary" onClick={() => patch({ locked: !room.locked })} title={room.locked ? 'Let everyone edit' : 'Only you and the teacher edit'}>
                  {room.locked ? <><Unlock className="w-4 h-4" /> Unlock</> : <><Lock className="w-4 h-4" /> Lock</>}
                </button>
                <button type="button" className="btn-ghost text-rose-500" onClick={remove} aria-label="Delete room"><Trash2 className="w-4 h-4" /></button>
              </>
            )}
            {room?.canEditTests && runnable && <button type="button" className="btn-secondary" onClick={() => setEditTests(editTests ? null : tests.length ? tests : [{ name: 'Test 1', code: '' }])}><FlaskConical className="w-4 h-4" /> Tests{tests.length ? ` · ${tests.length}` : ''}</button>}
            {runnable && <button type="button" className="btn-secondary" onClick={() => void run(false)} disabled={!!running}>{running === 'run' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run</button>}
            {runnable && tests.length > 0 && <button type="button" className="btn-primary" onClick={() => void run(true)} disabled={!!running}>{running === 'check' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />} Check</button>}
          </div>
          <div className="h-[60vh]">
            {room && user?.id && (
              <CodeEditor roomId={id} lang={room.language} me={{ id: user.id, name: user.name ?? 'Me' }} dark={resolvedTheme === 'dark'} onStatus={onStatus} onPeers={noop} onPresence={setPresent} onReady={onReady} />
            )}
          </div>
          {room && !runnable && <p className="text-xs text-zinc-500">Running code in the browser is available for JavaScript and Python rooms.</p>}
          {loadingPy && <p className="text-xs text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading Python on this device (about 12 MB, the first time only)…</p>}
          <AnimatePresence initial={false}>
            {editTests && (
              <motion.section key="tests" aria-label="Tests" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring.smooth} className="overflow-hidden">
                <div className="rounded-xl border border-zinc-200 dark:border-white/10 p-3 space-y-2">
                  <p className="text-xs text-zinc-500">Each test runs after the student’s code and passes unless it fails an assert or throws. {room?.language === 'python' ? <>Example: <code>assert add(2, 3) == 5, &quot;add(2, 3) should be 5&quot;</code></> : <>Example: <code>assertEqual(add(2, 3), 5)</code> or <code>assert(isEven(4), &apos;4 is even&apos;)</code></>}</p>
                  {editTests.map((t, i) => (
                    <div key={i} className="flex flex-col sm:flex-row gap-2">
                      <input value={t.name} onChange={(e) => setEditTests(editTests.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} maxLength={80} placeholder={`Test ${i + 1}`} aria-label="Test name" className="sm:w-48 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-2.5 py-1.5 text-sm" />
                      <textarea value={t.code} onChange={(e) => setEditTests(editTests.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} rows={2} maxLength={2000} aria-label="Test code" spellCheck={false} className="flex-1 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-2.5 py-1.5 text-xs font-mono resize-y" />
                      <button type="button" aria-label="Remove test" onClick={() => setEditTests(editTests.filter((_, j) => j !== i))} className="self-start p-2 text-zinc-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button type="button" disabled={editTests.length >= 30} onClick={() => setEditTests([...editTests, { name: `Test ${editTests.length + 1}`, code: '' }])} className="btn-secondary btn-sm"><Plus className="w-3.5 h-3.5" />Add a test</button>
                    <span className="flex-1" />
                    <button type="button" onClick={() => setEditTests(null)} className="btn-ghost btn-sm">Cancel</button>
                    <button type="button" onClick={() => void saveTests()} className="btn-primary btn-sm">Save tests</button>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
          {output && output.tests.length > 0 && (
            <motion.section aria-label="Test results" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} className="rounded-xl border border-zinc-200 dark:border-white/10 p-3">
              <p className={`text-sm font-semibold ${passed === output.tests.length ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-white'}`}>{passed === output.tests.length ? `All ${passed} tests pass 🎉` : `${passed} of ${output.tests.length} tests pass`}</p>
              <ul className="mt-2 space-y-1">
                {output.tests.map((t, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    {t.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />}
                    <span className="min-w-0"><span className="text-zinc-800 dark:text-zinc-100">{t.name}</span>{t.message && <span className="block text-xs text-zinc-500 font-mono break-words">{t.message}</span>}</span>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}
          {output && (
            <section aria-label="Output" className="rounded-xl bg-zinc-950 text-zinc-100 p-4 font-mono text-xs space-y-0.5 max-h-60 overflow-y-auto">
              {output.lines.map((l, i) => <div key={i} className="whitespace-pre-wrap break-words">{l}</div>)}
              {output.error && <div className="text-rose-400 whitespace-pre-wrap">{output.error}</div>}
              {output.timedOut && <div className="text-amber-400">Stopped: it ran too long (an endless loop?).</div>}
              {!output.lines.length && !output.error && !output.timedOut && <div className="text-zinc-500">No output. Use {room?.language === 'python' ? 'print()' : 'console.log()'} to print.</div>}
            </section>
          )}
        </div>
      </div>
    </>
  );
}

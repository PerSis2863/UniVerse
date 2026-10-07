'use client';

import { use, useCallback, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { ArrowLeft, Eye, Lock, Play, Trash2, Unlock, Users } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { authedJson } from '@/lib/authed-fetch';
import { useAuthStore } from '@/store/auth';
import { confirmDialog } from '@/components/ui/Dialogs';
import type { Status } from '@/components/code/CodeEditor';
import { PresenceStack, type Present } from '@/components/ui/PresenceStack';

// The editor (CodeMirror + Yjs) loads only on this page.
const CodeEditor = dynamic(() => import('@/components/code/CodeEditor').then((m) => m.CodeEditor), { ssr: false, loading: () => <div className="h-[60vh] rounded-xl skeleton" /> });

interface Room { id: string; title: string; language: string; locked: boolean; canManage: boolean; canEdit: boolean; course: { code: string; name: string } }

const STATUS_TEXT: Record<Status, string> = { connecting: 'Connecting…', live: 'Live', offline: 'Reconnecting…', unavailable: 'Live editing is unavailable right now' };

/**
 * Runs JavaScript in a throwaway Web Worker (no page, no sign-in, no storage), stopped after
 * 5 seconds. Output is what the code logs.
 */
function runJavaScript(code: string): Promise<{ lines: string[]; error: string | null; timedOut: boolean }> {
  const prelude = `const __out = (k, a) => postMessage({ k, t: a.map((x) => { try { return typeof x === 'string' ? x : JSON.stringify(x); } catch { return String(x); } }).join(' ') });
console.log = (...a) => __out('log', a); console.info = console.log; console.warn = (...a) => __out('warn', a); console.error = (...a) => __out('error', a);
self.fetch = undefined; self.XMLHttpRequest = undefined; self.WebSocket = undefined; self.importScripts = undefined; self.indexedDB = undefined; self.caches = undefined;
`;
  const src = `${prelude}\ntry {\n${code}\n} catch (e) { postMessage({ k: 'throw', t: String(e && e.stack || e) }); }\npostMessage({ k: 'done' });`;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const worker = new Worker(url);
    const lines: string[] = [];
    let error: string | null = null;
    const finish = (timedOut: boolean) => { worker.terminate(); URL.revokeObjectURL(url); resolve({ lines, error, timedOut }); };
    const timer = setTimeout(() => finish(true), 5000);
    worker.onmessage = (e: MessageEvent<{ k: string; t?: string }>) => {
      if (e.data.k === 'done') { clearTimeout(timer); finish(false); return; }
      if (e.data.k === 'throw') { error = e.data.t ?? 'Error'; return; }
      if (lines.length < 500) lines.push(e.data.k === 'log' ? e.data.t ?? '' : `${e.data.k}: ${e.data.t ?? ''}`);
    };
    worker.onerror = (e) => { error = e.message; clearTimeout(timer); e.preventDefault(); finish(false); };
  });
}

const noop = () => {};

export default function CodeRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const { data: room, error, mutate } = useSWR<Room>(`/api/code/${id}`, authedJson);
  const [status, setStatus] = useState<{ s: Status; canEdit: boolean }>({ s: 'connecting', canEdit: false });
  const [present, setPresent] = useState<Present[]>([]);
  const [output, setOutput] = useState<{ lines: string[]; error: string | null; timedOut: boolean } | null>(null);
  const [running, setRunning] = useState(false);
  const getText = useRef<() => string>(() => '');

  const onStatus = useCallback((s: Status, canEdit: boolean) => setStatus({ s, canEdit }), []);
  const onReady = useCallback((fn: () => string) => { getText.current = fn; }, []);

  const run = async () => {
    setRunning(true);
    setOutput(await runJavaScript(getText.current()));
    setRunning(false);
  };
  const patch = async (body: Record<string, unknown>) => {
    try { await authedJson(`/api/code/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); mutate(); } catch (e) { toast.error((e as Error).message); }
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this code room?', message: 'The code is deleted for everyone.', destructive: true, confirmLabel: 'Delete' }))) return;
    try { await authedJson(`/api/code/${id}`, { method: 'DELETE' }); router.push('/code'); } catch (e) { toast.error((e as Error).message); }
  };

  if (error) return <><Topbar title="Code room" /><p className="p-8 text-sm text-rose-500">{(error as Error).message}</p></>;
  const runnable = room?.language === 'javascript' || room?.language === 'typescript';

  return (
    <>
      <Topbar title={room?.title ?? 'Code room'} subtitle={room ? `${room.course.code} · ${room.course.name}` : undefined} />
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
            {runnable && <button type="button" className="btn-primary" onClick={run} disabled={running}><Play className="w-4 h-4" /> Run</button>}
          </div>
          <div className="h-[60vh]">
            {room && user?.id && (
              <CodeEditor roomId={id} lang={room.language} me={{ id: user.id, name: user.name ?? 'Me' }} dark={resolvedTheme === 'dark'} onStatus={onStatus} onPeers={noop} onPresence={setPresent} onReady={onReady} />
            )}
          </div>
          {room && !runnable && <p className="text-xs text-zinc-500">Running code in the browser is available for JavaScript rooms.</p>}
          {output && (
            <section aria-label="Output" className="rounded-xl bg-zinc-950 text-zinc-100 p-4 font-mono text-xs space-y-0.5 max-h-60 overflow-y-auto">
              {output.lines.map((l, i) => <div key={i} className="whitespace-pre-wrap break-words">{l}</div>)}
              {output.error && <div className="text-rose-400 whitespace-pre-wrap">{output.error}</div>}
              {output.timedOut && <div className="text-amber-400">Stopped after 5 seconds.</div>}
              {!output.lines.length && !output.error && !output.timedOut && <div className="text-zinc-500">No output. Use console.log() to print.</div>}
            </section>
          )}
        </div>
      </div>
    </>
  );
}

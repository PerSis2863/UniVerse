'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Eye, FolderInput, LogIn } from 'lucide-react';
import Link from '@/components/ui/Link';
import { usePathParams } from '@/hooks/usePathParams';
import { useActivePoll } from '@/lib/realtime-client';
import { isToken } from '@/lib/tool-saves';
import { useAuthStore } from '@/store/auth';
import { KeptScope } from '@/components/studio/kept';
import { PANELS, ToolBody, type Panel } from '@/components/studio/registry';

// A view link from Collaborate → Create (M76): anyone can open it, no sign-in. The work opens in its
// own scope on this device ("view:<token>:"), so nothing of the visitor's is touched and nothing they
// change is saved. It updates by itself while the page is in use (a quiet check every 20 seconds).

interface Shared { tool: string; title: string; data: Record<string, string>; by: string; version: number; updatedAt: string }

export default function View() {
  const token = usePathParams('/s/[token]')?.token ?? '';
  const signedIn = useAuthStore((s) => !!s.user);
  const [shown, setShown] = useState<{ version: number; gen: number } | null>(null);
  const scope = `view:${token}:`;
  const poll = useActivePoll(20_000);
  const { data, error } = useSWR<{ shared: Shared }>(isToken(token) ? `/api/collab/shared/${token}` : null, async (u: string) => {
    const r = await fetch(u, { cache: 'no-store' });
    const j = (await r.json()) as { shared?: Shared; error?: string };
    if (!r.ok || !j.shared) throw new Error(j.error ?? 'This link doesn’t open.');
    return { shared: j.shared };
  }, {
    refreshInterval: poll,
    onSuccess: ({ shared }) => {
      // A newer version: write it for the tool and open it again.
      if (shown && shared.version === shown.version) return;
      for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k?.startsWith('view:') && !k.startsWith(scope)) localStorage.removeItem(k); }
      for (const [k, v] of Object.entries(shared.data)) { try { localStorage.setItem(scope + k, v); } catch { /* full */ } }
      setShown({ version: shared.version, gen: (shown?.gen ?? 0) + 1 });
    },
  });
  const s = data?.shared, tool = s && PANELS.includes(s.tool as Panel) ? (s.tool as Panel) : null;
  const keep = `/studio?shared=${token}`;
  return (
    <div className="min-h-[100dvh] ambient-bg">
      <header className="flex items-center justify-between gap-3 px-4 sm:px-8 py-4">
        <Link href="/" className="font-bold text-zinc-900 dark:text-white">UniVerse <span className="font-normal text-zinc-600 dark:text-zinc-300">Create</span></Link>
        {signedIn ? <Link href={keep} className="btn-primary btn-sm"><FolderInput className="w-4 h-4" aria-hidden />Keep a copy</Link> : <Link href={`/login?next=${encodeURIComponent(keep)}`} className="btn-primary btn-sm"><LogIn className="w-4 h-4" aria-hidden />Sign in to keep a copy</Link>}
      </header>
      <main className="mx-auto max-w-6xl px-4 sm:px-8 pb-12 space-y-4">
        {!isToken(token) || error ? (
          <div className="panel mx-auto max-w-xl p-6 text-center space-y-2" role="alert">
            <h1 className="font-bold text-zinc-900 dark:text-white">This shared link doesn’t open</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{(error as Error | undefined)?.message ?? 'This link isn’t complete. Ask for it again.'}</p>
          </div>
        ) : !s || !shown ? <div className="h-64 rounded-3xl skeleton" aria-label="Opening the shared work" /> : !tool ? (
          <div className="panel mx-auto max-w-xl p-6 text-center" role="alert"><h1 className="font-bold text-zinc-900 dark:text-white">This was made with a tool that isn’t here any more.</h1></div>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-white" translate="no">{s.title}</h1>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300"><Eye className="w-4 h-4" aria-hidden />Shared by <span translate="no">{s.by}</span> · view only: changes you make here aren’t saved · it updates by itself</p>
            </div>
            <section className="panel p-5" aria-label={s.title}>
              <KeptScope value={scope}><div key={shown.gen} className="space-y-4"><ToolBody panel={tool} /></div></KeptScope>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

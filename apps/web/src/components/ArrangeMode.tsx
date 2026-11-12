'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import { RotateCcw } from 'lucide-react';
import { Arranger } from '@/lib/arrange-dom';
import { Vault, sameDoc, type Doc } from '@/lib/arrange';
import { api } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { useArrange } from '@/store/arrange';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

// M165: every page of the app can be rearranged with the mouse alone (src/lib/arrange-dom.ts does the
// work): drag a card or a button to move it, pull a card's right or bottom edge to resize it. Nothing
// is drawn and there is no mode. What a person arranged is put back on every visit; once a page was
// changed, the top bar offers to put it back as it was.
// M166: the side menu's entries too (one arrangement per app's menu), and, when the person turns it on
// in Settings, the same arrangement on their other devices (GET/PUT/DELETE /arrange; a change is sent a
// moment after it is made, and a change made elsewhere arrives over the live connection).

interface Answer { sync: boolean; doc: Doc | null }

/** The top bar's "Put this page back" (and the phone title row's): there only on a page (or menu) the person rearranged. */
export function ArrangeButton({ className }: { className?: string }) {
  const arranged = useArrange((s) => s.arranged), reset = useArrange((s) => s.reset);
  if (!arranged) return null;
  return (
    <button type="button" data-arrange-ui onClick={reset} title="Put this page back as it was (Ctrl+Z takes back one change)"
      className={cn('drop-in btn-ghost btn-icon rounded-full', className)}>
      <RotateCcw className="w-[18px] h-[18px]" strokeWidth={2.1} aria-hidden /><span className="sr-only">Put this page back</span>
    </button>
  );
}

export function ArrangeMode() {
  const pathname = usePathname();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const parts = useRef<{ vault: Vault; page: Arranger | null; menu: Arranger | null } | null>(null);
  const { data, mutate } = useSWR<Answer>(userId ? '/arrange' : null, fetcher, { revalidateOnFocus: true, shouldRetryOnError: false });
  const live = useRef({ sync: false, mutate });
  useEffect(() => { live.current = { sync: !!data?.sync, mutate }; }, [data?.sync, mutate]);

  useEffect(() => {
    const vault = new Vault(userId);
    const said = { page: false, menu: false };
    const tell = () => useArrange.setState({
      arranged: said.page || said.menu, any: vault.any(),
      // The page first; the menu when only it was changed.
      reset: () => { const p = parts.current; if (said.page) p?.page?.reset(); else p?.menu?.reset(); },
    });
    const main = document.getElementById('main'), nav = document.getElementById('side-nav');
    const page = main ? new Arranger(main, vault, (s) => { said.page = s.arranged; tell(); }) : null;
    const menu = nav ? new Arranger(nav, vault, (s) => { said.menu = s.arranged; tell(); }, true) : null;
    parts.current = { vault, page, menu };

    // A change made here is sent a moment later (the answer is both copies joined).
    let timer = 0;
    const send = async () => {
      const r = await api.put<Answer>('/arrange', { doc: vault.now() });
      if (r.data.doc) vault.merge(r.data.doc);
      void live.current.mutate(r.data, { revalidate: false });
    };
    const off = vault.listen((_paths, mine) => {
      tell();
      if (!mine || !live.current.sync) return;
      clearTimeout(timer);
      timer = window.setTimeout(() => { void send().catch(() => undefined); }, 1200);
    });
    useArrange.setState({
      resetAll: () => { vault.clearAll(); },
      setSync: async (on) => {
        if (on) await send();
        else { clearTimeout(timer); const r = await api.delete<Answer>('/arrange'); void live.current.mutate(r.data, { revalidate: false }); }
      },
    });
    tell();
    return () => {
      // A change still waiting goes now.
      if (timer) { clearTimeout(timer); void send().catch(() => undefined); }
      off(); page?.destroy(); menu?.destroy(); parts.current = null;
      useArrange.setState({ arranged: false, any: false, reset: () => undefined, resetAll: () => undefined, sync: null, setSync: async () => undefined });
    };
  }, [userId]);

  // The account's copy (first load, a change on another device): joined into this device's; what this
  // device has that the account lacks goes back.
  useEffect(() => {
    useArrange.setState({ sync: data ? data.sync : null });
    const p = parts.current;
    if (!p || !data?.sync || !data.doc) return;
    p.vault.merge(data.doc);
    if (!sameDoc(p.vault.now(), data.doc)) void api.put<Answer>('/arrange', { doc: p.vault.now() }).then((r) => live.current.mutate(r.data, { revalidate: false })).catch(() => undefined);
  }, [data, userId]);

  useEffect(() => {
    const p = parts.current;
    p?.page?.setPath(pathname);
    // One arrangement per app's menu (`data-arrange-scope` on the side menu).
    p?.menu?.setPath(`/~menu/${document.getElementById('side-nav')?.dataset.arrangeScope ?? 'all'}`);
  }, [pathname, userId]);
  return null;
}

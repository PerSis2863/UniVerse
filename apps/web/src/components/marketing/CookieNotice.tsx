'use client';

import { useEffect, useState } from 'react';
import { Cookie } from 'lucide-react';
import Link from '@/components/ui/Link';

// The cookie notice on the public pages (the launch checklist's "cookie consent banner"). UniVerse
// only uses cookies and storage it needs to work (sign-in, settings), with no analytics or
// advertising trackers, so there is nothing to agree to: it says so once, links to the details
// (Privacy choices) and goes away when read. No tracking starts or waits on it.

const KEY = 'uv-cookie-notice';

export function CookieNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let seen = true;
    try { seen = localStorage.getItem(KEY) === '1'; } catch { /* storage off: don't nag */ }
    if (!seen) queueMicrotask(() => setShow(true));
  }, []);
  if (!show) return null;
  const close = () => { setShow(false); try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ } };
  return (
    <div role="region" aria-label="Cookies" className="fixed z-[70] bottom-4 inset-x-4 sm:inset-x-auto sm:start-6 sm:max-w-sm rounded-2xl border border-white/10 bg-[#0d0f1d]/95 p-4 shadow-2xl shadow-black/50 text-sm text-zinc-200 rise-in">
      <p className="flex gap-2.5"><Cookie className="w-4 h-4 mt-0.5 shrink-0 text-fuchsia-300" aria-hidden />
        <span>We only use the cookies UniVerse needs to work, like keeping you signed in. No ads, no tracking.</span></p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Link href="/privacy-choices" className="h-9 px-3 inline-flex items-center rounded-full text-zinc-300 hover:text-white hover:bg-white/[0.06]">Details</Link>
        <button type="button" onClick={close} className="btn-primary !h-9 !px-4 !text-sm">OK</button>
      </div>
    </div>
  );
}

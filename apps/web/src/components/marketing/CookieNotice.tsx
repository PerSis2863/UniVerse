'use client';

import { useEffect, useState } from 'react';
import { Cookie } from 'lucide-react';
import Link from '@/components/ui/Link';
import { type CookieChoice, CHOICE_EVENT, cookieChoice, privacySignal, setCookieChoice } from '@/lib/cookie-consent';

// The cookie notice on the public pages (the launch checklist's "cookie consent banner"): asks once,
// with "Essential only" as easy as "Accept all", and links to the details (Privacy choices, where
// the choice can be changed). UniVerse uses only essential cookies today; the choice is for anything
// optional added later (src/lib/cookie-consent.ts). Not shown when the browser sends Global Privacy
// Control: that already means no.

const BTN = '!h-9 !px-4 !text-sm';
// The banner and Privacy choices are always dark, so the second button is styled for dark, not by theme.
const PLAIN = 'h-9 px-4 inline-flex items-center rounded-full border border-white/20 text-sm font-medium text-white hover:bg-white/10';

export function CookieNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!cookieChoice() && !privacySignal()) queueMicrotask(() => setShow(true));
  }, []);
  if (!show) return null;
  const choose = (c: CookieChoice) => { setCookieChoice(c); setShow(false); };
  return (
    <div role="region" aria-label="Cookies" className="fixed z-[70] bottom-4 inset-x-4 sm:inset-x-auto sm:start-6 sm:max-w-sm rounded-2xl border border-white/10 bg-[#131a3d]/95 backdrop-blur-md p-4 shadow-2xl shadow-black/50 text-sm text-zinc-200 rise-in">
      <p className="flex gap-2.5"><Cookie className="w-4 h-4 mt-0.5 shrink-0 text-fuchsia-300" aria-hidden />
        <span>We use the cookies UniVerse needs to work, like keeping you signed in. May we also use optional ones? <Link href="/privacy-choices" className="underline underline-offset-2 text-white">Details</Link></span></p>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={() => choose('essential')} className={PLAIN}>Essential only</button>
        <button type="button" onClick={() => choose('all')} className={`btn-primary ${BTN}`}>Accept all</button>
      </div>
    </div>
  );
}

/** The same choice on Privacy choices, to change it at any time. */
export function CookieChoiceControl() {
  const [choice, setChoice] = useState<CookieChoice | null>(null);
  const [signal, setSignal] = useState(false);
  useEffect(() => {
    const read = () => { setChoice(cookieChoice()); setSignal(privacySignal()); };
    queueMicrotask(read);
    window.addEventListener(CHOICE_EVENT, read);
    return () => window.removeEventListener(CHOICE_EVENT, read);
  }, []);
  if (signal) return <p className="text-sm text-zinc-400">Your browser sends Global Privacy Control, so only essential cookies are used.</p>;
  return (
    <div role="group" aria-label="Optional cookies" className="flex flex-wrap gap-2">
      {([['essential', 'Essential only'], ['all', 'Accept all']] as const).map(([c, label]) => (
        <button key={c} type="button" aria-pressed={choice === c} onClick={() => setCookieChoice(c)}
          className={choice === c ? `btn-primary ${BTN}` : PLAIN}>{label}</button>
      ))}
    </div>
  );
}

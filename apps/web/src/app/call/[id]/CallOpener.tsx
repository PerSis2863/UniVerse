'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Loader2, PhoneOff } from 'lucide-react';
import Link from '@/components/ui/Link';
import { useCalls } from '@/store/calls';
import { useAuthStore } from '@/store/auth';

/**
 * Opens the call named in the address (/call/<id>?kind=audio|video) full screen. The id comes from the
 * address, not the route's params: every call is served the same page built ahead of time
 * (/call/open, see cloudflare/worker.ts). Until the call's screen covers it, it says so (a slow
 * phone used to see a black page, reported as "Blank page"), and someone signed out is asked to sign in.
 */
export function CallOpener() {
  const path = usePathname();
  const id = decodeURIComponent(path.split('/')[2] ?? '');
  const kind = useSearchParams().get('kind');
  const signedIn = useAuthStore((s) => !!s.user);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!id || id === 'open' || !signedIn) return;
    useCalls.getState().open(id, kind === 'audio' ? 'audio' : kind === 'video' ? 'video' : undefined);
    const t = setTimeout(() => setSlow(true), 12_000);
    return () => clearTimeout(t);
  }, [id, kind, signedIn]);

  return (
    <div className="fixed inset-0 grid place-items-center p-6 text-center text-zinc-300">
      {!signedIn ? (
        <div>
          <PhoneOff className="w-8 h-8 mx-auto text-zinc-500" aria-hidden />
          <p className="mt-3 font-semibold text-white">Sign in to join this call</p>
          <Link href={`/login?next=${encodeURIComponent(path)}`} className="mt-4 btn-primary inline-flex">Sign in</Link>
        </div>
      ) : slow ? (
        <div role="status">
          <p className="font-semibold text-white">The call is taking long to open</p>
          <p className="mt-1 text-sm">Check your connection, then try again.</p>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" onClick={() => window.location.reload()} className="btn-primary">Try again</button>
            <Link href="/calls" className="btn-secondary">Back to calls</Link>
          </div>
        </div>
      ) : (
        <p role="status" className="inline-flex items-center gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Opening the call…</p>
      )}
    </div>
  );
}

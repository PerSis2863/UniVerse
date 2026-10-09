'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import { Clock, Eye, Link2Off } from 'lucide-react';
import Link from '@/components/ui/Link';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LogoMark } from '@/components/ui/LogoMark';
import { ChildView, type ChildData } from '@/components/guardian/ChildView';

// What a parent or guardian sees from a student's shared link: read-only, no sign-in.

type GuardianView = ChildData & { expiresAt: string };

export default function GuardianPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<GuardianView | null>(null);
  const [problem, setProblem] = useState<'expired' | 'invalid' | 'offline' | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/guardian/${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (r.status === 410) throw new Error('expired');
        if (r.status === 404) throw new Error('invalid');
        if (!r.ok) throw new Error('offline');
        return r.json() as Promise<GuardianView>;
      })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: Error) => { if (!cancelled) setProblem(e.message === 'expired' || e.message === 'invalid' ? e.message : 'offline'); });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <main className="min-h-screen px-4 py-6 sm:py-10" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-3xl mx-auto">
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 font-black text-zinc-900 dark:text-white min-h-11">
            <LogoMark className="w-7 h-7" /> UniVerse
          </Link>
          <span className="text-[11px] text-zinc-500 inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> Read-only view</span>
        </div>

        {problem ? (
          <div className="rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-8 sm:p-10 text-center">
            <span className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 border border-indigo-500/20 flex items-center justify-center">
              {problem === 'expired' ? <Clock className="w-7 h-7 text-indigo-500" /> : <Link2Off className="w-7 h-7 text-indigo-500" />}
            </span>
            <h1 className="mt-4 text-xl font-black text-zinc-900 dark:text-white">
              {problem === 'expired' ? 'This link has expired' : problem === 'invalid' ? 'This link doesn’t work' : 'Couldn’t load this page'}
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300 max-w-md mx-auto">
              {problem === 'offline'
                ? 'Please check your internet connection and try again in a moment.'
                : 'Ask your student to make a new link: in UniVerse, they open Settings, then “Parent or guardian”, and share it with you again.'}
            </p>
            {problem === 'offline' && <button onClick={() => location.reload()} className="btn-primary min-h-11 mt-5">Try again</button>}
          </div>
        ) : !data ? (
          <div className="p-16"><ContentSkeleton variant="list" /></div>
        ) : (
          <ChildView data={data} eyebrow={`Shared with you by ${data.firstName}`} note={`Up to date as of today. This link works until ${format(new Date(data.expiresAt), 'd MMMM yyyy')}.`} />
        )}
        <p className="mt-8 text-center text-[11px] text-zinc-500">UniVerse Impact · <Link href="/privacy" className="hover:underline">Privacy</Link></p>
      </div>
    </main>
  );
}

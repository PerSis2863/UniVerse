'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck, UserX } from 'lucide-react';
import { usePathParams } from '@/hooks/usePathParams';
import { AddressLoading } from '@/components/layout/AddressLoading';
import Link from '@/components/ui/Link';
import { PassportView, type PassportData } from '@/components/passport/PassportView';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LogoMark } from '@/components/ui/LogoMark';
import { PASSPORT_THEME_CLASS, cleanPassportTheme, type PassportTheme } from '@/lib/passport-theme';

type Portfolio = PassportData & {
  theme?: PassportTheme;
  projects?: { title: string; organization: string; hours: number; credentialTitle: string; verifyUrl: string }[];
};

function PortfolioPage({ handle }: { handle: string }) {
  const [p, setP] = useState<Portfolio | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/p/${encodeURIComponent(handle)}`)
      .then(async (r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { if (!cancelled) { setP(d); document.title = `${d.name} · Portfolio · UniVerse`; } })
      .catch(() => { if (!cancelled) setMissing(true); });
    return () => { cancelled = true; };
  }, [handle]);

  const theme = cleanPassportTheme(p?.theme);
  const themeCls = PASSPORT_THEME_CLASS[theme];

  return (
    <main className="min-h-screen px-4 py-8 sm:py-12" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-3xl mx-auto">
        <div className="mb-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-black text-zinc-900 dark:text-white"><LogoMark className="w-7 h-7" /> UniVerse</Link>
          <span className={`text-[11px] inline-flex items-center gap-1 ${themeCls.ring}`}><BadgeCheck className="w-3.5 h-3.5" /> Public portfolio</span>
        </div>
        {missing ? (
          <div className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-10 text-center">
            <UserX className="w-10 h-10 mx-auto text-zinc-400" />
            <h1 className="mt-3 text-lg font-bold text-zinc-900 dark:text-white">This portfolio isn’t available</h1>
            <p className="mt-1 text-sm text-zinc-500">The address may be wrong, or its owner made it private.</p>
          </div>
        ) : !p ? (
          <div className="p-16"><ContentSkeleton variant="list" /></div>
        ) : (
          <>
            <div className={`mb-4 h-1.5 rounded-full bg-gradient-to-r ${themeCls.accent}`} aria-hidden />
            <PassportView p={p} theme={theme} />
            {!!p.projects?.length && (
              <section className="mt-5 rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6">
                <h2 className="font-bold text-zinc-900 dark:text-white">Projects</h2>
                <ul className="mt-3 space-y-2">
                  {p.projects.map((pr) => (
                    <li key={pr.verifyUrl} className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] p-4">
                      <p className="font-semibold text-zinc-900 dark:text-white">{pr.title}</p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-300">{pr.credentialTitle} · {pr.organization}</p>
                      <p className="text-xs text-zinc-500 mt-1">{pr.hours} verified hours · <a href={pr.verifyUrl} className="text-indigo-500 hover:underline">Verify</a></p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <p className="mt-6 text-center text-xs text-zinc-500">Employers: verify a certificate code at <Link href="/verify" className="text-indigo-500 hover:underline">/verify</Link></p>
          </>
        )}
      </div>
    </main>
  );
}

export default function PortfolioRoute() {
  const p = usePathParams('/p/[handle]');
  return p ? <PortfolioPage key={p.handle} handle={p.handle} /> : <AddressLoading />;
}

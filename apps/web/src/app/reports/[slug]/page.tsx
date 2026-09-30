'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Download, FileX2, Loader2, Printer } from 'lucide-react';
import Link from '@/components/ui/Link';
import { ReportView, type ReportData } from '@/components/reports/ReportView';

interface Resp { slug: string; url: string; issuedBy: string; issuedAt: string; data: ReportData; verification: { verified: boolean; signatureValid: boolean; matches: boolean } }

export default function PublicReportPage() {
  const { slug } = useParams<{ slug: string }>();
  const [r, setR] = useState<Resp | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/impact-reports/public/${encodeURIComponent(slug)}`)
      .then(async (x) => { if (!x.ok) throw new Error(); return x.json(); })
      .then((d: Resp) => { if (!cancelled) { setR(d); document.title = `${d.data.title} · UniVerse`; } })
      .catch(() => { if (!cancelled) setMissing(true); });
    return () => { cancelled = true; };
  }, [slug]);

  return (
    <main className="min-h-screen px-4 py-8 sm:py-12 print:p-0" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-5 flex flex-wrap items-center gap-3 justify-between print:hidden">
          <Link href="/" className="flex items-center gap-2 font-black text-zinc-900 dark:text-white"><span className="w-7 h-7 rounded-lg bg-indigo-600 text-white text-xs flex items-center justify-center">U</span> UniVerse</Link>
          {r && (
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-sm font-semibold text-zinc-700 dark:text-zinc-200"><Printer className="w-4 h-4" /> Print / PDF</button>
              <a href={`/api/impact-reports/public/${encodeURIComponent(slug)}?format=csv`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-sm font-semibold text-zinc-700 dark:text-zinc-200"><Download className="w-4 h-4" /> CSV</a>
              <a href={`/api/impact-reports/public/${encodeURIComponent(slug)}?format=jwt`} title="The signed snapshot, for auditors (check it with the public key at /api/passport/jwks)" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-sm font-semibold text-zinc-700 dark:text-zinc-200"><Download className="w-4 h-4" /> Signed file</a>
            </div>
          )}
        </div>
        {missing ? (
          <div className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-10 text-center">
            <FileX2 className="w-10 h-10 mx-auto text-zinc-400" />
            <h1 className="mt-3 text-lg font-bold text-zinc-900 dark:text-white">This report isn’t available</h1>
            <p className="mt-1 text-sm text-zinc-500">The link may be wrong, or the report was withdrawn.</p>
          </div>
        ) : !r ? <div className="p-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div> : <ReportView d={r.data} verification={r.verification} />}
        <p className="mt-8 text-center text-[11px] text-zinc-500">UniVerse Impact · Paris, France</p>
      </div>
    </main>
  );
}

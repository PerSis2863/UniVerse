'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { BadgeCheck, Loader2, ShieldAlert, ShieldCheck, UserX } from 'lucide-react';
import Link from '@/components/ui/Link';
import { PassportView, type PassportData } from '@/components/passport/PassportView';

type VerifyResult = { valid: true; badge: { name?: string; earner?: string; criteria?: string; issued?: string; verifyUrl?: string } } | { valid: false; reason: string };

export default function PublicPassportPage() {
  const { slug } = useParams<{ slug: string }>();
  const [p, setP] = useState<PassportData | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/passport/public/${encodeURIComponent(slug)}`)
      .then(async (r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { if (!cancelled) { setP(d); document.title = `${d.name} · Skills passport · UniVerse`; } })
      .catch(() => { if (!cancelled) setMissing(true); });
    return () => { cancelled = true; };
  }, [slug]);

  return (
    <main className="min-h-screen px-4 py-8 sm:py-12" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-3xl mx-auto">
        <div className="mb-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-black text-zinc-900 dark:text-white"><span className="w-7 h-7 rounded-lg bg-indigo-600 text-white text-xs flex items-center justify-center">U</span> UniVerse</Link>
          <span className="text-[11px] text-zinc-500 inline-flex items-center gap-1"><BadgeCheck className="w-3.5 h-3.5 text-emerald-500" /> Credentials verified by UniVerse Impact</span>
        </div>
        {missing ? (
          <div className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-10 text-center">
            <UserX className="w-10 h-10 mx-auto text-zinc-400" />
            <h1 className="mt-3 text-lg font-bold text-zinc-900 dark:text-white">This passport isn’t available</h1>
            <p className="mt-1 text-sm text-zinc-500">The link may be wrong, or its owner made it private.</p>
          </div>
        ) : !p ? (
          <div className="p-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
        ) : (
          <>
            <PassportView p={p} />
            <BadgeVerifier />
          </>
        )}
        <p className="mt-8 text-center text-[11px] text-zinc-500">UniVerse Impact · Paris, France · <Link href="/privacy" className="hover:underline">Privacy</Link></p>
      </div>
    </main>
  );
}

/** Lets an employer paste an Open Badge (.jwt) to check it. */
function BadgeVerifier() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const check = async () => {
    setBusy(true); setResult(null);
    try {
      const r = await fetch('/api/passport/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ badge: text }) });
      const d = await r.json();
      setResult(r.ok ? d : { valid: false, reason: d.error || 'Couldn’t check this badge.' });
    } catch { setResult({ valid: false, reason: 'The check couldn’t be completed. Try again in a moment.' }); }
    finally { setBusy(false); }
  };
  return (
    <section className="mt-5 rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full flex items-center gap-2 text-left font-bold text-zinc-900 dark:text-white"><ShieldCheck className="w-5 h-5 text-indigo-500" /> Verify an Open Badge file <span className="ml-auto text-xs font-normal text-zinc-500">{open ? 'Hide' : 'Show'}</span></button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-zinc-500">Paste the contents of a badge file (.jwt) you received from this person. We check the signature, that UniVerse issued it, and that it hasn’t been revoked.</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} aria-label="Badge" placeholder="eyJhbGciOiJFZERTQSIs…" className="w-full rounded-xl bg-zinc-100 dark:bg-white/[0.06] p-3 font-mono text-xs text-zinc-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500/40" />
          <button onClick={check} disabled={busy || !text.trim()} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Check badge</button>
          {result && (!("reason" in result) ? (
            <div role="status" className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-sm text-emerald-800 dark:text-emerald-200">
              <p className="font-bold flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Valid badge</p>
              <p className="mt-1">{result.badge.name}{result.badge.earner ? ` — earned by ${result.badge.earner}` : ''}{result.badge.issued ? `, ${new Date(result.badge.issued).toLocaleDateString()}` : ''}.</p>
              {result.badge.criteria && <p className="mt-1 text-xs opacity-80">{result.badge.criteria}</p>}
            </div>
          ) : (
            <div role="status" className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-4 text-sm text-rose-700 dark:text-rose-300">
              <p className="font-bold flex items-center gap-1.5"><ShieldAlert className="w-4 h-4" /> Not valid</p>
              <p className="mt-1">{result.reason}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

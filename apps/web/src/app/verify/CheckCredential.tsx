'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, Loader2, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import Link from '@/components/ui/Link';
import { LogoMark } from '@/components/ui/LogoMark';

// For employers and universities (Stage 5 · Q14): check a credential someone gave them, with no
// account. A certificate code (as printed on the certificate: "UV-…") opens its verification page;
// a badge file (.jwt) or wallet file (.vc.json) is checked here: its signature, that UniVerse
// issued it, and that it hasn't been withdrawn.

type Result = { valid: true; badge: { name?: string; earner?: string; criteria?: string; issued?: string; verifyUrl?: string } } | { valid: false; reason: string };

export default function CheckCredential() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const check = async (raw: string) => {
    setBusy(true); setResult(null);
    try {
      const r = await fetch('/api/passport/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ badge: raw }) });
      const d = await r.json();
      setResult(r.ok ? d : { valid: false, reason: d.error || 'Couldn’t check it.' });
    } catch { setResult({ valid: false, reason: 'The check couldn’t be completed. Try again in a moment.' }); }
    finally { setBusy(false); }
  };
  const readFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 60_000) return setResult({ valid: false, reason: 'That file is too big to be a UniVerse credential.' });
    const t = (await f.text()).trim();
    setText(t);
    void check(t);
  };

  return (
    <main className="min-h-screen px-4 py-8 sm:py-12" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-2xl mx-auto space-y-5">
        <Link href="/" className="inline-flex items-center gap-2 font-black text-zinc-900 dark:text-white"><LogoMark className="w-7 h-7" /> UniVerse</Link>
        <header>
          <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white">Check a credential</h1>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">For employers and universities: see whether a certificate, badge or wallet credential was really issued by UniVerse. No account needed.</p>
        </header>

        <section aria-labelledby="by-code" className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5">
          <h2 id="by-code" className="font-bold text-zinc-900 dark:text-white">With the certificate code</h2>
          <form className="mt-3 flex flex-col sm:flex-row gap-2" onSubmit={(e) => { e.preventDefault(); const c = code.trim(); if (c) router.push(`/verify/${encodeURIComponent(c)}`); }}>
            <label htmlFor="cert-code" className="sr-only">Certificate code</label>
            <input id="cert-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={80} autoComplete="off" placeholder="UV-2026-…" className="input flex-1 font-mono" />
            <button type="submit" disabled={!code.trim()} className="btn-primary"><Search className="w-4 h-4" />Check</button>
          </form>
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">The code is printed on the certificate, under its QR code.</p>
        </section>

        <section aria-labelledby="by-file" className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 space-y-3">
          <h2 id="by-file" className="font-bold text-zinc-900 dark:text-white">With a badge or wallet file</h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">An Open Badge (.jwt) or a W3C wallet credential (.vc.json) the person sent you.</p>
          <label className="btn-secondary w-full sm:w-auto cursor-pointer">
            <FileUp className="w-4 h-4" aria-hidden />Choose a file
            <input type="file" accept=".jwt,.json,.txt,application/json,application/jwt" className="sr-only" onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <label htmlFor="cred-text" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Or paste its text</label>
          <textarea id="cred-text" value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="eyJhbGciOiJFZERTQSIs…  or  { &quot;@context&quot;: … }" className="input font-mono text-xs" />
          <button type="button" onClick={() => void check(text.trim())} disabled={busy || !text.trim()} className="btn-primary">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Check it</button>
          {result && (result.valid === true ? (
            <div role="status" className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-4 text-sm text-emerald-900 dark:text-emerald-100">
              <p className="font-bold flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" />Genuine: issued by UniVerse</p>
              <p className="mt-1">{result.badge.name}{result.badge.earner ? `, earned by ${result.badge.earner}` : ''}{result.badge.issued ? `, ${new Date(result.badge.issued).toLocaleDateString()}` : ''}.</p>
              {result.badge.criteria && <p className="mt-1 text-xs">{result.badge.criteria}</p>}
            </div>
          ) : (
            <div role="status" className="rounded-2xl bg-rose-500/10 border border-rose-500/30 p-4 text-sm text-rose-800 dark:text-rose-200">
              <p className="font-bold flex items-center gap-1.5"><ShieldAlert className="w-4 h-4" />Not valid</p>
              <p className="mt-1">{result.reason}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

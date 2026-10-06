'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useParams } from 'next/navigation';
import { BadgeCheck, Download, Loader2, ScanLine, ShieldAlert, ShieldCheck, UserX } from 'lucide-react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { spring } from '@/lib/motion';
import Link from '@/components/ui/Link';
import { PassportView, type PassportData } from '@/components/passport/PassportView';
import { CopyLinkButton } from '@/components/passport/CredentialShare';
import { QrCode } from '@/components/ui/QrCode';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';

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
          <div className="p-16"><ContentSkeleton variant="list" /></div>
        ) : (
          <>
            <PassportView p={p} />
            {!!p.evidence?.some((g) => g.count > 0) && <VerifyPassport slug={slug} name={p.name} />}
            <PassportQr name={p.name} />
            <BadgeVerifier />
          </>
        )}
        <p className="mt-8 text-center text-[11px] text-zinc-500">UniVerse Impact · Paris, France · <Link href="/privacy" className="hover:underline">Privacy</Link></p>
      </div>
    </main>
  );
}

/** Checks the passport's skills with evidence: fetches its signed badge and verifies the signature
 *  with the same public check employers can use (/api/passport/verify). */
function VerifyPassport({ slug, name }: { slug: string; name: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'bad'>('idle');
  const [detail, setDetail] = useState<{ text: string; jwt?: string; fileName?: string }>({ text: '' });
  const run = async () => {
    setState('busy');
    try {
      const b = await fetch(`/api/passport/public/${encodeURIComponent(slug)}/badge`);
      const badge = await b.json();
      if (!b.ok) throw new Error(badge.error || 'Couldn’t get the signed badge.');
      const r = await fetch('/api/passport/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ badge: badge.jwt }) });
      const v = await r.json();
      if (r.ok && v.valid) { setDetail({ text: v.badge?.criteria ?? '', jwt: badge.jwt, fileName: badge.fileName }); setState('ok'); }
      else { setDetail({ text: v.reason || v.error || 'Not valid.' }); setState('bad'); }
    } catch (e) { setDetail({ text: (e as Error).message }); setState('bad'); }
  };
  const save = () => {
    if (!detail.jwt) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([detail.jwt], { type: 'application/jwt' }));
    a.download = `${detail.fileName ?? 'skills-badge'}.jwt`;
    a.click();
  };
  return (
    <section className="mt-5 rounded-3xl border border-emerald-500/20 bg-emerald-500/[0.05] p-5">
      <div className="flex flex-wrap items-center gap-3">
        <ShieldCheck className="w-6 h-6 text-emerald-500 shrink-0" />
        <div className="flex-1 min-w-[12rem]">
          <p className="font-bold text-zinc-900 dark:text-white">Verify {name}’s skills</p>
          <p className="text-xs text-zinc-500">Checks the digital signature on these skills and their evidence (Open Badges 3.0).</p>
        </div>
        <button onClick={run} disabled={state === 'busy'} className="btn-primary">{state === 'busy' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Verify</button>
      </div>
      <AnimatePresence>
        {(state === 'ok' || state === 'bad') && (
          <motion.div key={state} role="status" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring.smooth}
            className={state === 'ok' ? 'mt-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-sm text-emerald-800 dark:text-emerald-200' : 'mt-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 p-4 text-sm text-rose-700 dark:text-rose-300'}>
            <p className="font-bold flex items-center gap-1.5">{state === 'ok' ? <><ShieldCheck className="w-4 h-4" /> Verified: signed by UniVerse Impact</> : <><ShieldAlert className="w-4 h-4" /> Couldn’t verify</>}</p>
            {detail.text && <p className="mt-1 text-xs opacity-90 break-words">{detail.text}</p>}
            {state === 'ok' && <button onClick={save} className="mt-2 text-xs font-semibold inline-flex items-center gap-1 hover:underline"><Download className="w-3.5 h-3.5" /> Download the signed badge</button>}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

const noSubscribe = () => () => {};

/** A QR code of this page, so a recruiter at a fair can open it on their phone. */
function PassportQr({ name }: { name: string }) {
  // The address is only known in the browser; strip any query or hash so the code stays short
  const url = useSyncExternalStore(noSubscribe, () => `${window.location.origin}${window.location.pathname}`, () => '');
  if (!url) return null;
  return (
    <section className="mt-5 tone-panel rounded-3xl border border-zinc-200 dark:border-white/10 p-5 sm:p-6 flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
      <div className="rounded-2xl p-1.5 bg-gradient-to-br from-indigo-500 to-fuchsia-500 shrink-0">
        <QrCode value={url} size={132} className="rounded-xl block" title={`QR code for ${name}'s skills passport`} />
      </div>
      <div className="min-w-0">
        <p className="font-bold text-zinc-900 dark:text-white flex items-center justify-center sm:justify-start gap-2"><ScanLine className="w-5 h-5 text-fuchsia-500" /> Scan to open this passport</p>
        <p className="mt-1 text-xs text-zinc-500">Point a phone camera at the code to open {name}’s passport and check each credential.</p>
        <p className="mt-2 text-[11px] text-zinc-400 break-all">{url}</p>
        <CopyLinkButton url={url} label="Copy passport link" copiedMessage="Passport link copied" className="btn-secondary mt-3" />
      </div>
    </section>
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
          <button onClick={check} disabled={busy || !text.trim()} className="btn-primary">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Check badge</button>
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

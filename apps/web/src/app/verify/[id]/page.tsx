'use client';

import { useEffect, useState } from 'react';
import Link from '@/components/ui/Link';
import { useParams } from 'next/navigation';
import { ShieldCheck, ShieldAlert, ShieldX, SearchX, Loader2, Clock, Globe2, Building2, ChevronDown, ChevronUp, Copy, Link2, ExternalLink, Award, CalendarDays, UserCheck } from 'lucide-react';

import { API_URL } from '@/lib/api';
import { safeHref } from '@/lib/safe-href';
import { QrCode } from '@/components/ui/QrCode';
import { CopyLinkButton } from '@/components/passport/CredentialShare';

type VerifyResult = 'VALID' | 'REVOKED' | 'TAMPERED' | 'UNKNOWN_KEY' | 'NOT_FOUND';

interface VerifyResponse {
  result: VerifyResult;
  credential?: {
    id: string;
    certificateCode: string;
    holderName: string;
    title: string;
    projectName: string;
    organization: string;
    hoursCompleted: number;
    peopleImpacted: number;
    description: string | null;
    verifiedByName: string | null;
    issuedAt: string;
    revokedAt: string | null;
    revokedReason: string | null;
  };
  proof?: { hash: string; signature: string; alg: string; keyId: string; payload: unknown };
  blockchain?: {
    status: 'PENDING' | 'CONFIRMED' | 'FAILED' | null;
    network: string | null;
    txHash: string;
    explorerUrl: string | null;
    anchoredAt: string | null;
    onChain: { checked: boolean; matches: boolean; blockNumber?: number; blockTime?: string; reason?: string };
  } | null;
}

const RESULT_UI: Record<VerifyResult, { badge: string; title: string; text: string; icon: typeof ShieldCheck; tone: string; ring: string }> = {
  VALID: {
    badge: 'Valid',
    title: 'This credential is genuine',
    text: 'Issued by UniVerse Impact after staff checked the work, and unchanged since it was signed.',
    icon: ShieldCheck,
    tone: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
    ring: 'from-emerald-400 to-teal-500',
  },
  REVOKED: {
    badge: 'Revoked',
    title: 'This credential was revoked',
    text: 'It was genuinely issued by UniVerse Impact but has since been withdrawn. It should no longer be relied on.',
    icon: ShieldX,
    tone: 'text-red-700 dark:text-red-300 bg-red-500/10 border-red-500/30',
    ring: 'from-red-500 to-rose-500',
  },
  TAMPERED: {
    badge: 'Not valid',
    title: 'Verification failed',
    text: 'The stored details do not match the signed original. Do not rely on this credential.',
    icon: ShieldAlert,
    tone: 'text-red-700 dark:text-red-300 bg-red-500/10 border-red-500/30',
    ring: 'from-red-500 to-rose-500',
  },
  UNKNOWN_KEY: {
    badge: 'Can’t check',
    title: 'Cannot be verified right now',
    text: 'This credential was signed with a key the platform no longer recognises. Contact UniVerse Impact support.',
    icon: ShieldAlert,
    tone: 'text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/30',
    ring: 'from-amber-400 to-orange-500',
  },
  NOT_FOUND: {
    badge: 'Not found',
    title: 'No credential found',
    text: 'There is no issued credential with this ID. Check the link or certificate code and try again.',
    icon: SearchX,
    tone: 'text-zinc-700 dark:text-zinc-300 bg-zinc-500/10 border-zinc-500/30',
    ring: 'from-zinc-400 to-zinc-500',
  },
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

export default function VerifyCredentialPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? decodeURIComponent(params.id) : '';
  // The answer is kept with the ID it belongs to, so opening another ID shows "checking" again
  const [loaded, setLoaded] = useState<{ id: string; data?: VerifyResponse; error?: string } | null>(null);
  const [showProof, setShowProof] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch(`${API_URL}/verify/${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Verification service returned ${res.status}`);
        return (await res.json()) as VerifyResponse;
      })
      .then((json) => { if (!cancelled) setLoaded({ id, data: json }); })
      .catch(() => { if (!cancelled) setLoaded({ id, error: 'The verification service could not be reached. Please try again in a moment.' }); });
    return () => { cancelled = true; };
  }, [id]);
  const data = loaded?.id === id ? loaded.data ?? null : null;
  const error = loaded?.id === id ? loaded.error ?? null : null;

  const ui = data ? RESULT_UI[data.result] ?? RESULT_UI.NOT_FOUND : null;
  const c = data?.credential;
  // Always link the QR to the canonical address (the ID, not a certificate code someone typed)
  const selfUrl = c && typeof window !== 'undefined' ? `${window.location.origin}/verify/${encodeURIComponent(c.id)}` : '';

  return (
    <main className="min-h-screen px-4 py-8 sm:py-14 overflow-x-hidden" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 font-black text-zinc-900 dark:text-white"><span className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white text-xs flex items-center justify-center">U</span> UniVerse Impact</Link>
          <span className="text-[11px] text-zinc-500 hidden sm:inline">Credential verification</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black mt-6" style={{ color: 'var(--text-primary)' }}>Is this credential genuine?</h1>
        <p className="text-sm text-zinc-500 mt-1">Every time this page opens, we check the digital signature and whether the credential is still active.</p>

        {!data && !error && (
          <div className="mt-8 tone-panel rounded-3xl border border-zinc-200 dark:border-white/10 p-8 flex items-center justify-center gap-3 text-zinc-500" role="status"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /> Checking credential…</div>
        )}

        {error && (
          <div className="mt-8 p-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-sm" role="alert">{error}</div>
        )}

        {ui && data && (
          <section className="mt-8 tone-panel relative overflow-hidden rounded-3xl border border-zinc-200 dark:border-white/10 shadow-xl shadow-indigo-500/5" aria-live="polite">
            <div aria-hidden className={`h-1.5 bg-gradient-to-r ${data.result === 'VALID' ? 'from-indigo-500 via-violet-500 to-fuchsia-500' : ui.ring}`} />
            <div className="p-5 sm:p-7">
              <div className="flex items-start gap-4">
                <div className={`shrink-0 rounded-2xl p-[2px] bg-gradient-to-br ${ui.ring}`}>
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-[14px] bg-white dark:bg-zinc-950 flex items-center justify-center">
                    <ui.icon className={`w-7 h-7 sm:w-8 sm:h-8 ${ui.tone.split(' ').slice(0, 2).join(' ')}`} />
                  </div>
                </div>
                <div className="min-w-0">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${ui.tone}`}>{ui.badge}</span>
                  <h2 className="font-black text-lg sm:text-xl mt-1.5" style={{ color: 'var(--text-primary)' }}>{ui.title}</h2>
                  <p className="text-sm mt-1 text-zinc-600 dark:text-zinc-400">{ui.text}</p>
                  {data.result === 'REVOKED' && (c?.revokedAt || c?.revokedReason) && (
                    <p className="text-sm mt-2 text-red-700 dark:text-red-300">
                      {c?.revokedAt ? `Revoked on ${fmtDate(c.revokedAt)}` : 'Revoked'}{c?.revokedReason ? ` · Reason: ${c.revokedReason}` : ''}
                    </p>
                  )}
                </div>
              </div>

              {c && (
                <div className="mt-6 grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">Awarded to</p>
                    <p className="text-xl sm:text-2xl font-black mt-0.5 break-words" style={{ color: 'var(--text-primary)' }}>{c.holderName}</p>
                    <p className="mt-4 text-[11px] uppercase tracking-wider text-zinc-500">Credential</p>
                    <p className={`text-lg font-bold mt-0.5 break-words ${data.result === 'VALID' ? 'bg-gradient-to-r from-indigo-600 to-fuchsia-600 dark:from-indigo-300 dark:to-fuchsia-300 bg-clip-text text-transparent' : ''}`} style={data.result === 'VALID' ? undefined : { color: 'var(--text-primary)' }}>{c.title}</p>
                    <p className="text-sm text-zinc-500 mt-0.5 break-words">{c.projectName}</p>
                    {c.description && <p className="text-sm mt-3 break-words" style={{ color: 'var(--text-secondary)' }}>{c.description}</p>}
                  </div>
                  {selfUrl && (
                    <div className="flex flex-col items-center gap-1.5 sm:pl-2">
                      <div className="rounded-2xl p-1.5 bg-gradient-to-br from-indigo-500 to-fuchsia-500">
                        <QrCode value={selfUrl} size={120} className="rounded-xl block" title="QR code for this verification page" />
                      </div>
                      <span className="text-[11px] text-zinc-500">Scan to check again</span>
                    </div>
                  )}
                </div>
              )}

              {c && (
                <dl className="grid grid-cols-2 gap-3 mt-6">
                  <Fact icon={Award} label="Issued by" value="UniVerse Impact" />
                  <Fact icon={Building2} label="Partner organisation" value={c.organization} />
                  <Fact icon={CalendarDays} label="Issued on" value={fmtDate(c.issuedAt)} />
                  <Fact icon={UserCheck} label="Checked by" value={c.verifiedByName ?? 'UniVerse staff'} />
                  <Fact icon={Clock} label="Hours" value={String(c.hoursCompleted)} />
                  <Fact icon={Globe2} label="People impacted" value={c.peopleImpacted.toLocaleString()} />
                </dl>
              )}

              {c && (
                <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  {selfUrl && <CopyLinkButton url={selfUrl} className="btn-primary" />}
                  <p className="text-xs text-zinc-500 sm:ml-auto">Certificate <span className="font-mono">{c.certificateCode}</span></p>
                </div>
              )}

              {data.result === 'NOT_FOUND' && (
                <p className="mt-5 text-xs text-zinc-500">Looked up: <span className="font-mono break-all">{id}</span></p>
              )}
            </div>
          </section>
        )}

        {data?.blockchain && (data.result === 'VALID' || data.result === 'REVOKED') && (
          <section className="mt-4 rounded-2xl border p-5" style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--card-bg)' }}>
            <div className="flex items-start gap-3">
              <Link2 className={`w-5 h-5 flex-shrink-0 mt-0.5 ${data.blockchain.onChain.matches ? 'text-emerald-500' : 'text-zinc-400'}`} />
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {data.blockchain.onChain.matches
                    ? `Recorded on ${data.blockchain.network ?? 'the blockchain'}`
                    : data.blockchain.status === 'PENDING'
                      ? `Being recorded on ${data.blockchain.network ?? 'the blockchain'}`
                      : `Blockchain record: ${data.blockchain.onChain.reason ?? 'could not be checked right now'}`}
                </p>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                  {data.blockchain.onChain.matches
                    ? `This credential's fingerprint was written to a public blockchain${data.blockchain.onChain.blockTime ? ` on ${new Date(data.blockchain.onChain.blockTime).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}` : ''}, and we just re-checked it on-chain. The record can't be edited or deleted — not even by UniVerse.`
                    : 'The signature check above does not depend on this record.'}
                </p>
                {data.blockchain.explorerUrl && (
                  <a href={safeHref(data.blockchain.explorerUrl)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 break-all">
                    View transaction <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                )}
              </div>
            </div>
          </section>
        )}

        {data?.proof && (
          <section className="mt-4">
            <button onClick={() => setShowProof(v => !v)} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">
              {showProof ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Technical proof
            </button>
            {showProof && (
              <div className="mt-3 rounded-2xl border p-4 text-xs font-mono break-all space-y-2" style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--card-bg)', color: 'var(--text-primary)' }}>
                <p><span className="text-zinc-500">Algorithm:</span> {data.proof.alg} · <span className="text-zinc-500">Key ID:</span> {data.proof.keyId}</p>
                <p><span className="text-zinc-500">SHA-256:</span> {data.proof.hash}</p>
                <p><span className="text-zinc-500">Signature:</span> {data.proof.signature}</p>
                <button
                  onClick={() => navigator.clipboard?.writeText(JSON.stringify(data.proof?.payload, null, 2)).catch(() => undefined)}
                  className="inline-flex items-center gap-1 text-indigo-500 hover:text-indigo-400 font-sans"
                >
                  <Copy className="w-3 h-3" /> Copy signed W3C credential (JSON)
                </button>
                <p className="font-sans text-zinc-500">
                  Public key: <a className="underline" href={`${API_URL}/verify/public-key`} target="_blank" rel="noopener noreferrer">{API_URL}/verify/public-key</a>
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/60 dark:bg-white/[0.03] p-3">
      <dt className="text-[11px] text-zinc-500 flex items-center gap-1.5"><Icon className="w-3.5 h-3.5 text-indigo-500" /> {label}</dt>
      <dd className="text-sm font-semibold mt-1 break-words" style={{ color: 'var(--text-primary)' }}>{value}</dd>
    </div>
  );
}

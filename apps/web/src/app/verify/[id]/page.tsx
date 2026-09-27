'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ShieldCheck, ShieldAlert, ShieldX, Loader2, Clock, Globe2, Building2, ChevronDown, ChevronUp, Copy, Link2, ExternalLink } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'https://universe-xsku.onrender.com/api').replace(/\/+$/, '');

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

const RESULT_UI: Record<VerifyResult, { title: string; text: string; icon: typeof ShieldCheck; tone: string }> = {
  VALID: {
    title: 'Verified credential',
    text: 'This credential was issued by UniVerse Impact after verification, and it has not been changed since it was signed.',
    icon: ShieldCheck,
    tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  },
  REVOKED: {
    title: 'Credential revoked',
    text: 'This credential was genuinely issued by UniVerse Impact but has since been revoked. It should no longer be relied on.',
    icon: ShieldX,
    tone: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30',
  },
  TAMPERED: {
    title: 'Verification failed',
    text: 'The stored details do not match the signed original. Do not rely on this credential.',
    icon: ShieldAlert,
    tone: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30',
  },
  UNKNOWN_KEY: {
    title: 'Cannot be verified right now',
    text: 'This credential was signed with a key the platform no longer recognises. Contact UniVerse Impact support.',
    icon: ShieldAlert,
    tone: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
  NOT_FOUND: {
    title: 'No verified credential found',
    text: 'There is no issued credential with this ID. Check the link or certificate code and try again.',
    icon: ShieldX,
    tone: 'text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/30',
  },
};

export default function VerifyCredentialPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? decodeURIComponent(params.id) : '';
  const [data, setData] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showProof, setShowProof] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`${API_URL}/verify/${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Verification service returned ${res.status}`);
        return (await res.json()) as VerifyResponse;
      })
      .then((json) => { if (!cancelled) setData(json); })
      .catch(() => { if (!cancelled) setError('The verification service could not be reached. Please try again in a moment.'); });
    return () => { cancelled = true; };
  }, [id]);

  const ui = data ? RESULT_UI[data.result] ?? RESULT_UI.NOT_FOUND : null;
  const c = data?.credential;

  return (
    <main className="min-h-screen px-4 py-10 sm:py-16" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-sm font-bold tracking-tight text-indigo-600 dark:text-indigo-400">UniVerse Impact</Link>
        <h1 className="text-2xl sm:text-3xl font-black mt-2" style={{ color: 'var(--text-primary)' }}>Credential verification</h1>

        {!data && !error && (
          <div className="mt-10 flex items-center gap-3 text-zinc-500"><Loader2 className="w-5 h-5 animate-spin" /> Checking credential…</div>
        )}

        {error && (
          <div className="mt-8 p-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-sm">{error}</div>
        )}

        {ui && (
          <div className={`mt-8 p-5 rounded-2xl border flex items-start gap-4 ${ui.tone}`}>
            <ui.icon className="w-8 h-8 flex-shrink-0" />
            <div>
              <h2 className="font-bold text-lg">{ui.title}</h2>
              <p className="text-sm mt-1 opacity-90">{ui.text}</p>
              {data?.result === 'REVOKED' && c?.revokedReason && <p className="text-sm mt-2">Reason: {c.revokedReason}</p>}
            </div>
          </div>
        )}

        {c && (
          <section className="mt-6 rounded-2xl border p-6" style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--card-bg)' }}>
            <p className="text-xs uppercase tracking-wider text-zinc-500">Awarded to</p>
            <p className="text-xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{c.holderName}</p>
            <p className="text-lg font-semibold mt-4 text-indigo-600 dark:text-indigo-400">{c.title}</p>
            <p className="text-sm text-zinc-500 mt-1">{c.projectName}</p>
            {c.description && <p className="text-sm mt-3" style={{ color: 'var(--text-secondary)' }}>{c.description}</p>}

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
              <div><dt className="text-xs text-zinc-500 flex items-center gap-1"><Building2 className="w-3 h-3" /> Organization</dt><dd className="text-sm font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>{c.organization}</dd></div>
              <div><dt className="text-xs text-zinc-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Hours</dt><dd className="text-sm font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>{c.hoursCompleted}</dd></div>
              <div><dt className="text-xs text-zinc-500 flex items-center gap-1"><Globe2 className="w-3 h-3" /> People impacted</dt><dd className="text-sm font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>{c.peopleImpacted.toLocaleString()}</dd></div>
              <div><dt className="text-xs text-zinc-500">Issued</dt><dd className="text-sm font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>{new Date(c.issuedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</dd></div>
            </dl>
            {c.verifiedByName && <p className="text-xs text-zinc-500 mt-4">Verified by {c.verifiedByName} · Certificate {c.certificateCode}</p>}
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
                  <a href={data.blockchain.explorerUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 break-all">
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

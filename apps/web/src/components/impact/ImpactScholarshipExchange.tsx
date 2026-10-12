'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Award,
  Sparkles,
  ExternalLink,
  QrCode as QrIcon,
  Hash,
} from 'lucide-react';
import { toast } from 'sonner';

interface SponsorPool {
  id: string;
  title: string;
  sponsorName: string;
  sponsorType: string;
  description: string | null;
  totalAmount: number;
  allocatedAmount: number;
  currency: string;
  creditCostPerAward: number;
  awardAmountPerStudent: number;
  minGpa: number;
  status: string;
  remainingAmount: number;
  remainingAwards: number;
  studentBalance: number;
  isEligible: boolean;
}

interface ScholarshipClaim {
  id: string;
  poolId: string;
  studentId: string;
  creditsRedeemed: number;
  awardAmount: number;
  currency: string;
  studentGpa: number;
  academicStanding: string;
  status: string;
  rejectionReason: string | null;
  qrVerificationToken: string;
  claimSignature: string;
  createdAt: string;
  pool: {
    title: string;
    sponsorName: string;
    sponsorType: string;
  };
}

interface LedgerResponse {
  currentBalance: number;
  totalTransactions: number;
  isChainValid: boolean;
  ledger: Array<{
    id: string;
    actionType: string;
    credits: number;
    balanceAfter: number;
    description: string;
    previousHash: string;
    hash: string;
    createdAt: string;
  }>;
}

export function ImpactScholarshipExchange() {
  const [pools, setPools] = useState<SponsorPool[]>([]);
  const [claims, setClaims] = useState<ScholarshipClaim[]>([]);
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [, setLoading] = useState<boolean>(true);
  const [claimingPool, setClaimingPool] = useState<SponsorPool | null>(null);
  const [studentGpa, setStudentGpa] = useState<number>(3.65);
  const [academicStanding, setAcademicStanding] = useState<'GOOD_STANDING' | 'HONORS' | 'DEANS_LIST'>('HONORS');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [selectedClaimQr, setSelectedClaimQr] = useState<ScholarshipClaim | null>(null);
  const [showLedgerDrawer, setShowLedgerDrawer] = useState<boolean>(false);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [poolsRes, claimsRes, ledgerRes] = await Promise.all([
        fetch('/api/scholarships/pools'),
        fetch('/api/scholarships/claims'),
        fetch('/api/scholarships/credits/ledger'),
      ]);

      if (poolsRes.ok) {
        const p = await poolsRes.json();
        setPools(p);
      }
      if (claimsRes.ok) {
        const c = await claimsRes.json();
        setClaims(c);
      }
      if (ledgerRes.ok) {
        const l = await ledgerRes.json();
        setLedger(l);
      }
    } catch (e) {
      console.error('Failed to load scholarship exchange data:', e);
    } finally {
      setLoading(false);
    }
  }

  const handleClaimSubmit = async () => {
    if (!claimingPool) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/scholarships/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId: claimingPool.id,
          studentGpa,
          academicStanding,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to submit claim');
      }

      toast.success('Scholarship award claimed successfully! Institutional review initiated.');
      setClaimingPool(null);
      void loadData();
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to submit scholarship claim');
    } finally {
      setSubmitting(false);
    }
  };

  const copyVerifyLink = (token: string) => {
    const url = `${window.location.origin}/verify/scholarship/${token}`;
    void navigator.clipboard.writeText(url);
    toast.success('Verification link copied to clipboard!');
  };

  const balance = ledger?.currentBalance ?? pools[0]?.studentBalance ?? 85;

  return (
    <div className="space-y-8">
      {/* Top Banner & Credit Balance Card */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Balance Card */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-950 p-6 text-white shadow-xl border border-indigo-500/20">
          <div className="absolute right-0 top-0 -mr-6 -mt-6 h-32 w-32 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-300 border border-indigo-400/30">
              Impact Credit Balance
            </span>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <ShieldCheck className="h-4 w-4" />
              <span>Chain Verified</span>
            </div>
          </div>

          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-black tracking-tight">{balance.toFixed(0)}</span>
            <span className="text-sm font-semibold text-indigo-300">Credits Available</span>
          </div>

          <p className="mt-2 text-xs text-slate-300 leading-relaxed">
            Earned through verified volunteering shifts, project milestones, and impact credentials. Redeemable for direct scholarship pool funding.
          </p>

          <div className="mt-5 flex items-center gap-3 pt-4 border-t border-indigo-800/40">
            <button
              onClick={() => setShowLedgerDrawer(true)}
              className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 transition-colors"
            >
              <Hash className="h-3.5 w-3.5" />
              Audit Ledger ({ledger?.totalTransactions ?? 0})
            </button>
            <span className="text-[11px] text-slate-400">
              1 Credit ≈ $25–$50 Award Value
            </span>
          </div>
        </div>

        {/* Feature Explainer Banner */}
        <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              <Sparkles className="h-4 w-4" />
              Stage 5 Signature Differentiator
            </div>
            <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
              Impact-to-Scholarship Exchange
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Transform your university volunteering hours and SDG impact credentials into verified scholarship funding. Corporate partners, philanthropic foundations, and alumni fund pools; students unlock them through community service and strong academic standing.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 text-center">
            <div>
              <div className="text-base font-extrabold text-slate-900 dark:text-white">{pools.length}</div>
              <div className="text-[11px] font-medium text-slate-500">Active Pools</div>
            </div>
            <div>
              <div className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                ${pools.reduce((sum, p) => sum + (p.totalAmount - p.allocatedAmount), 0).toLocaleString()}
              </div>
              <div className="text-[11px] font-medium text-slate-500">Funding Available</div>
            </div>
            <div>
              <div className="text-base font-extrabold text-indigo-600 dark:text-indigo-400">{claims.length}</div>
              <div className="text-[11px] font-medium text-slate-500">Claims Initiated</div>
            </div>
          </div>
        </div>
      </div>

      {/* Available Sponsor Pools */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Sponsor Scholarship Pools
            </h3>
            <p className="text-xs text-slate-500">
              Select a pool to unlock an award using your earned impact credits.
            </p>
          </div>
        </div>

        {pools.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-800">
            <p className="text-sm text-slate-500">No active scholarship pools found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {pools.map((pool) => {
              const eligible = pool.studentBalance >= pool.creditCostPerAward && pool.remainingAwards > 0;

              return (
                <div
                  key={pool.id}
                  className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-xs transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {pool.sponsorType}
                      </span>
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        {pool.remainingAwards} Awards Left
                      </span>
                    </div>

                    <h4 className="mt-3 text-base font-bold text-slate-900 dark:text-white leading-snug">
                      {pool.title}
                    </h4>
                    <p className="mt-0.5 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                      Sponsored by {pool.sponsorName}
                    </p>
                    {pool.description && (
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                        {pool.description}
                      </p>
                    )}

                    <div className="mt-4 rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/60 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Award Amount:</span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          ${pool.awardAmountPerStudent.toLocaleString()} {pool.currency}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Required Credits:</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">
                          {pool.creditCostPerAward} Credits
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Minimum GPA:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {pool.minGpa.toFixed(1)}+
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => setClaimingPool(pool)}
                      disabled={!eligible}
                      className={`w-full rounded-xl py-2.5 text-xs font-bold transition-all ${
                        eligible
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20 hover:bg-indigo-700 active:scale-98'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500'
                      }`}
                    >
                      {eligible
                        ? `Claim $${pool.awardAmountPerStudent.toLocaleString()} Award`
                        : pool.remainingAwards <= 0
                        ? 'Pool Fully Claimed'
                        : `Need ${pool.creditCostPerAward} Credits (Have ${pool.studentBalance})`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* My Claims & QR Verifications */}
      {claims.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
            My Scholarship Claims & Verifications
          </h3>
          <div className="space-y-3">
            {claims.map((claim) => (
              <div
                key={claim.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                    <Award className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {claim.pool.title}
                    </h4>
                    <p className="text-xs text-slate-500">
                      ${claim.awardAmount.toLocaleString()} {claim.currency} · {claim.creditsRedeemed} Credits Redeemed · GPA {claim.studentGpa}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      claim.status === 'APPROVED'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                        : claim.status === 'REJECTED'
                        ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                    }`}
                  >
                    {claim.status}
                  </span>

                  <button
                    onClick={() => setSelectedClaimQr(claim)}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <QrIcon className="h-3.5 w-3.5" />
                    Verify QR
                  </button>

                  <button
                    onClick={() => copyVerifyLink(claim.qrVerificationToken)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    title="Copy Public Link"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: Claim Award Submission */}
      {claimingPool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Unlock Scholarship Award
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Confirm your credit deduction and academic standing for {claimingPool.title}.
            </p>

            <div className="mt-4 rounded-2xl bg-indigo-50/70 p-4 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Award Amount:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  ${claimingPool.awardAmountPerStudent.toLocaleString()} {claimingPool.currency}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Credits Deducted:</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                  {claimingPool.creditCostPerAward} Credits
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Sponsor:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {claimingPool.sponsorName} ({claimingPool.sponsorType})
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Verified Cumulative GPA
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="4.0"
                  value={studentGpa}
                  onChange={(e) => setStudentGpa(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Academic Standing
                </label>
                <select
                  value={academicStanding}
                  onChange={(e) => setAcademicStanding(e.target.value as 'GOOD_STANDING' | 'HONORS' | 'DEANS_LIST')}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="GOOD_STANDING">Good Standing</option>
                  <option value="HONORS">Honors</option>
                  <option value="DEANS_LIST">Dean&apos;s List</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setClaimingPool(null)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleClaimSubmit}
                disabled={submitting || studentGpa < claimingPool.minGpa}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-indigo-700 disabled:opacity-40"
              >
                {submitting ? 'Submitting...' : 'Confirm Claim'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: QR Code & Verification Proof */}
      {selectedClaimQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-white">
              Scholarship Verification QR
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Scan with any mobile device to view public cryptographic audit proof.
            </p>

            {/* Verification Token Card */}
            <div className="my-5 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="font-mono text-[10px] break-all text-slate-500">
                Token: {selectedClaimQr.qrVerificationToken}
              </div>
              <div className="mt-2 text-xs font-bold text-slate-900 dark:text-white">
                {selectedClaimQr.pool.title}
              </div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                ${selectedClaimQr.awardAmount.toLocaleString()} {selectedClaimQr.currency} Award
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => copyVerifyLink(selectedClaimQr.qrVerificationToken)}
                className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white hover:bg-indigo-700"
              >
                Copy Public URL
              </button>
              <button
                onClick={() => setSelectedClaimQr(null)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER: Ledger Inspector */}
      {showLedgerDrawer && ledger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Hash className="h-5 w-5 text-indigo-500" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Cryptographic Impact Credit Ledger
                </h3>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                Hash Chain Verified
              </span>
            </div>

            <div className="flex-1 overflow-y-auto my-4 space-y-3">
              {ledger.ledger.map((entry, idx) => (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/40"
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-slate-800 dark:text-slate-200">
                      {idx + 1}. {entry.description}
                    </span>
                    <span
                      className={`font-bold ${
                        entry.credits > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {entry.credits > 0 ? `+${entry.credits}` : entry.credits} Credits
                    </span>
                  </div>

                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Balance After: {entry.balanceAfter}</span>
                    <span>{new Date(entry.createdAt).toLocaleDateString()}</span>
                  </div>

                  <div className="mt-2 font-mono text-[9px] text-slate-400 truncate">
                    Hash: {entry.hash}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setShowLedgerDrawer(false)}
                className="rounded-xl bg-slate-100 px-5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              >
                Close Ledger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

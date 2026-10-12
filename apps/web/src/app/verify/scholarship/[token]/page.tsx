'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ShieldCheck,
  ShieldX,
  Sparkles,
  Copy,
  Hash,
} from 'lucide-react';
import { toast } from 'sonner';

interface VerificationData {
  verified: boolean;
  claimId?: string;
  awardTitle?: string;
  sponsorName?: string;
  sponsorType?: string;
  recipientName?: string;
  awardAmount?: number;
  currency?: string;
  academicStanding?: string;
  issuedAt?: string;
  approvedBy?: string;
  signatureProof?: string;
  verificationUrl?: string;
  error?: string;
}

export default function ScholarshipVerificationPage() {
  const params = useParams();
  const token = params?.token as string;

  const [data, setData] = useState<VerificationData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!token) return;

    async function verify() {
      try {
        const res = await fetch(`/api/scholarships/verify/${token}`);
        const result = await res.json();
        setData(result);
      } catch {
        setData({ verified: false, error: 'Network error verifying scholarship' });
      } finally {
        setLoading(false);
      }
    }

    void verify();
  }, [token]);

  const copyProof = () => {
    if (data?.signatureProof) {
      void navigator.clipboard.writeText(data.signatureProof);
      toast.success('Cryptographic signature proof copied!');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <Sparkles className="h-8 w-8 animate-spin text-indigo-500" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Verifying scholarship credentials against cryptographic ledger...
          </p>
        </div>
      </div>
    );
  }

  const isVerified = data?.verified === true;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12 dark:bg-slate-950 flex flex-col items-center justify-center">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        {isVerified ? (
          <div>
            {/* Top Verified Header */}
            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/25">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <span className="mt-4 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-500/20">
                Official Credential Verified
              </span>
              <h2 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
                {data.awardTitle}
              </h2>
              <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold mt-1">
                Sponsored by {data.sponsorName} ({data.sponsorType})
              </p>
            </div>

            {/* Recipient & Award Details */}
            <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/50 space-y-3 text-sm">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200/60 dark:border-slate-800">
                <span className="text-slate-500 text-xs font-medium">Award Recipient:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {data.recipientName}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-200/60 dark:border-slate-800">
                <span className="text-slate-500 text-xs font-medium">Award Amount:</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                  ${data.awardAmount?.toLocaleString()} {data.currency}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-200/60 dark:border-slate-800">
                <span className="text-slate-500 text-xs font-medium">Academic Standing:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {data.academicStanding?.replace('_', ' ')}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-200/60 dark:border-slate-800">
                <span className="text-slate-500 text-xs font-medium">Verified By:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {data.approvedBy}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-xs font-medium">Issuance Date:</span>
                <span className="text-slate-700 dark:text-slate-300 text-xs">
                  {data.issuedAt ? new Date(data.issuedAt).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            </div>

            {/* Cryptographic Signature Card */}
            <div className="mt-5 rounded-2xl bg-indigo-50/50 p-4 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30">
              <div className="flex items-center justify-between text-xs font-semibold text-indigo-900 dark:text-indigo-300 mb-1">
                <span className="flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5" /> Cryptographic Ledger Proof
                </span>
                <button
                  onClick={copyProof}
                  className="flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
                >
                  <Copy className="h-3 w-3" /> Copy Proof
                </button>
              </div>
              <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 break-all leading-tight">
                {data.signatureProof}
              </p>
            </div>

            {/* Institutional Trust Footer */}
            <div className="mt-6 text-center text-xs text-slate-400">
              Verified by UniVerse Impact-to-Scholarship Registry · Hash-Chain Signed Ledger
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
              <ShieldX className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">
              Scholarship Verification Failed
            </h3>
            <p className="mt-2 text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
              {data?.error || 'The provided verification token could not be verified against the institutional registry.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

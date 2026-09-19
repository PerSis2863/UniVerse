'use client';

import { SignUp } from '@clerk/nextjs';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function RegisterPage() {
  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-4">
          <Sparkles className="w-3 h-3" />
          Join the Network
        </div>
        <h1 className="text-3xl font-black text-white mb-2">Create an account</h1>
        <p className="text-zinc-400 text-sm">
          Start your journey as a student, teacher, or organization.
        </p>
      </div>

      {/* Clerk SignUp Component */}
      {/* Handles Email verification, Google OAuth, and OTP */}
      <SignUp
        routing="hash"
        signInUrl="/login"
        appearance={{
          elements: {
            rootBox: 'w-full',
            card: 'bg-transparent shadow-none border-0 p-0',
            headerBox: 'hidden',
            socialButtonsBlockButton: 'w-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white rounded-xl transition-colors h-11',
            socialButtonsBlockButtonText: 'font-semibold text-sm',
            dividerRow: 'my-5',
            dividerLine: 'bg-white/10',
            dividerText: 'text-zinc-500 text-xs',
            formFieldLabel: 'text-zinc-400 text-sm font-medium mb-1',
            formFieldInput: 'w-full bg-white/[0.04] border border-white/10 text-white placeholder-zinc-600 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500/50 focus:bg-white/[0.06] transition-all',
            formButtonPrimary: 'w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl py-3 text-sm transition-colors mt-2',
            footerAction: 'mt-6',
            footerActionText: 'text-zinc-500 text-sm',
            footerActionLink: 'text-indigo-400 hover:text-indigo-300 font-semibold',
            alertText: 'text-red-400 text-sm',
            formFieldErrorText: 'text-red-400 text-xs mt-1',
            otpCodeFieldInput: 'bg-white/[0.04] border border-white/10 text-white rounded-xl text-center text-lg font-bold focus:border-indigo-500/50',
          },
        }}
      />

      <p className="mt-6 text-center text-xs text-zinc-600">
        By joining, you agree to our{' '}
        <Link href="#" className="text-indigo-400 hover:underline">Terms</Link>
        {' & '}
        <Link href="#" className="text-indigo-400 hover:underline">Privacy Policy</Link>.
      </p>
    </div>
  );
}

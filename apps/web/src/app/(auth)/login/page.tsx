'use client';

import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export default function LoginPage() {
  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-4">
          <Sparkles className="w-3 h-3" />
          UniVerse Impact
        </div>
        <h1 className="text-3xl font-black text-white mb-2">Welcome back</h1>
        <p className="text-zinc-400 text-sm">
          Sign in to continue making an impact.
        </p>
      </div>

      {/* Clerk SignIn Component */}
      {/* Clerk handles: Email/Password, Google OAuth, OTP, and 2FA automatically */}
      <SignIn
        routing="hash"
        signUpUrl="/register"
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
            identityPreviewText: 'text-zinc-300',
            identityPreviewEditButton: 'text-indigo-400 hover:text-indigo-300',
            alertText: 'text-red-400 text-sm',
            formFieldErrorText: 'text-red-400 text-xs mt-1',
            otpCodeFieldInput: 'bg-white/[0.04] border border-white/10 text-white rounded-xl text-center text-lg font-bold focus:border-indigo-500/50',
            phoneNumberFlagButton: 'text-zinc-400',
          },
        }}
      />

      <p className="mt-6 text-center text-xs text-zinc-600">
        By signing in, you agree to our{' '}
        <Link href="#" className="text-indigo-400 hover:underline">Terms</Link>
        {' & '}
        <Link href="#" className="text-indigo-400 hover:underline">Privacy Policy</Link>.
      </p>
    </div>
  );
}

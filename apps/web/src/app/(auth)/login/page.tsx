'use client';

import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export default function LoginPage() {
  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-xs font-semibold mb-5">
          <Sparkles className="w-3 h-3" />
          UniVerse Impact
        </div>
        <h1 className="text-3xl font-black text-zinc-900 mb-2">Welcome back</h1>
        <p className="text-zinc-500 text-sm">
          Sign in to continue making an impact.
        </p>
      </div>

      {/* Clerk SignIn — styled for light mode */}
      <SignIn
        routing="hash"
        signUpUrl="/register"
        appearance={{
          elements: {
            rootBox: 'w-full',
            card: 'bg-transparent shadow-none border-0 p-0',
            headerBox: 'hidden',
            // Social buttons
            socialButtonsBlockButton:
              'w-full border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 rounded-xl transition-colors h-11 shadow-sm',
            socialButtonsBlockButtonText: 'font-semibold text-sm text-zinc-700',
            socialButtonsProviderIcon: 'w-5 h-5',
            // Divider
            dividerRow: 'my-5',
            dividerLine: 'bg-zinc-200',
            dividerText: 'text-zinc-400 text-xs',
            // Form fields
            formFieldLabel: 'text-zinc-600 text-sm font-medium mb-1',
            formFieldInput:
              'w-full bg-white border border-zinc-200 text-zinc-900 placeholder-zinc-400 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all shadow-sm',
            // Primary button
            formButtonPrimary:
              'w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl py-3 text-sm transition-colors mt-2 shadow-md shadow-indigo-500/20',
            // Footer
            footerAction: 'mt-6',
            footerActionText: 'text-zinc-500 text-sm',
            footerActionLink: 'text-indigo-600 hover:text-indigo-700 font-semibold',
            // Identity preview (shown after email step)
            identityPreviewText: 'text-zinc-700',
            identityPreviewEditButton: 'text-indigo-600 hover:text-indigo-700',
            // Alerts & errors
            alertText: 'text-red-600 text-sm',
            formFieldErrorText: 'text-red-500 text-xs mt-1',
            // OTP input boxes
            otpCodeFieldInput:
              'bg-white border border-zinc-200 text-zinc-900 rounded-xl text-center text-lg font-bold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 shadow-sm',
            phoneNumberFlagButton: 'text-zinc-500',
          },
        }}
      />

      <p className="mt-6 text-center text-xs text-zinc-400">
        By signing in, you agree to our{' '}
        <Link href="#" className="text-indigo-600 hover:underline">Terms</Link>
        {' & '}
        <Link href="#" className="text-indigo-600 hover:underline">Privacy Policy</Link>.
      </p>
    </div>
  );
}

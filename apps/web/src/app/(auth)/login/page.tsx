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

      {/* Clerk SignIn — forced light mode via colorBackground */}
      <SignIn
        routing="hash"
        signUpUrl="/register"
        appearance={{
          variables: {
            colorPrimary: '#4f46e5',
            colorBackground: '#ffffff',
            borderRadius: '0.75rem',
          },
          elements: {
            rootBox: 'w-full',
            card: 'bg-transparent shadow-none border-0 p-0',
            headerBox: 'hidden',
            // Social buttons
            socialButtonsBlockButton:
              'w-full !border !border-zinc-200 !bg-white hover:!bg-zinc-50 !text-zinc-700 !rounded-xl transition-colors !h-11 !shadow-sm',
            socialButtonsBlockButtonText: '!font-semibold !text-sm !text-zinc-700',
            // Divider
            dividerRow: 'my-5',
            dividerLine: '!bg-zinc-200',
            dividerText: '!text-zinc-400 !text-xs',
            // Form fields
            formFieldLabel: '!text-zinc-600 !text-sm !font-medium',
            formFieldInput:
              '!bg-white !border !border-zinc-200 !text-zinc-900 placeholder:!text-zinc-400 !rounded-xl !text-sm focus:!border-indigo-500 !shadow-sm',
            // Primary button
            formButtonPrimary:
              '!bg-indigo-600 hover:!bg-indigo-700 !text-white !font-semibold !rounded-xl !text-sm !shadow-md',
            // Footer
            footerActionText: '!text-zinc-500 !text-sm',
            footerActionLink: '!text-indigo-600 hover:!text-indigo-700 !font-semibold',
            // Identity preview
            identityPreviewText: '!text-zinc-700',
            identityPreviewEditButton: '!text-indigo-600 hover:!text-indigo-700',
            // Alerts
            alertText: '!text-red-600 !text-sm',
            formFieldErrorText: '!text-red-500 !text-xs',
            // OTP
            otpCodeFieldInput:
              '!bg-white !border !border-zinc-200 !text-zinc-900 !rounded-xl !text-center !text-lg !font-bold focus:!border-indigo-500',
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

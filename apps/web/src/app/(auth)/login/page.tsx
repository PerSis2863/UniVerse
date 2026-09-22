'use client';

import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();



  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-5 transition-colors">
          <Sparkles className="w-3 h-3" />
          UniVerse Impact
        </div>
        <h1 className="text-3xl font-black text-white mb-2 transition-colors">Welcome back</h1>
        <p className="text-zinc-400 text-sm transition-colors">
          Sign in to continue making an impact.
        </p>
      </div>

      {/* Clerk SignIn */}
      <SignIn
        routing="hash"
        signUpUrl="/register"
        appearance={{
          variables: {
            colorPrimary: '#4f46e5',
            borderRadius: '0.75rem',
          },
          elements: {
            rootBox: 'w-full flex justify-center',
            card: 'bg-[#09090b] shadow-xl border border-zinc-800 rounded-2xl',
            headerTitle: 'text-white',
            headerSubtitle: 'text-zinc-400',
            // Social buttons
            socialButtonsBlockButton:
              'w-full border border-zinc-800 bg-[#09090b] hover:bg-zinc-800 text-zinc-300 rounded-xl transition-colors h-11',
            socialButtonsBlockButtonText: 'font-semibold text-sm text-zinc-300',
            // Divider
            dividerRow: 'my-5',
            dividerLine: 'bg-zinc-800',
            dividerText: 'text-zinc-500 text-xs',
            // Form fields
            formFieldLabel: 'text-zinc-400 text-sm font-medium',
            formFieldInput:
              'bg-[#09090b] border border-zinc-800 text-white placeholder:text-zinc-500 rounded-xl text-sm focus:border-indigo-500 shadow-sm transition-colors',
            // Primary button
            formButtonPrimary:
              'bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm shadow-md',
            // Footer
            footer: 'bg-zinc-900/50 border-t border-zinc-800',
            footerActionText: 'text-zinc-400 text-sm',
            footerActionLink: 'text-indigo-400 hover:text-indigo-300 font-semibold',
            // Identity preview
            identityPreviewText: 'text-zinc-300',
            identityPreviewEditButton: 'text-indigo-400',
            // Alerts
            alertText: 'text-red-400 text-sm',
            formFieldErrorText: 'text-red-400 text-xs',
          },
        }}
      />



      <p className="mt-6 text-center text-xs text-zinc-500">
        By signing in, you agree to our{' '}
        <Link href="#" className="text-indigo-400 hover:underline">Terms</Link>
        {' & '}
        <Link href="#" className="text-indigo-400 hover:underline">Privacy Policy</Link>.
      </p>
    </div>
  );
}

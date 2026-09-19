'use client';

import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

export default function LoginPage() {
  const { setTheme, theme } = useTheme();
  const router = useRouter();
  const { login } = useAuthStore();

  const handleDemoLogin = async (role: string) => {
    // Set a cookie so middleware bypasses clerk protection for demo
    document.cookie = `demo_token=mock-token; path=/; max-age=86400`;
    await login(`demo@${role}.com`, 'password');
    router.push(`/${role}`);
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-semibold mb-5 transition-colors">
          <Sparkles className="w-3 h-3" />
          UniVerse Impact
        </div>
        <h1 className="text-3xl font-black text-zinc-900 dark:text-white mb-2 transition-colors">Welcome back</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm transition-colors">
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
            colorBackground: 'transparent',
            borderRadius: '0.75rem',
          },
          elements: {
            rootBox: 'w-full',
            card: 'bg-transparent shadow-none border-0 p-0',
            headerBox: 'hidden',
            // Social buttons
            socialButtonsBlockButton:
              'w-full border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.06] text-zinc-700 dark:text-zinc-300 rounded-xl transition-colors h-11 shadow-sm',
            socialButtonsBlockButtonText: 'font-semibold text-sm',
            // Divider
            dividerRow: 'my-5',
            dividerLine: 'bg-zinc-200 dark:bg-white/[0.08]',
            dividerText: 'text-zinc-400 dark:text-zinc-500 text-xs',
            // Form fields
            formFieldLabel: 'text-zinc-600 dark:text-zinc-400 text-sm font-medium',
            formFieldInput:
              'bg-white dark:bg-white/[0.03] border border-zinc-200 dark:border-white/[0.08] text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 rounded-xl text-sm focus:border-indigo-500 dark:focus:border-indigo-500 shadow-sm transition-colors',
            // Primary button
            formButtonPrimary:
              'bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm shadow-md',
            // Footer
            footerActionText: 'text-zinc-500 dark:text-zinc-400 text-sm',
            footerActionLink: 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-semibold',
            // Identity preview
            identityPreviewText: 'text-zinc-700 dark:text-zinc-300',
            identityPreviewEditButton: 'text-indigo-600 dark:text-indigo-400',
            // Alerts
            alertText: 'text-red-600 dark:text-red-400 text-sm',
            formFieldErrorText: 'text-red-500 dark:text-red-400 text-xs',
            // OTP
            otpCodeFieldInput:
              'bg-white dark:bg-white/[0.03] border border-zinc-200 dark:border-white/[0.08] text-zinc-900 dark:text-white rounded-xl text-center text-lg font-bold focus:border-indigo-500',
          },
        }}
      />

      {/* Demo Logins */}
      <div className="mt-8 pt-8 border-t border-zinc-200 dark:border-white/[0.08]">
        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4 text-center">
          Demo Access (No Clerk Config Required)
        </p>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => handleDemoLogin('student')}
            className="px-3 py-2 text-xs font-medium bg-zinc-100 dark:bg-white/[0.05] hover:bg-zinc-200 dark:hover:bg-white/[0.1] text-zinc-700 dark:text-zinc-300 rounded-lg transition-colors border border-zinc-200 dark:border-white/[0.05]"
          >
            Student
          </button>
          <button
            onClick={() => handleDemoLogin('teacher')}
            className="px-3 py-2 text-xs font-medium bg-zinc-100 dark:bg-white/[0.05] hover:bg-zinc-200 dark:hover:bg-white/[0.1] text-zinc-700 dark:text-zinc-300 rounded-lg transition-colors border border-zinc-200 dark:border-white/[0.05]"
          >
            Teacher
          </button>
          <button
            onClick={() => handleDemoLogin('admin')}
            className="px-3 py-2 text-xs font-medium bg-zinc-100 dark:bg-white/[0.05] hover:bg-zinc-200 dark:hover:bg-white/[0.1] text-zinc-700 dark:text-zinc-300 rounded-lg transition-colors border border-zinc-200 dark:border-white/[0.05]"
          >
            Admin
          </button>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
        By signing in, you agree to our{' '}
        <Link href="#" className="text-indigo-600 dark:text-indigo-400 hover:underline">Terms</Link>
        {' & '}
        <Link href="#" className="text-indigo-600 dark:text-indigo-400 hover:underline">Privacy Policy</Link>.
      </p>
    </div>
  );
}

'use client';

import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6`}>
        <div className="max-w-md w-full bg-zinc-900 border border-rose-500/30 rounded-2xl p-8 shadow-2xl flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Configuration Error</h2>
          <p className="text-zinc-400 text-sm mb-6">
            It looks like your Clerk API keys are invalid or missing in Vercel. Please ensure you have added the correct <code className="bg-zinc-800 px-1 rounded text-rose-400">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and <code className="bg-zinc-800 px-1 rounded text-rose-400">CLERK_SECRET_KEY</code> from your Clerk Dashboard to your Vercel Environment Variables.
          </p>
          <div className="w-full bg-black/50 p-4 rounded-lg overflow-x-auto text-left text-xs font-mono text-zinc-300 mb-6 border border-zinc-800">
            {error.message || "Unknown Error"}
          </div>
          <button
            onClick={() => window.location.href = '/login'}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-medium transition-colors"
          >
            Go back to Login
          </button>
        </div>
      </body>
    </html>
  );
}

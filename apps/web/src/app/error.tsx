'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-zinc-950 p-6 text-center text-zinc-100">
      <div className="flex max-w-md flex-col items-center space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
        <h2 className="text-xl font-bold text-rose-500">Something went wrong!</h2>
        <p className="text-sm text-zinc-400">
          We caught an error in the application. Please see the details below:
        </p>
        <div className="w-full rounded bg-zinc-950 p-4 text-left text-xs font-mono text-rose-400 overflow-auto max-h-64">
          <p className="font-bold">{error.name}: {error.message}</p>
          <pre className="mt-2 whitespace-pre-wrap opacity-70">{error.stack}</pre>
        </div>
        <button
          onClick={() => reset()}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

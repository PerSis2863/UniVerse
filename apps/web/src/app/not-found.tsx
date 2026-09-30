import Link from 'next/link';
import { Compass, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center p-6 text-center">
      <div className="flex max-w-md flex-col items-center rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 p-8 shadow-xl">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
          <Compass className="w-6 h-6" />
        </div>
        <p className="mt-4 text-xs font-bold uppercase tracking-wider text-indigo-500">404</p>
        <h1 className="mt-1 text-xl font-bold text-zinc-900 dark:text-white">We couldn’t find that page</h1>
        <p className="mt-2 text-sm text-zinc-500">The link may be old, or the page may have moved. Everything else is still here.</p>
        <Link href="/" className="btn-primary mt-6">
          <Home className="w-4 h-4" /> Back to UniVerse
        </Link>
      </div>
    </div>
  );
}

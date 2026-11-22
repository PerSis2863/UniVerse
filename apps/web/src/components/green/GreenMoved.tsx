'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { greenHome } from '@/lib/green-home';

// M395: Green's old pages send people on to where each part lives now (links in notifications already sent, bookmarks).
export function GreenMoved() {
  const router = useRouter();
  useEffect(() => { router.replace(greenHome(window.location.pathname, window.location.search)); }, [router]);
  return <p role="status" className="p-8 text-sm text-zinc-600 dark:text-zinc-300">Green now lives inside your other apps. Taking you there…</p>;
}

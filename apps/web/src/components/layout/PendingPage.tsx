'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { usePendingNav } from '@/lib/nav-pending';
import { PageSkeleton } from './PageSkeleton';

/**
 * After a tap on a link to another page, swaps the old page for a loading skeleton until the new
 * page arrives, so the tap visibly does something (pages download on tap, without prefetching).
 * Pages that open within a moment (already visited) skip it. The old page stays mounted, only
 * hidden, so it comes back as it was if the navigation is cancelled.
 */
export function PendingPage({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const pending = usePendingNav();
  const leaving = !!pending && pending !== pathname;
  const [shownFor, setShownFor] = useState<string | null>(null);

  useEffect(() => {
    if (!leaving) return;
    // From the top, like the new page will be.
    const t = setTimeout(() => { setShownFor(pending); window.scrollTo(0, 0); }, 100);
    return () => clearTimeout(t);
  }, [leaving, pending]);

  const on = leaving && shownFor === pending;
  return (
    <>
      <div className={on ? 'hidden' : 'contents'}>{children}</div>
      {on && <PageSkeleton />}
    </>
  );
}

'use client';

import { usePathname } from 'next/navigation';
import { usePendingNav } from '@/lib/nav-pending';
import { PageSkeleton, skeletonFor } from '@/components/layout/PageSkeleton';

// Shown inside the portal (the sidebar stays) while a page's code loads: shaped like that page.
export default function Loading() {
  const pathname = usePathname();
  const pending = usePendingNav();
  return <PageSkeleton variant={skeletonFor(pending ?? pathname)} />;
}

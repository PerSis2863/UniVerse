'use client';

import { usePathname } from 'next/navigation';
import { usePendingNav } from '@/lib/nav-pending';
import { PageSkeleton, skeletonFor } from '@/components/layout/PageSkeleton';
import { SectionTabs, tabsFor } from '@/components/layout/SectionTabs';
import { Topbar } from '@/components/layout/Topbar';
import { useAuthStore } from '@/store/auth';

// Shown inside the portal (the menu stays) while a page's code loads: shaped like that page, under its
// real tabs when it has some.
export default function Loading() {
  const pathname = usePathname();
  const pending = usePendingNav();
  const role = useAuthStore((st) => st.user?.role);
  const path = pending ?? pathname;
  // A page with a row of tabs: the real bar and tabs stay where they are while it loads, so moving
  // between tabs never makes the row vanish and come back (M234).
  const tabs = tabsFor(path, role);
  if (!tabs) return <PageSkeleton variant={skeletonFor(path)} />;
  return (
    <>
      <Topbar title={tabs.find((t) => t.href === path || t.also?.includes(path))?.label ?? ''} />
      <SectionTabs tabs={tabs} />
      <PageSkeleton variant={skeletonFor(path)} bare />
    </>
  );
}

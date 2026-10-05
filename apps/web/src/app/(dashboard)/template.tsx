'use client';

import { usePathname } from 'next/navigation';

// Wraps each page of the portals. Page transitions run in the shell (PendingPage), because a
// template only re-mounts when the first part of the address changes, not between pages of the
// same portal. data-page-path tells NavProgress which page is on screen.
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div data-page-path={pathname} className="flex flex-col flex-1 min-w-0">
      {children}
    </div>
  );
}

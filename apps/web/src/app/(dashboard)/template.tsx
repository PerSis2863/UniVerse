'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { RouteRendered } from '@/components/layout/RouteRendered';
import { pageEntrance, pageEntranceShown } from '@/lib/page-transition';

// Re-mounts on every navigation, so each page gets its entrance: the iOS push/pop/fade from
// src/lib/page-transition.ts (CSS, transform/opacity only, no fill-mode, so nothing lingers that
// would break position:fixed modals), or nothing while a View Transition is animating it.
export default function Template({ children }: { children: React.ReactNode }) {
  const [entrance] = useState(pageEntrance);
  const pathname = usePathname();
  useEffect(() => { pageEntranceShown(); }, []);
  return (
    <div data-page-path={pathname} className={`${entrance} flex flex-col flex-1 min-w-0`}>
      <RouteRendered />
      {children}
    </div>
  );
}

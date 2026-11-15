'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { appFor, appHome } from '@/lib/apps';
import { useShownApps } from '@/lib/shown-apps';
import { useAuthStore } from '@/store/auth';

/** M197: a page of an app the owner hides (owner console → Server) sends people to the first shown app. */
export function ShownAppsGuard() {
  const path = usePathname();
  const shown = useShownApps();
  const role = useAuthStore((s) => s.user?.role) ?? 'STUDENT';
  const router = useRouter();
  const app = appFor(path)?.id;
  const to = app && !shown.some((a) => a.id === app) ? appHome(shown[0].id, role) : null;
  useEffect(() => { if (to) router.replace(to); }, [to, router]);
  return null;
}

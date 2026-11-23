'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { appById, appFor, appHome } from '@/lib/apps';
import { isShown, useShownApps } from '@/lib/shown-apps';
import { useAuthStore } from '@/store/auth';

/** M203: a page of an app the owner hides (owner console → Server) sends people to the first shown app. */
export function ShownAppsGuard() {
  const path = usePathname();
  const shown = useShownApps();
  const role = useAuthStore((s) => s.user?.role) ?? 'STUDENT';
  const router = useRouter();
  const app = appFor(path)?.id;
  // An app for computers only (Hyperion, M405) stays on a phone: its page says to open it on a computer.
  const to = app && !shown.some((a) => a.id === app) && !(appById(app).desktopOnly && isShown(app)) ? appHome(shown[0].id, role) : null;
  useEffect(() => { if (to) router.replace(to); }, [to, router]);
  return null;
}

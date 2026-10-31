'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LaunchSplash } from '@/components/layout/LaunchSplash';
import { homeFor } from '@/lib/role-home';
import { inboxFor } from '@/lib/apps';
import { stashShare } from '@/lib/share-in';

// Where the installed app opens (manifest start_url): straight to your dashboard if you're signed
// in on this device, otherwise to sign in, like an app. The website's landing page is for
// browsers. The inline script decides before anything is drawn; the effect is the fallback.

// Something shared to UniVerse from another app (manifest share_target, ?title=&text=&url=&photos=)
// is left to the effect, which keeps it and opens Messages (src/lib/share-in.ts).
const DECIDE = `(function(){if(/[?&](title|text|url|photos)=/.test(location.search))return;try{var d='/login',r=localStorage.getItem('universe-auth'),u=r&&JSON.parse(r).state&&JSON.parse(r).state.user;if(u&&u.role){d=u.role==='GUARDIAN'?'/parent':u.owner?'/console':'/hub';}location.replace(d);}catch(e){location.replace('/login');}})();`;

function destination() {
  const shared = stashShare(window.location.search);
  try {
    const raw = localStorage.getItem('universe-auth');
    const user = raw ? (JSON.parse(raw) as { state?: { user?: { role?: string; owner?: boolean } } }).state?.user : null;
    if (user?.role) return shared ? inboxFor(user.role) : homeFor(user);
  } catch { /* storage blocked: sign in */ }
  return '/login';
}

export default function AppLaunch() {
  const router = useRouter();
  useEffect(() => { router.replace(destination()); }, [router]);
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: DECIDE }} />
      <LaunchSplash always />
    </>
  );
}

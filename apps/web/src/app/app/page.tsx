'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LaunchSplash } from '@/components/layout/LaunchSplash';
import { homeFor } from '@/lib/role-home';

// Where the installed app opens (manifest start_url): straight to your dashboard if you're signed
// in on this device, otherwise to sign in, like an app. The website's landing page is for
// browsers. The inline script decides before anything is drawn; the effect is the fallback.

const DECIDE = `(function(){try{var d='/login',r=localStorage.getItem('universe-auth'),u=r&&JSON.parse(r).state&&JSON.parse(r).state.user;if(u&&u.role){d=u.owner?'/console':u.role==='TEACHER'?'/teacher':u.role==='ADMIN'?'/admin':u.role==='GUARDIAN'?'/parent':'/student';}location.replace(d);}catch(e){location.replace('/login');}})();`;

function destination() {
  try {
    const raw = localStorage.getItem('universe-auth');
    const user = raw ? (JSON.parse(raw) as { state?: { user?: { role?: string; owner?: boolean } } }).state?.user : null;
    if (user?.role) return homeFor(user);
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

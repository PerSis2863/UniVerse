'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Where the installed app opens (manifest start_url): straight to your dashboard if you're signed
// in on this device, otherwise to sign in, like an app. The website's landing page is for
// browsers. The inline script decides before anything is drawn; the effect is the fallback.

const DECIDE = `(function(){try{var d='/login',r=localStorage.getItem('universe-auth'),u=r&&JSON.parse(r).state&&JSON.parse(r).state.user;if(u&&u.role){d=u.owner?'/console':u.role==='TEACHER'?'/teacher':u.role==='ADMIN'?'/admin':'/student';}location.replace(d);}catch(e){location.replace('/login');}})();`;

function destination() {
  try {
    const raw = localStorage.getItem('universe-auth');
    const user = raw ? (JSON.parse(raw) as { state?: { user?: { role?: string; owner?: boolean } } }).state?.user : null;
    if (user?.role) return user.owner ? '/console' : user.role === 'TEACHER' ? '/teacher' : user.role === 'ADMIN' ? '/admin' : '/student';
  } catch { /* storage blocked: sign in */ }
  return '/login';
}

export default function AppLaunch() {
  const router = useRouter();
  useEffect(() => { router.replace(destination()); }, [router]);
  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'radial-gradient(80% 50% at 0% 0%, rgba(79,70,229,0.35), transparent 70%), radial-gradient(80% 50% at 100% 100%, rgba(192,38,211,0.25), transparent 70%), #0a0d16' }}>
      <script dangerouslySetInnerHTML={{ __html: DECIDE }} />
      <div className="flex flex-col items-center gap-4 shell-in">
        <span className="w-16 h-16 rounded-[22px] bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_12px_40px_-10px_rgba(139,92,246,0.8)] flex items-center justify-center text-white text-2xl font-black">U</span>
        <span className="text-white/90 font-semibold tracking-tight">UniVerse</span>
      </div>
    </div>
  );
}

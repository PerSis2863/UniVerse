'use client';

import { use } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

// A UniVerse voice or video call, full screen (src/components/call/CallView.tsx).
const CallView = dynamic(() => import('@/components/call/CallView').then((m) => m.CallView), { ssr: false });

export default function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const leave = () => {
    const home = user?.role === 'ADMIN' ? '/admin/inbox' : user?.role === 'TEACHER' ? '/teacher/inbox' : '/student/inbox';
    if (window.history.length > 1) router.back();
    else router.push(home);
  };
  return <CallView callId={id} myName={user?.name ?? 'Me'} onLeave={leave} />;
}

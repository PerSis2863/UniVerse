'use client';

import { use } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

// A UniVerse voice or video call, full screen (src/components/call/CallView.tsx). Group and
// class rooms take ?kind=audio|video; chat calls know their own kind.
const CallView = dynamic(() => import('@/components/call/CallView').then((m) => m.CallView), { ssr: false });

export default function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const kind = useSearchParams().get('kind');
  const user = useAuthStore((s) => s.user);
  const leave = (conversationId: string | null) => {
    const inbox = user?.role === 'ADMIN' ? '/admin/inbox' : user?.role === 'TEACHER' ? '/teacher/inbox' : '/student/inbox';
    if (conversationId) router.replace(`${inbox}?c=${conversationId}`);
    else if (window.history.length > 1) router.back();
    else router.replace(inbox);
  };
  return <CallView callId={id} myName={user?.name ?? 'Me'} wantKind={kind === 'audio' ? 'audio' : kind === 'video' ? 'video' : undefined} onLeave={leave} />;
}

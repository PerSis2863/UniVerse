'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useCalls } from '@/store/calls';

// Keeps calls running above every page (mounted in the root layout), like a phone: the active
// call is full screen or a floating bar while you use the app; other calls wait on hold.
// /call/[id] only tells this host which call to show.

const CallView = dynamic(() => import('./CallView').then((m) => m.CallView), { ssr: false });

export function CallHost() {
  const calls = useCalls((s) => s.calls);
  const active = useCalls((s) => s.active);
  const minimized = useCalls((s) => s.minimized);
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  if (!calls.length) return null;
  const inbox = user?.role === 'ADMIN' ? '/admin/inbox' : user?.role === 'TEACHER' ? '/teacher/inbox' : '/student/inbox';
  const onCallPage = () => window.location.pathname.startsWith('/call/');
  const leaveCallPage = (conversationId?: string | null) => {
    if (!onCallPage()) return;
    if (conversationId) router.replace(`${inbox}?c=${conversationId}`);
    else if (window.history.length > 1) router.back();
    else router.replace(inbox);
  };

  return (
    <>
      {calls.map((c) => (
        <CallView
          key={c.id}
          callId={c.id}
          myName={user?.name ?? 'Me'}
          wantKind={c.kind}
          held={c.id !== active}
          heldIndex={calls.filter((x) => x.id !== active).findIndex((x) => x.id === c.id)}
          minimized={c.id === active && minimized}
          onMinimize={() => { useCalls.getState().minimize(); leaveCallPage(null); }}
          onExpand={() => { useCalls.getState().open(c.id, c.kind); if (!onCallPage()) router.push(`/call/${c.id}`); }}
          onResume={() => { useCalls.getState().open(c.id, c.kind); router.push(`/call/${c.id}`); }}
          onLeave={(conversationId) => {
            const wasActive = useCalls.getState().active === c.id;
            useCalls.getState().close(c.id);
            if (wasActive && !useCalls.getState().calls.length) leaveCallPage(conversationId);
          }}
        />
      ))}
    </>
  );
}

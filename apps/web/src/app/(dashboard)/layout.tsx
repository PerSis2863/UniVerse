'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { AppSkeleton } from '@/components/layout/AppSkeleton';
import { useAuthStore } from '@/store/auth';
import { Role, UserStatus } from '@/types';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { api } from '@/lib/api';
import { RealtimeSync } from '@/components/RealtimeSync';
import { DataConfig } from '@/components/DataConfig';

type MeResponse = { id: string; name?: string; email: string; role: string; status?: string; createdAt?: string; avatar?: string | null };

const toUser = (me: MeResponse, photoURL?: string | null) => ({
  id: me.id,
  name: me.name || 'Student',
  email: me.email,
  role: me.role as Role,
  status: (me.status || 'ACTIVE') as UserStatus,
  createdAt: me.createdAt || new Date().toISOString(),
  avatar: me.avatar || photoURL || undefined,
});

const RESYNC_MS = 5 * 60 * 1000;
const noopSubscribe = () => () => {};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const demoUser = useAuthStore((s) => s.user);
  const router = useRouter();
  // false during server rendering and hydration, true afterwards
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let signedIn = false;
    let lastSync = 0;

    // Loads the profile (name, role, avatar) from the server, so changes made on another device or
    // by an admin show up here. The saved copy is shown meanwhile.
    const syncProfile = async () => {
      lastSync = Date.now();
      try {
        const res = await api.get<MeResponse>('/users/me');
        if (!cancelled && res.data) useAuthStore.getState().setUser(toUser(res.data, auth.currentUser?.photoURL));
      } catch (e) {
        console.error('Failed to fetch user data', e);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const token = localStorage.getItem('accessToken');
      signedIn = !!firebaseUser || !!token?.startsWith('mock-token-');
      if (!cancelled) setIsSignedIn(signedIn);
      if (signedIn) {
        // With a saved profile the app shows right away and refreshes it in the background;
        // without one, wait for it so the navigation knows the role.
        if (useAuthStore.getState().user) void syncProfile();
        else await syncProfile();
      }
      if (!cancelled) setIsLoaded(true);
    });

    const onVisible = () => {
      if (document.visibilityState === 'visible' && signedIn && Date.now() - lastSync > RESYNC_MS) void syncProfile();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    if (isLoaded && !isSignedIn && !demoUser) {
      router.replace('/login');
    }
  }, [isLoaded, isSignedIn, demoUser, router]);

  // Show the app skeleton while the session is restored (static markup, so no hydration mismatch)
  if (!mounted || ((!isLoaded || !isSignedIn) && !demoUser)) return <AppSkeleton />;

  return (
    <DataConfig>
      <DashboardShell>
        <RealtimeSync />
        {children}
      </DashboardShell>
    </DataConfig>
  );
}

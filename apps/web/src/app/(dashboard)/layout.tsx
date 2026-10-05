'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { AppSkeleton } from '@/components/layout/AppSkeleton';
import { useAuthStore } from '@/store/auth';
import { Role, UserStatus, awaitingApproval, type ApplicationSummary } from '@/types';
import { api } from '@/lib/api';
import { RealtimeSync } from '@/components/RealtimeSync';
import { NavDataPreload } from '@/components/NavDataPreload';
import { ActivityTracker } from '@/components/ActivityTracker';
import { DataConfig } from '@/components/DataConfig';
import { LowDataSync } from '@/components/settings/LowDataToggle';
import { claimSessionReport, reportSession } from '@/lib/sign-in-history';
import { adoptEarlyBootstrap, startBootstrap } from '@/lib/bootstrap';
import { authedJson } from '@/lib/authed-fetch';
import { isSampleMode } from '@/lib/sample-mode';

type MeResponse = { id: string; name?: string; email: string; role: string; status?: string; createdAt?: string; avatar?: string | null; application?: ApplicationSummary | null; owner?: boolean; onboardedAt?: string | null };

const toUser = (me: MeResponse, photoURL?: string | null) => ({
  id: me.id,
  name: me.name || 'Student',
  email: me.email,
  role: me.role as Role,
  status: (me.status || 'ACTIVE') as UserStatus,
  createdAt: me.createdAt || new Date().toISOString(),
  avatar: me.avatar || photoURL || undefined,
  application: me.application ?? null,
  owner: me.owner === true,
});

const RESYNC_MS = 5 * 60 * 1000;

/** A saved sign-in on this device (checked before Firebase has restored it). */
function hasSession() {
  try {
    return !!localStorage.getItem('accessToken') && !!localStorage.getItem('universe-auth');
  } catch {
    return false;
  }
}
let sessionClaim: boolean | null = null;
const claimSessionReportOnce = () => (sessionClaim ??= claimSessionReport());
const noopSubscribe = () => () => {};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const demoUser = useAuthStore((s) => s.user);
  const router = useRouter();
  const pathname = usePathname();
  const waiting = awaitingApproval(demoUser);
  // false during server rendering and hydration, true afterwards
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);

  // Ask for everything the first screen needs in one request (see lib/bootstrap.ts). Started while
  // rendering, before the page's own data hooks run, so they can use its answers. Runs once.
  if (mounted && hasSession() && !isSampleMode() && !adoptEarlyBootstrap()) {
    startBootstrap(pathname, (body) => authedJson('/api/bootstrap', { method: 'POST', body }), { session: claimSessionReportOnce() });
  }

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
        if (!cancelled && res.data) {
          // Signed in but never registered (e.g. first Google sign-in): finish registration first.
          if (!res.data.onboardedAt && !res.data.owner) { router.replace('/register?continue=1'); return; }
          useAuthStore.getState().setUser(toUser(res.data, photoURL));
        }
      } catch (e) {
        // Offline or the server restarting ("Failed to fetch"): keep the saved profile, it refreshes
        // on the next focus. Only real errors are logged (and reach error reports).
        if (!(e instanceof TypeError)) console.error('Failed to fetch user data', e);
      }
    };

    let photoURL: string | null | undefined;
    let unsubscribe = () => {};
    const onSession = async (firebaseSignedIn: boolean) => {
      const token = localStorage.getItem('accessToken');
      signedIn = firebaseSignedIn || !!token?.startsWith('mock-token-') || !!token?.startsWith('ut1.');
      if (!cancelled) setIsSignedIn(signedIn);
      if (signedIn) {
        reportSession('SESSION');
        // With a saved profile the app shows right away and refreshes it in the background;
        // without one, wait for it so the navigation knows the role.
        if (useAuthStore.getState().user) void syncProfile();
        else await syncProfile();
      }
      if (!cancelled) setIsLoaded(true);
    };
    // Demo and LMS (LTI) sessions don't use Firebase: skip loading it (about 30 kB) for them.
    // Everyone else loads it here, after the page has rendered, not before.
    const stored = (() => { try { return localStorage.getItem('accessToken'); } catch { return null; } })();
    if (stored?.startsWith('mock-token-') || stored?.startsWith('ut1.')) void onSession(false);
    else {
      void Promise.all([import('@/lib/firebase'), import('firebase/auth')]).then(([{ auth }, { onAuthStateChanged }]) => {
        if (cancelled) return;
        unsubscribe = onAuthStateChanged(auth, (u) => { photoURL = u?.photoURL; void onSession(!!u); });
      });
    }

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

  // Signed up as a teacher / NGO and not approved yet: only the application page is available.
  useEffect(() => {
    if (waiting && pathname !== '/application') router.replace('/application');
  }, [waiting, pathname, router]);

  // Show the app skeleton while the session is restored (static markup, so no hydration mismatch)
  if (!mounted || ((!isLoaded || !isSignedIn) && !demoUser)) return <AppSkeleton />;

  if (waiting) {
    return (
      <DataConfig>
        <RealtimeSync />
        {pathname === '/application' ? children : <AppSkeleton />}
      </DataConfig>
    );
  }

  return (
    <DataConfig>
      <DashboardShell>
        <RealtimeSync />
        <LowDataSync />
        <NavDataPreload />
        <ActivityTracker />
        {children}
      </DashboardShell>
    </DataConfig>
  );
}

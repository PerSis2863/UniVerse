'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { useAuthStore } from '@/store/auth';
import { Role } from '@/types';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { api } from '@/lib/api';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user: demoUser, setUser } = useAuthStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const checkSync = async () => {
      const token = localStorage.getItem('accessToken');
      if (token && demoUser && demoUser.id.includes('@')) {
        try {
          const res = await api.get('/users/me');
          if (res.data) {
            setUser({
              id: res.data.id,
              name: res.data.name || 'Student',
              email: res.data.email,
              role: res.data.role as Role,
              avatar: res.data.avatar || undefined,
            });
          }
        } catch (e) {
          console.error("Failed to sync user data", e);
        }
      }
    };
    checkSync();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setIsSignedIn(true);
        // Sync Firebase User to our local store
        if (!demoUser || demoUser.id.includes('@')) {
          try {
            const res = await api.get('/users/me');
            if (res.data) {
              setUser({
                id: res.data.id,
                name: res.data.name || 'Student',
                email: res.data.email,
                role: res.data.role as Role,
                avatar: res.data.avatar || firebaseUser.photoURL || undefined,
              });
            }
          } catch (e) {
             console.error("Failed to fetch user data", e);
          }
        }
      } else {
        // If not firebase user, but we have a mock token, we consider them signed in
        const token = localStorage.getItem('accessToken');
        if (token && token.startsWith('mock-token-')) {
          setIsSignedIn(true);
        } else {
          setIsSignedIn(false);
        }
      }
      setIsLoaded(true);
    });

    return () => unsubscribe();
  }, [demoUser, setUser]);

  useEffect(() => {
    if (isLoaded && !isSignedIn && !demoUser) {
      router.replace('/login');
    }
  }, [isLoaded, isSignedIn, demoUser, router]);

  // Show nothing while loading auth or before mounting (to prevent hydration mismatch)
  if (!mounted || ((!isLoaded || !isSignedIn) && !demoUser)) return null;
  
  return <DashboardShell>{children}</DashboardShell>;
}

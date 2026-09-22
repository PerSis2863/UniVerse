'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useAuth } from '@clerk/nextjs';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { useAuthStore } from '@/store/auth';
import { Role } from '@/types';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, user: clerkUser } = useUser();
  const { signOut } = useAuth();
  const { user: demoUser, setUser } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    // Wait for Clerk to load before checking auth state
    if (isLoaded && !isSignedIn && !demoUser) {
      router.replace('/login');
    }
    
    // Sync Clerk User to our local store so Sidebar and other components can render
    if (isLoaded && isSignedIn && clerkUser && !demoUser) {
      setUser({
        id: clerkUser.id,
        name: clerkUser.fullName || 'Student',
        email: clerkUser.primaryEmailAddress?.emailAddress || '',
        role: 'STUDENT' as Role,
        avatar: clerkUser.imageUrl,
      });
    }
  }, [isLoaded, isSignedIn, demoUser, clerkUser, router, setUser]);

  // Show nothing while loading auth
  if ((!isLoaded || !isSignedIn) && !demoUser) return null;
  
  return <DashboardShell>{children}</DashboardShell>;
}

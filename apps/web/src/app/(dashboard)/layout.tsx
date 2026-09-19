'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { useAuthStore } from '@/store/auth';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  const { user: demoUser } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    // Wait for Clerk to load before checking auth state
    if (isLoaded && !isSignedIn && !demoUser) {
      router.replace('/login');
    }
  }, [isLoaded, isSignedIn, demoUser, router]);

  // Show nothing while loading auth
  if ((!isLoaded || !isSignedIn) && !demoUser) return null;
  
  return <DashboardShell>{children}</DashboardShell>;
}

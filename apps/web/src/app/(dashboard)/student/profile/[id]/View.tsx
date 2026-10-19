'use client';

import { usePathParams } from '@/hooks/usePathParams';
import { AddressLoading } from '@/components/layout/AddressLoading';
import { ProfileView } from '@/components/profile/ProfileView';

// Older links (/student/profile/<name or id>) open the same profile as /people/<id> (Stage 5 · Q18).
export default function StudentProfileRoute() {
  const p = usePathParams('/student/profile/[id]');
  return p ? <ProfileView key={p.id} id={p.id} /> : <AddressLoading portal />;
}

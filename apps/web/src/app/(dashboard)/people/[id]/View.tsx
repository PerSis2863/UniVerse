'use client';

import { usePathParams } from '@/hooks/usePathParams';
import { AddressLoading } from '@/components/layout/AddressLoading';
import { ProfileView } from '@/components/profile/ProfileView';

// Served for every address from the page built once with "open" (page.tsx): the id comes from the address.
export default function PeopleRoute() {
  const p = usePathParams('/people/[id]');
  return p ? <ProfileView key={p.id} id={p.id} /> : <AddressLoading portal />;
}

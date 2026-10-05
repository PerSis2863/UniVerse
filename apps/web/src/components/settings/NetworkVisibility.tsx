'use client';

import { useNetwork, VisibilitySwitch } from '@/components/network/CampusNetwork';

/** Settings → Privacy: "Let partner campuses find me", only once the school is in a campus network. */
export function NetworkVisibility() {
  const { data, mutate } = useNetwork();
  if (!data?.campuses.length) return null;
  return <VisibilitySwitch network={data} onChange={() => void mutate()} />;
}

'use client';

import { Topbar } from '@/components/layout/Topbar';
import { useTopNav } from '@/lib/top-nav';
import { InstallHyperion } from './InstallHyperion';

/** Hyperion's pages' bar: with the menu across the top, "Install Hyperion" is in that bar (TopNav), so no row of its
 *  own is left above the window (the owner, 23 Nov: "there is a lot of gap here"); with the side menu it stays here. */
export function HyperionTopbar({ title, subtitle }: { title: string; subtitle: string }) {
  const top = useTopNav();
  return <Topbar title={title} subtitle={subtitle} rightNode={top ? undefined : <InstallHyperion />} />;
}

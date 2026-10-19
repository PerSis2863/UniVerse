'use client';

import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, LIFE_TABS } from '@/components/layout/SectionTabs';
import Link from '@/components/ui/Link';
import { Segmented } from '@/components/ui/Segmented';
import { ClubElections } from '@/components/campus/ClubElections';
import { ClubBudget } from '@/components/campus/ClubBudget';
import { ClubCarbon } from '@/components/campus/ClubCarbon';
import { authedJson } from '@/lib/authed-fetch';

// Stage 5 · Q17: a club's own page for its members: elections, its money and its carbon tracker.

const TABS = [{ value: 'elections', label: 'Elections' }, { value: 'budget', label: 'Budget' }, { value: 'carbon', label: 'Carbon' }] as const;
type Tab = (typeof TABS)[number]['value'];

function ClubPage() {
  const q = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const club = q.get('club');
  const tab = (TABS.some((t) => t.value === q.get('tab')) ? q.get('tab') : 'elections') as Tab;
  const { data } = useSWR<{ club: { name: string } }>(club ? `/api/campus/clubs/${encodeURIComponent(club)}/elections` : null, authedJson);
  return (
    <>
      <Topbar title={data?.club.name ?? 'Club'} subtitle="Elections, money and footprint" />
      <SectionTabs tabs={LIFE_TABS} />
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-8 max-w-4xl mx-auto w-full min-w-0 space-y-4">
          <Link href="/student/life/associations" className="block w-fit text-sm text-indigo-700 dark:text-indigo-300 underline underline-offset-2">All clubs</Link>
          {club ? (
            <>
              <Segmented label="Club page" value={tab} onChange={(v) => router.replace(`${path}?club=${encodeURIComponent(club)}&tab=${v}`, { scroll: false })} segments={TABS.map((t) => ({ value: t.value, label: t.label }))} />
              {tab === 'elections' ? <ClubElections key={club} clubId={club} /> : tab === 'budget' ? <ClubBudget key={club} clubId={club} /> : <ClubCarbon key={club} clubId={club} showName={false} />}
            </>
          ) : <p className="text-sm text-zinc-600 dark:text-zinc-400">Open a club from Associations.</p>}
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return <Suspense><ClubPage /></Suspense>;
}

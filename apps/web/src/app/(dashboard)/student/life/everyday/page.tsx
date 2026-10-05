'use client';

import { CalendarDays, Store } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, LIFE_TABS } from '@/components/layout/SectionTabs';
import { CampusItemList } from '@/components/campus/CampusItems';
import { DiningMenu } from '@/components/campus/DiningMenu';
import Link from '@/components/ui/Link';

export default function EverydayLifePage() {
  return (
    <>
      <Topbar title="Everyday Life" subtitle="Campus events, dining, transport and services" />
      <SectionTabs tabs={LIFE_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-10">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-zinc-900 dark:text-white">Dining menu</h2>
              <Link href="/student/life/events" className="text-sm text-indigo-500 hover:underline inline-flex items-center gap-1"><CalendarDays className="w-4 h-4" /> Campus events</Link>
            </div>
            <DiningMenu />
          </section>
          <section>
            <h2 className="text-lg font-black text-zinc-900 dark:text-white mb-4">Services & places</h2>
            <CampusItemList
              kind="SERVICE"
              guide={{
                icon: Store,
                title: 'Your campus guide',
                description: 'Dining halls, cafés, shuttles, the campus store and other services — with opening hours and locations.',
                steps: ['Your admin adds campus services once', 'Everyone sees hours, locations and links in one place', 'Check back here instead of searching around'],
                example: [
                  { title: 'Central Dining Hall', meta: 'Dining · Mon–Sun 7:00–22:00', right: 'Block A' },
                  { title: 'Campus Shuttle', meta: 'Transport · every 15 min', right: 'Main Gate' },
                ],
              }}
            />
          </section>
        </div>
      </div>
    </>
  );
}

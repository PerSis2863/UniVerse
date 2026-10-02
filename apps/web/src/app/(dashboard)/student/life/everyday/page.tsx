'use client';

import { CalendarDays, Store } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, LIFE_TABS } from '@/components/layout/SectionTabs';
import { CampusItemList } from '@/components/campus/CampusItems';

export default function EverydayLifePage() {
  return (
    <>
      <Topbar title="Everyday Life" subtitle="Campus events, dining, transport and services" />
      <SectionTabs tabs={LIFE_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-10">
          <section>
            <h2 className="text-lg font-black text-zinc-900 dark:text-white mb-4">Campus events</h2>
            <CampusItemList
              kind="EVENT"
              guide={{
                icon: CalendarDays,
                title: 'Campus events will appear here',
                description: 'Career fairs, festivals, workshops and talks happening on your campus — added by your campus admin.',
                steps: ['Your admin posts events from Student Life management', 'Upcoming events show here with date, time and place', 'Tap a link to register or learn more'],
                example: [
                  { title: 'Career Fair 2026', meta: 'Fri, 14 Nov · 10:00 · Main Hall', right: 'Career' },
                  { title: 'Sustainability Hackathon', meta: 'Sat, 22 Nov · 09:00 · Innovation Lab', right: 'Impact' },
                ],
              }}
            />
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

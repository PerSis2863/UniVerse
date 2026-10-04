'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, HOME_TABS } from '@/components/layout/SectionTabs';
import { CampusItemList } from '@/components/campus/CampusItems';
import { CalendarDays, ChevronRight, FileText, HeartPulse, Link2, Megaphone, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';

interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  author?: { name: string | null } | null;
  course?: { name: string } | null;
}

// Built-in pages for the resources every school has (the school's own links are below them).
const SHORTCUTS = [
  { href: '/student/calendar', title: 'Academic calendar', text: 'Your classes, exams and deadlines.', icon: CalendarDays },
  { href: '/student/knowledge-hub', title: 'Handbooks & guides', text: 'Documents shared by your school and teachers.', icon: FileText },
  { href: '/student/life/medical', title: 'Health & wellness', text: 'Your medical record and emergency contacts.', icon: HeartPulse },
  { href: '/student/beesafe', title: 'Report a concern', text: 'Confidential BeeSafe report to campus safety.', icon: ShieldAlert },
];

const card = 'bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl';

export default function StudentInformation() {
  const { data: announcements, isLoading } = useSWR<Announcement[]>('/announcements', (url: string) => api.get(url).then((r) => r.data));
  const latest = (announcements ?? []).slice(0, 3);

  return (
    <>
      <Topbar title="Information" subtitle="Latest updates and resources from your school" />
      <SectionTabs tabs={HOME_TABS} />

      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-8">

          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-indigo-400" /> Announcements
            </h3>
            {isLoading ? (
              <div className="h-24 rounded-xl skeleton" />
            ) : latest.length === 0 ? (
              <p className={`${card} p-5 text-sm text-zinc-500`}>No announcements yet. Your school&apos;s news will appear here.</p>
            ) : (
              <div className={`${card} divide-y divide-zinc-200 dark:divide-zinc-800`}>
                {latest.map((a) => (
                  <article key={a.id} className="p-5">
                    <h4 className="font-semibold text-zinc-900 dark:text-white">{a.title}</h4>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1 whitespace-pre-line line-clamp-4">{a.body}</p>
                    <p className="text-xs text-zinc-500 mt-2">
                      {new Date(a.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                      {a.author?.name ? ` · ${a.author.name}` : ''}
                      {a.course?.name ? ` · ${a.course.name}` : ''}
                    </p>
                  </article>
                ))}
              </div>
            )}
            {(announcements?.length ?? 0) > latest.length && (
              <Link href="/student/community" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-500 hover:text-indigo-400">
                All announcements <ChevronRight className="w-4 h-4" />
              </Link>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-400" /> Important resources
            </h3>
            <div className={`${card} grid sm:grid-cols-2 divide-y sm:divide-y-0 divide-zinc-200 dark:divide-zinc-800`}>
              {SHORTCUTS.map(({ href, title, text, icon: Icon }) => (
                <Link key={href} href={href} className="flex items-start gap-3 p-4 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors rounded-xl">
                  <Icon className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
                  <span>
                    <span className="block font-medium text-zinc-900 dark:text-white">{title}</span>
                    <span className="block text-sm text-zinc-600 dark:text-zinc-400">{text}</span>
                  </span>
                </Link>
              ))}
            </div>
            <CampusItemList
              kind="LINK"
              guide={{
                icon: Link2,
                title: 'School links',
                description: 'Links your school adds (library, portal, campus map) appear here.',
                steps: ['An admin opens Student life → Links', 'They add a title and an address', 'It shows up here for every student'],
                example: [{ title: 'Campus map', meta: 'maps.your-school.edu' }],
              }}
            />
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-indigo-400" /> Upcoming events
            </h3>
            <CampusItemList
              kind="EVENT"
              guide={{
                icon: CalendarDays,
                title: 'No upcoming events',
                description: 'Events your school adds (career fairs, talks, workshops) appear here.',
                steps: ['An admin opens Student life → Events', 'They add the date, time and place', 'Students see it here'],
                example: [{ title: 'Career fair', meta: 'Main hall · 10:00', right: '18 Oct' }],
              }}
            />
          </section>
        </div>
      </div>
    </>
  );
}

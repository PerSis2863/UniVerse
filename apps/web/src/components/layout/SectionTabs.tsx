'use client';

import { usePathname } from 'next/navigation';
import Link from '@/components/ui/Link';
import { cn } from '@/lib/utils';

// Tabs that join related pages into one menu entry (e.g. Support and BeeSafe reporting): each tab
// is its own page, so links, bookmarks and notifications to either keep working.

export type SectionTab = { href: string; label: string };

export const SUPPORT_TABS: SectionTab[] = [
  { href: '/student/support', label: 'Help & support' },
  { href: '/student/beesafe', label: 'BeeSafe reporting' },
];

export const OPPORTUNITY_TABS: SectionTab[] = [
  { href: '/student/impact/ngo-marketplace', label: 'NGO projects' },
  { href: '/student/impact/startups', label: 'Startups' },
  { href: '/student/impact/companies', label: 'Companies' },
];

export const STUDENT_BOARD_TABS: SectionTab[] = [
  { href: '/student/blackboard', label: 'Course board' },
  { href: '/student/tutor', label: 'AI tutor' },
];

export const TEACHER_BOARD_TABS: SectionTab[] = [
  { href: '/teacher/blackboard', label: 'Course board' },
  { href: '/teacher/tutor', label: 'AI tutor' },
];

export const CREDENTIAL_TABS: SectionTab[] = [
  { href: '/student/credentials', label: 'My credentials' },
  { href: '/student/passport', label: 'Skills passport' },
];

export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Sections" className="px-4 sm:px-8 pt-4">
      <div className="inline-flex max-w-full overflow-x-auto scrollbar-none gap-1 p-1 rounded-2xl bg-zinc-100 dark:bg-white/[0.04] border border-zinc-200/70 dark:border-white/[0.06]">
        {tabs.map((t) => {
          const on = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors',
                on ? 'bg-white dark:bg-white/10 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white',
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

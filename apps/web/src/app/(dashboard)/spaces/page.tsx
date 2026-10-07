'use client';

import useSWR from 'swr';
import { ChevronRight, GraduationCap, LayoutGrid, Users } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, COLLAB_TABS } from '@/components/layout/SectionTabs';
import { authedJson } from '@/lib/authed-fetch';
import { FeatureGuide } from '@/components/ui/FeatureGuide';

// Spaces (Stage 4 · 3.1): each of my classes and study groups, with everything for it in one place.

interface Mine { courses: { id: string; code: string; name: string }[]; groups: { id: string; name: string }[] }
const card = 'rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl';

export default function SpacesPage() {
  const { data, isLoading } = useSWR<Mine>('/api/spaces', authedJson);
  const row = (href: string, title: string, meta: string, Icon: typeof Users) => (
    <Link key={href} href={href} className={`${card} lift p-4 flex items-center gap-3 hover:border-indigo-400/50`}>
      <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></span>
      <span className="flex-1 min-w-0"><span className="block font-medium text-zinc-900 dark:text-white truncate">{title}</span><span className="block text-xs text-zinc-500">{meta}</span></span>
      <ChevronRight className="w-4 h-4 text-zinc-400" />
    </Link>
  );
  return (
    <>
      <Topbar title="Spaces" subtitle="Each class and study group, with its call, documents, tasks and code in one place" />
      <SectionTabs tabs={COLLAB_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          {isLoading ? <div className="h-40 rounded-2xl skeleton" /> : !data?.courses.length && !data?.groups.length ? (
            <FeatureGuide icon={LayoutGrid} title="Everything for a class in one place" description="A space gathers a class's or study group's call, documents, task boards and code rooms, so nobody hunts through menus."
              steps={['Join a class or a study group', 'Open its space here', 'Start a call, a document or a task board for everyone in it']} />
          ) : (
            <>
              {!!data?.courses.length && <section className="space-y-2"><h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Classes</h2><div className="grid sm:grid-cols-2 gap-3 stagger">{data.courses.map((c) => row(`/spaces/course/${c.id}`, `${c.code} · ${c.name}`, 'Class space', GraduationCap))}</div></section>}
              {!!data?.groups.length && <section className="space-y-2"><h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Study groups</h2><div className="grid sm:grid-cols-2 gap-3 stagger">{data.groups.map((g) => row(`/spaces/group/${g.id}`, g.name, 'Group space', Users))}</div></section>}
            </>
          )}
        </div>
      </div>
    </>
  );
}

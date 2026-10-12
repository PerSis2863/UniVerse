'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, ADMIN_PEOPLE_TABS } from '@/components/layout/SectionTabs';
import { BulkImport } from '@/components/admin/BulkImport';
import Link from '@/components/ui/Link';
import { Layers, ArrowRight } from 'lucide-react';

export default function AdminImportPage() {
  return (
    <>
      <Topbar title="Import & export" subtitle="People, enrolments, courses and the timetable, from and to spreadsheets" />
      <SectionTabs tabs={ADMIN_PEOPLE_TABS} />
      <div className="p-4 md:p-8 max-w-4xl mx-auto w-full space-y-6">
        {/* SIS Integration Callout */}
        <div className="p-4 rounded-2xl border border-indigo-500/20 bg-indigo-50/50 dark:bg-indigo-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-indigo-500 shrink-0" />
            <span className="text-zinc-700 dark:text-zinc-300">
              Syncing from an institutional SIS (PowerSchool, Infinite Campus, Skyward)?
            </span>
          </div>
          <Link
            href="/admin/integrations/oneroster"
            className="inline-flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
          >
            OneRoster 1.2 SIS Sync <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <BulkImport />
      </div>
    </>
  );
}

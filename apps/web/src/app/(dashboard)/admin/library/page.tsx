'use client';

import { BookOpen } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { LibraryDesk } from '@/components/library/LibraryDesk';
import Link from '@/components/ui/Link';
import { SectionTabs, ADMIN_LEARN_TABS } from '@/components/layout/SectionTabs';

export default function LibraryDeskPage() {
  return (
    <>
      <Topbar title="Library desk" subtitle="Lend, take back, books, late books and fines"
        rightNode={<Link href="/library" className="btn-ghost btn-sm"><BookOpen className="w-4 h-4" /> Catalogue</Link>} />
      <SectionTabs tabs={ADMIN_LEARN_TABS} />
      <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
        <LibraryDesk />
      </div>
    </>
  );
}

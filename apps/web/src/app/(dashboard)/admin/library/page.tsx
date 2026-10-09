'use client';

import { BookOpen } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { LibraryDesk } from '@/components/library/LibraryDesk';
import Link from '@/components/ui/Link';

export default function LibraryDeskPage() {
  return (
    <>
      <Topbar title="Library desk" subtitle="Lend, take back, books, late books and fines"
        rightNode={<Link href="/library" className="btn-ghost btn-sm"><BookOpen className="w-4 h-4" /> Catalogue</Link>} />
      <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
        <LibraryDesk />
      </div>
    </>
  );
}

'use client';

import { Library } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, STUDENT_LEARN_TABS, TEACHER_LEARN_TABS } from '@/components/layout/SectionTabs';
import { LibraryHome } from '@/components/library/LibraryHome';
import Link from '@/components/ui/Link';
import { useAuthStore } from '@/store/auth';
import { useCan } from '@/lib/use-can';

// The school library for students and staff (Stage 5 · B15.4): a tab of Learning resources (students)
// and of the Knowledge Hub (teachers). Librarians also get a way to the desk.
export default function LibraryPage() {
  const role = useAuthStore((s) => s.user?.role);
  const librarian = useCan('library.manage');
  return (
    <>
      <Topbar title="Library" subtitle="Find books, reserve them and see what you’ve borrowed"
        rightNode={librarian ? <Link href="/admin/library" className="btn-secondary btn-sm"><Library className="w-4 h-4" /> Library desk</Link> : undefined} />
      {role === 'STUDENT' && <SectionTabs tabs={STUDENT_LEARN_TABS} />}
      {role === 'TEACHER' && <SectionTabs tabs={TEACHER_LEARN_TABS} />}
      <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
        <LibraryHome />
      </div>
    </>
  );
}

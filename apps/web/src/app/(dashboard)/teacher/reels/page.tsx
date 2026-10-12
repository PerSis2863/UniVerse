import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, TEACHER_BOARD_TABS } from '@/components/layout/SectionTabs';
import { LectureRevisionReels } from '@/components/lecture/LectureRevisionReels';

export const metadata = {
  title: 'Course Revision Reels - Universe',
  description: 'Manage automatically produced revision reels, 5-minute audio digests, and mind maps for your students.',
};

export default function TeacherReelsPage() {
  return (
    <>
      <Topbar
        title="Course Revision Reels"
        subtitle="Review auto-generated vertical micro-lessons and audio digests for your students"
      />
      <SectionTabs tabs={TEACHER_BOARD_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="mx-auto max-w-5xl">
          <LectureRevisionReels role="teacher" />
        </div>
      </div>
    </>
  );
}

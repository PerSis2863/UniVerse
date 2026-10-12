import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, STUDENT_BOARD_TABS } from '@/components/layout/SectionTabs';
import { LectureRevisionReels } from '@/components/lecture/LectureRevisionReels';

export const metadata = {
  title: 'Revision Reels & Micro-Lessons - Universe',
  description: 'Vertical bite-sized revision reels, 5-minute audio recaps, mind maps, and practice quizzes from your recorded lectures.',
};

export default function StudentReelsPage() {
  return (
    <>
      <Topbar
        title="Revision Reels"
        subtitle="Swipe through short-form micro-lessons and audio recaps from your classes"
      />
      <SectionTabs tabs={STUDENT_BOARD_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="mx-auto max-w-5xl">
          <LectureRevisionReels role="student" />
        </div>
      </div>
    </>
  );
}

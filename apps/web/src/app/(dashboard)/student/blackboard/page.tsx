import { CourseBoard } from '@/components/dashboard/CourseBoard';
import { SectionTabs, STUDENT_BOARD_TABS } from '@/components/layout/SectionTabs';

export const metadata = {
  title: 'Student Blackboard - Universe',
};

export default function StudentBlackboardPage() {
  return <CourseBoard role="student" tabs={<SectionTabs tabs={STUDENT_BOARD_TABS} />} />;
}

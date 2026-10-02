import { CourseBoard } from '@/components/dashboard/CourseBoard';
import { SectionTabs, TEACHER_BOARD_TABS } from '@/components/layout/SectionTabs';

export const metadata = {
  title: 'Teacher Blackboard - Universe',
};

export default function TeacherBlackboardPage() {
  return <CourseBoard role="teacher" tabs={<SectionTabs tabs={TEACHER_BOARD_TABS} />} />;
}

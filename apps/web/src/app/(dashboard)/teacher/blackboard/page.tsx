import { TeacherBlackboardClient } from '@/components/dashboard/TeacherBlackboardClient';

export const metadata = {
  title: 'Teacher Blackboard - Universe',
};

export default function TeacherBlackboardPage() {
  return <TeacherBlackboardClient initialCourse={null} />;
}

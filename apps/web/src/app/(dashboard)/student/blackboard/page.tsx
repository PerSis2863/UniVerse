import { StudentBlackboardClient } from '@/components/dashboard/StudentBlackboardClient';

export const metadata = {
  title: 'Student Blackboard - Universe',
};

export default function StudentBlackboardPage() {
  return <StudentBlackboardClient initialCourse={null} />;
}

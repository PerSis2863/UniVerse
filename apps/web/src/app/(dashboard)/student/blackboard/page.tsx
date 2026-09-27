import { CourseBoard } from '@/components/dashboard/CourseBoard';

export const metadata = {
  title: 'Student Blackboard - Universe',
};

export default function StudentBlackboardPage() {
  return <CourseBoard role="student" />;
}

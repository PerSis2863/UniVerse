import { CourseBoard } from '@/components/dashboard/CourseBoard';

export const metadata = {
  title: 'Teacher Blackboard - Universe',
};

export default function TeacherBlackboardPage() {
  return <CourseBoard role="teacher" />;
}

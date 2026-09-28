import { redirect } from 'next/navigation';

// A course's home is its Blackboard (announcements, materials, grades, quizzes).
export default async function CourseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/student/blackboard?course=${encodeURIComponent(id)}`);
}

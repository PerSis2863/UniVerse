import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { analyticsCourses, courseAnalytics } from '@/server/course-analytics';

// Course analytics: teachers see their own courses, admins every published course.
// GET ?courseId=  (defaults to the first course in the list)
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') return NextResponse.json({ error: 'Only teachers and admins can see course analytics.' }, { status: 403 });

  const courses = await analyticsCourses(user);
  const wanted = new URL(req.url).searchParams.get('courseId');
  // Only a course from the caller's own list, so a teacher can't read another teacher's class
  const course = wanted ? courses.find((c) => c.id === wanted) : courses[0];
  if (wanted && !course) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });

  return NextResponse.json(
    { courses, analytics: course ? await courseAnalytics(course) : null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

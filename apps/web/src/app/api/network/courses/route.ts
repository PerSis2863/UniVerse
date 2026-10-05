import { route } from '@/server/assignments';
import { BadRequestException, ForbiddenException } from '@/server/http';
import { shareableCourses, shareCourse, unshareCourse } from '@/server/campus-network';

// Joint courses (teachers for their own courses, admins for any).
// GET: courses with the partner campuses each is shared with.
// POST { courseId, campusId }: share with a campus. DELETE ?courseId=&campusId=: stop sharing.
const staffOnly = (role: string) => {
  if (role !== 'TEACHER' && role !== 'ADMIN') throw new ForbiddenException('Only teachers and admins can share courses.');
};

export const GET = (req: Request) => route(req, async (user) => {
  staffOnly(user.role);
  return shareableCourses(user);
});
export const POST = (req: Request) => route(req, async (user) => {
  staffOnly(user.role);
  const body = (await req.json().catch(() => ({}))) as { courseId?: unknown; campusId?: unknown };
  if (typeof body.courseId !== 'string') throw new BadRequestException('Pick a course.');
  return shareCourse(user, body.courseId, body.campusId);
});
export const DELETE = (req: Request) => route(req, async (user) => {
  staffOnly(user.role);
  const p = new URL(req.url).searchParams;
  return unshareCourse(user, p.get('courseId') ?? '', p.get('campusId') ?? '');
});

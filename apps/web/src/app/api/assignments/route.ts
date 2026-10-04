import { createAssignment, listAssignments, route } from '@/server/assignments';

// GET ?courseId= : assignments in courses you teach or take. POST: add one (the course's teacher).
// See src/server/assignments.ts.
export const GET = (req: Request) => route(req, (user) => listAssignments(user, new URL(req.url).searchParams.get('courseId')));

export const POST = (req: Request) => route(req, async (user) => createAssignment(user, await req.json().catch(() => ({})), req));

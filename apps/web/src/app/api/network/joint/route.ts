import { route } from '@/server/assignments';
import { jointCoursesFor } from '@/server/campus-network';

// GET (students): courses from partner campuses they can join, and their exchange campus's courses.
export const GET = (req: Request) => route(req, async (user) => (user.role === 'STUDENT' ? jointCoursesFor(user.id) : { courses: [], exchange: null }));

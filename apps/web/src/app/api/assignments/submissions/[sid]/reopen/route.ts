import { reopenSubmission, route } from '@/server/assignments';

// Lets a student hand in again after their answer was graded (src/server/assignments.ts).

type Ctx = { params: Promise<{ sid: string }> };

export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => reopenSubmission((await params).sid, user));

import { postGrades, route } from '@/server/assignments';

// Puts grades held until posted into the gradebook, a few at a time (src/server/assignments.ts).

type Ctx = { params: Promise<{ id: string }> };

export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => postGrades((await params).id, user, req));

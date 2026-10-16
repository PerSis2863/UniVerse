import { route } from '@/server/assignments';
import { rubricHelp } from '@/server/student-assignment';

// The rubric in plain words, made once by AI for the class (src/server/student-assignment.ts).

type Ctx = { params: Promise<{ id: string }> };

export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => rubricHelp((await params).id, user));

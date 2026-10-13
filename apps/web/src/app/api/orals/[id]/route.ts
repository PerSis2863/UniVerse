import { route } from '@/server/assignments';
import { deleteOral, oralSession } from '@/server/oral';

// One oral (Stage 5 · D11): mine, or for its teacher a student's attempt at their oral check.
// DELETE: forget one of my practice orals.
type Ctx = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => oralSession(user, (await params).id));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => deleteOral(user, (await params).id));

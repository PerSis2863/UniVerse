import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { courseOralChecks, createOralCheck } from '@/server/oral';

// Course board → Oral checks (Stage 5 · D11). GET: the course's oral checks (the teacher sees how
// many did each; a student the open ones and their own). POST: the teacher sets a new one.
type Ctx = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => courseOralChecks(user, (await params).id));
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => createOralCheck(user, (await params).id, ((await req.json().catch(() => null)) ?? {}) as Body));

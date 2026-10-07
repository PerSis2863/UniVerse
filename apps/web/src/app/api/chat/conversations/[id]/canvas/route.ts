import { route } from '@/server/assignments';
import { chatCanvas } from '@/server/docs';

type Ctx = { params: Promise<{ id: string }> };
// The chat's canvas (Stage 4 · 1.12): GET → { id } (null if none yet); POST makes it if needed.
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => chatCanvas((await params).id, user, false));
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => chatCanvas((await params).id, user, true));

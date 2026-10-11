import { route } from '@/server/assignments';
import { deleteCallRecording, getCallRecording, trimCallRecording } from '@/server/call-recordings';

// A call's recording (Stage 4 · 2.9). GET: for the people it's for, with chapters (and the
// transcript for those who were in the call). DELETE: whoever recorded it removes it.
type Ctx = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => getCallRecording((await params).id, user));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => deleteCallRecording((await params).id, user));
// Stage 5 · B8.9: { trimStart, trimEnd }: the part people see.
export const PATCH = (req: Request, { params }: Ctx) => route(req, async (user) => trimCallRecording((await params).id, user, await req.json().catch(() => ({}))));

import { route } from '@/server/assignments';
import { docAi } from '@/server/doc-ai';

type Ctx = { params: Promise<{ id: string }> };
// The AI writing helper (Stage 5 · B9.4): improve, shorten, fix, explain, translate or continue text.
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => docAi((await params).id, user, await req.json().catch(() => ({}))));

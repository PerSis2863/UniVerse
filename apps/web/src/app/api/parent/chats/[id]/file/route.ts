import { route } from '@/server/assignments';
import { sendParentFile } from '@/server/parent-messages';

// POST (form data "file"): a parent sends a photo or a PDF in a parent–teacher chat (Stage 5 · Q22).
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => sendParentFile(user, (await params).id, await req.formData()));

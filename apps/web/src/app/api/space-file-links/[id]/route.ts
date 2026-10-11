import { route } from '@/server/assignments';
import { deleteFileLink } from '@/server/space-files';

type Ctx = { params: Promise<{ id: string }> };
// Stops a share link (Stage 5 · B9.13).
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => deleteFileLink((await params).id, user));

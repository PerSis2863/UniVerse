import { route } from '@/server/assignments';
import { bookAction, bookDetail } from '@/server/library';

// One book (Stage 5 · B15.4). GET: details (librarians: copies and holds). POST: save, copies, copy status, remove a copy, delete (library.manage).
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => bookDetail(user, (await params).id));
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => bookAction(user, (await params).id, await req.json().catch(() => ({}))));

import { route } from '@/server/assignments';
import { deleteDoc, getDoc, updateDoc } from '@/server/docs';

type Ctx = { params: Promise<{ id: string }> };
// GET: the document's details (the text itself comes over the live connection). PATCH { title }. DELETE.
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => getDoc((await params).id, user));
export const PATCH = (req: Request, { params }: Ctx) => route(req, async (user) => updateDoc((await params).id, user, await req.json().catch(() => ({}))));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => deleteDoc((await params).id, user));

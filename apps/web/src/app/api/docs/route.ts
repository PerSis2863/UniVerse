import { route } from '@/server/assignments';
import { createDoc, listDocs } from '@/server/docs';

// GET: my documents (mine, shared with me, my courses') and my courses. POST { title?, courseId? }: a new one.
export const GET = (req: Request) => route(req, (user) => listDocs(user));
export const POST = (req: Request) => route(req, async (user) => createDoc(user, await req.json().catch(() => ({}))));

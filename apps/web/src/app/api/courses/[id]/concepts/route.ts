import { route } from '@/server/assignments';
import { conceptAction, listConcepts } from '@/server/learning-dna';

// A course's concepts for Learning DNA (Stage 5 · D1; src/server/learning-dna.ts). GET: the list. POST { action: 'add' | 'edit' | 'remove' | 'order', … } (the teacher).
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => listConcepts(user, (await params).id));
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => conceptAction(user, (await params).id, await req.json().catch(() => ({}))));

import { route } from '@/server/assignments';
import { setTags, taggables } from '@/server/learning-dna';

// What tests each concept (Stage 5 · D1). GET: quiz questions and rubric criteria with their concepts. POST { items: [{ kind, refId, conceptIds }] }.
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => taggables(user, (await params).id));
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => setTags(user, (await params).id, await req.json().catch(() => ({}))));

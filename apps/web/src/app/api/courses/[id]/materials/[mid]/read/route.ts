import { route } from '@/server/assignments';
import { prepareMaterial, readMaterial } from '@/server/material-reader';

type Ctx = { params: Promise<{ id: string; mid: string }> };
// GET: a course material as text in sections, to read and translate (Stage 5 · D8).
// POST: the teacher makes the text now (when the AI tutor hasn't read the file yet).
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => { const p = await params; return readMaterial(p.id, p.mid, user); });
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => { const p = await params; return prepareMaterial(p.id, p.mid, user); });

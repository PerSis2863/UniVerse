import { route } from '@/server/assignments';
import { deleteApplication, listApplications, saveApplication } from '@/server/careers';

// Stage 5 · Q15: the student's application tracker.
// GET: my applications · POST { id?, title, company, url, location, stage, appliedAt, nextStep, nextAt, notes, documents } · DELETE ?id=

export const GET = (req: Request) => route(req, (user) => listApplications(user));
export const POST = (req: Request) => route(req, async (user) => saveApplication(user, await req.json().catch(() => ({}))));
export const DELETE = (req: Request) => route(req, (user) => deleteApplication(user, new URL(req.url).searchParams.get('id') ?? ''));

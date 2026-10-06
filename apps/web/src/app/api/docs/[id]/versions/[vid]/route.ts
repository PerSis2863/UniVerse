import { route } from '@/server/assignments';
import { getVersion } from '@/server/docs';

// GET: one saved version (its HTML, shown read-only and restorable).
export const GET = (req: Request, { params }: { params: Promise<{ id: string; vid: string }> }) => route(req, async (user) => { const p = await params; return getVersion(p.id, p.vid, user); });

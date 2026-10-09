import { route } from '@/server/assignments';
import { routeAction, routeDetail } from '@/server/registers';

// One bus route (Stage 5 · B15.5). GET: stops and riders. POST { action: 'save' | 'add' | 'remove' | 'delete', … }.
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => routeDetail(user, (await params).id));
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => routeAction(user, (await params).id, await req.json().catch(() => ({}))));

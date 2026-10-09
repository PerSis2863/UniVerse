import { route } from '@/server/assignments';
import { assetAction, assetDetail } from '@/server/registers';

// One item of equipment (Stage 5 · B15.5). GET: details and history. POST { action: 'save' | 'move' | 'lend' | 'return' | 'status' | 'seen' | 'delete', … }.
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => assetDetail(user, (await params).id));
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => assetAction(user, (await params).id, await req.json().catch(() => ({}))));

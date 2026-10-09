import { route } from '@/server/assignments';
import { roomAction } from '@/server/registers';

// One hostel room (Stage 5 · B15.5). POST { action: 'save' | 'add' | 'remove' | 'delete', … }.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => roomAction(user, (await params).id, await req.json().catch(() => ({}))));

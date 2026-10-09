import { route } from '@/server/assignments';
import { cancelMeeting } from '@/server/parent-meetings';

// One of my booked meetings (Stage 5 · B16.3). POST { action: 'cancel' }: gives the time back (until it starts).
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => cancelMeeting(user, (await params).id, await req.json().catch(() => ({}))));

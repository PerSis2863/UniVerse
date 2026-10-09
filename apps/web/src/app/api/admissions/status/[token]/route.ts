import { publicRoute } from '@/server/public-route';
import { familyAction, familyStatus } from '@/server/admissions';

// A family's private application page (Stage 5 · B15.1): the link is the key. GET: where it stands.
// POST { action: 'accept' | 'decline' | 'withdraw' }.
export const GET = async (_req: Request, { params }: { params: Promise<{ token: string }> }) => publicRoute(async () => familyStatus((await params).token));
export const POST = async (req: Request, { params }: { params: Promise<{ token: string }> }) => publicRoute(async () => familyAction((await params).token, await req.json().catch(() => ({}))));

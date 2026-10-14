import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { prepareRelay, relayChoices } from '@/server/qr-relay';

// Stage 5 · D17: what the teacher can send to phones as moving QR codes, and one item prepared and signed.
export const GET = (req: Request) => route(req, (user) => relayChoices(user, new URL(req.url).searchParams.get('courseId')));
export const POST = (req: Request) => route(req, async (user) => prepareRelay(user, ((await req.json().catch(() => null)) as Body | null) ?? {}));

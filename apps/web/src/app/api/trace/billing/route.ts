import { route } from '@/server/assignments';
import { traceCheckout } from '@/server/trace-billing';

// POST { kind: 'pro' } or { kind: 'campaign', campaignId, points }: a Stripe Checkout address (M201).
export const POST = (req: Request) => route(req, async (user) => traceCheckout(user, (await req.json().catch(() => ({}))) ?? {}, new URL(req.url).origin));

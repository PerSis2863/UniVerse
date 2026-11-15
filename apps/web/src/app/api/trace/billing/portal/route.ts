import { route } from '@/server/assignments';
import { tracePortal } from '@/server/trace-billing';

// POST: Stripe's page to change or cancel Trace PRO and see invoices (M201).
export const POST = (req: Request) => route(req, (user) => tracePortal(user, new URL(req.url).origin));

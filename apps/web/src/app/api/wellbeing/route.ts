import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { wellbeingAction, wellbeingView } from '@/server/wellbeing';

// Wellbeing radar for students (Stage 5 · D13, opt-in). GET: my settings, check-ins, private nudges
// and requests. POST { action: 'join' | 'settings' | 'check-in' | 'ask' | 'leave', … }.
export const GET = (req: Request) => route(req, (user) => wellbeingView(user));
export const POST = (req: Request) => route(req, async (user) => wellbeingAction(user, ((await req.json().catch(() => null)) ?? {}) as Body));

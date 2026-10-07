import { route } from '@/server/assignments';
import { officeState, setOfficeHours } from '@/server/office-hours';

// Office hours (Stage 4 · 4.7; src/server/office-hours.ts). GET: mine (teachers) or my teachers' open
// ones (students). POST { open, minutes?, topic? }: a teacher opens or closes them.
export const GET = (req: Request) => route(req, (user) => officeState(user));
export const POST = (req: Request) => route(req, async (user) => setOfficeHours(user, await req.json().catch(() => ({}))));

import { route } from '@/server/assignments';
import { myStaff, myStaffAction } from '@/server/staff';

// A teacher's own staff page (Stage 5 · B15.8; src/server/staff.ts). GET ?today=: my day, leave and covers.
// POST { action: 'in' | 'out', date } | { action: 'leave', type, fromDate, toDate, reason? } | { action: 'cancel', leaveId }.
export const GET = (req: Request) => route(req, (user) => myStaff(user, new URL(req.url).searchParams.get('today')));
export const POST = (req: Request) => route(req, async (user) => myStaffAction(user, await req.json().catch(() => ({}))));

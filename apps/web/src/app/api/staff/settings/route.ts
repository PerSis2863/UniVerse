import { route } from '@/server/assignments';
import { need } from '@/server/permissions';
import { saveStaffSettings, staffSettings } from '@/server/staff';

// Leave allowances (Stage 5 · Q22): days a year for each kind of leave and when the leave year
// starts. GET and POST need staff.manage.
export const GET = (req: Request) => route(req, async (user) => { await need(user, 'staff.manage'); return staffSettings(); });
export const POST = (req: Request) => route(req, async (user) => saveStaffSettings(user, ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>));

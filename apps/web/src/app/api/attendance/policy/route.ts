import { route } from '@/server/assignments';
import { checkinPolicy, setCheckinPolicy } from '@/server/attendance-plus';
import { policySchools } from '@/server/safety';

// The school's location check for class check-ins (Stage 5 · Q11). GET: whether it's on (anyone
// signed in: phones ask for the position only then; the campus's own position for admins).
// PUT { on, lat, lng, radius }: admins.
export const GET = (req: Request) => route(req, async (user) => {
  const admin = user.role === 'ADMIN' || user.owner;
  const p = await checkinPolicy(admin ? (await policySchools(user))[0] : user.organizationId);
  return admin ? p : { on: p.on, radius: p.radius };
});
export const PUT = (req: Request) => route(req, async (user) => setCheckinPolicy(user, (await req.json().catch(() => ({}))) ?? {}));

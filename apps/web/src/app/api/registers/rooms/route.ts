import { route } from '@/server/assignments';
import { audit } from '@/server/audit';
import { createRooms, rooms } from '@/server/registers';

// Hostel rooms (Stage 5 · B15.5). GET: rooms with residents. POST: a room, or several numbered rooms.
export const GET = (req: Request) => route(req, (user) => rooms(user));
export const POST = (req: Request) => route(req, async (user) => {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const out = await createRooms(user, b);
  audit(user, { action: 'registers.rooms_added', summary: `Added ${out.created} hostel room${out.created === 1 ? '' : 's'} in ${String(b.building ?? '').slice(0, 60)}`, targetType: 'hostel-room' }, req);
  return out;
});

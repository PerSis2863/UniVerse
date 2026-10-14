import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { placeRoom } from '@/server/campus-map';

// The campus map (Stage 5 · D15). PATCH { buildingId, floor? }: admins put a room in a building, on a floor (null: off the map).
type Ctx = { params: Promise<{ id: string }> };
export const PATCH = (req: Request, { params }: Ctx) => route(req, async (user) => placeRoom(user, (await params).id, ((await req.json().catch(() => null)) ?? {}) as Body));

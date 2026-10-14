import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { placeEvent } from '@/server/campus-map';

// The campus map (Stage 5 · D15). PATCH { buildingId }: admins say which building a campus event is in.
type Ctx = { params: Promise<{ id: string }> };
export const PATCH = (req: Request, { params }: Ctx) => route(req, async (user) => placeEvent(user, (await params).id, ((await req.json().catch(() => null)) ?? {}) as Body));

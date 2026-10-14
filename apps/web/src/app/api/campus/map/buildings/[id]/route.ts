import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { deleteBuilding, updateBuilding } from '@/server/campus-map';

// One building on the campus map (Stage 5 · D15). PATCH: admins rename, move or resize it. DELETE: off the map (its rooms stay).
type Ctx = { params: Promise<{ id: string }> };
export const PATCH = (req: Request, { params }: Ctx) => route(req, async (user) => updateBuilding(user, (await params).id, ((await req.json().catch(() => null)) ?? {}) as Body));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => deleteBuilding(user, (await params).id));

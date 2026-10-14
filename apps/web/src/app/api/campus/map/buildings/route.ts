import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { addBuilding } from '@/server/campus-map';

// The campus map (Stage 5 · D15). POST { name, code?, campusId?, floors?, color?, x?, y?, w?, h? }: admins add a building.
export const POST = (req: Request) => route(req, async (user) => addBuilding(user, ((await req.json().catch(() => null)) ?? {}) as Body));

import { route } from '@/server/assignments';
import { deleteCampus, updateCampus } from '@/server/campus-network';

type Ctx = { params: Promise<{ id: string }> };

// PATCH (admins): edit a campus. DELETE: remove it (its people simply have no campus any more).
export const PATCH = async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  return route(req, async (user) => updateCampus(user, id, await req.json().catch(() => ({}))));
};
export const DELETE = async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  return route(req, (user) => deleteCampus(user, id));
};

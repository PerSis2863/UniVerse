import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { importItems } from '@/server/course-cartridge';

// Adds a batch of items read from a Common Cartridge to a hidden module (src/server/course-cartridge.ts):
// POST { moduleId?, title?, summary?, items }.

type Ctx = { params: Promise<{ id: string }> };

export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => importItems((await params).id, user, ((await req.json().catch(() => ({}))) ?? {}) as Body));

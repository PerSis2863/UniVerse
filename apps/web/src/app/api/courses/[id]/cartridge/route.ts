import { route } from '@/server/assignments';
import { cartridgeData } from '@/server/course-cartridge';

// The course's modules with what each item points to, for a Common Cartridge export made in the
// browser (src/server/course-cartridge.ts, src/lib/cc-export.ts). Teachers and co-teachers.

type Ctx = { params: Promise<{ id: string }> };

export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => cartridgeData((await params).id, user));

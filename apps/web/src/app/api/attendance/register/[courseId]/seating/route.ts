import { route } from '@/server/assignments';
import { saveSeating } from '@/server/attendance-plus';

// PUT { rows, cols, seats: { "<row>-<col>": studentId } }: the course's seating chart.
type Ctx = { params: Promise<{ courseId: string }> };
export const PUT = (req: Request, { params }: Ctx) => route(req, async (user) => saveSeating((await params).courseId, user, (await req.json().catch(() => ({}))) ?? {}));

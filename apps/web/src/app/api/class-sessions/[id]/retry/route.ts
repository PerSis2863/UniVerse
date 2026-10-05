import { route } from '@/server/assignments';
import { retryClassSession } from '@/server/class-companion';

// POST: make the study pack for class notes saved while AI was unavailable (teacher).
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => retryClassSession((await params).id, user));

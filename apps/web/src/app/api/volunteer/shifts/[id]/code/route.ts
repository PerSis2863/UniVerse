import { route } from '@/server/assignments';
import { shiftCode } from '@/server/volunteering';

// GET (admin or teacher): the check-in code for the next 30 seconds (signed, never stored).
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => shiftCode(user, (await params).id));

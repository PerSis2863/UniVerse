import { route } from '@/server/assignments';
import { feeReceipt } from '@/server/fees';

// A fee receipt (Stage 5 · B15.2), for the school's admins, the student and their linked parents.
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => feeReceipt(user, (await params).id));

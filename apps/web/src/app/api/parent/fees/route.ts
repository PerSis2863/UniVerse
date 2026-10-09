import { route } from '@/server/assignments';
import { parentFees } from '@/server/fees';

// A linked child's fee bills and receipts, for the parent app (Stage 5 · B16.5 with B15.2). GET ?studentId=.
export const GET = (req: Request) => route(req, (user) => parentFees(user, new URL(req.url).searchParams.get('studentId')));

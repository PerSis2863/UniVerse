import { route } from '@/server/assignments';
import { verifyReceipt } from '@/server/student-assignment';

// Checks a hand-in receipt (src/server/student-assignment.ts): GET ?code=.

export const GET = (req: Request) => route(req, (user) => verifyReceipt(new URL(req.url).searchParams.get('code') ?? '', user));

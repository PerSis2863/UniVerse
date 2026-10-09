import { route } from '@/server/assignments';
import { myFees } from '@/server/fees';

// My fee bills and receipts (Stage 5 · B15.2).
export const GET = (req: Request) => route(req, (user) => myFees(user));

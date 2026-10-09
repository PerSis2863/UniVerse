import { route } from '@/server/assignments';
import { feeReport } from '@/server/fees';

// Fee totals (Stage 5 · B15.2): by currency and status, collections by method and month.
export const GET = (req: Request) => route(req, (user) => feeReport(user));

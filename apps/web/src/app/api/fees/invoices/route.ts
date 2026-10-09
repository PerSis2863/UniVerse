import { route } from '@/server/assignments';
import { feeInvoices } from '@/server/fees';

// Fee bills (Stage 5 · B15.2). GET ?planId=&status=&overdue=1&q= (a name, an email or a bill number).
export const GET = (req: Request) => route(req, (user) => feeInvoices(user, new URL(req.url).searchParams));

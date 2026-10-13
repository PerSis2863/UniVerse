import { route } from '@/server/assignments';
import { receiptPreview } from '@/server/ai-receipts';

// GET (Stage 5 · D12): the assignment's AI rule, and the AI help the student used since it was set
// (what they'd attach as their AI receipt when handing in).
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => receiptPreview(user, (await params).id));

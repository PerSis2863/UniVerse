import { route } from '@/server/assignments';
import { myAiUses } from '@/server/ai-receipts';

// GET (Stage 5 · D12): my own record of the AI help I used in UniVerse (the last 180 days).
export const GET = (req: Request) => route(req, (user) => myAiUses(user));

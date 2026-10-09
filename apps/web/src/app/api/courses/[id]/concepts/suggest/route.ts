import { route } from '@/server/assignments';
import { suggestConcepts } from '@/server/learning-dna';

// AI-proposed concepts for a course (Stage 5 · D1), within the AI allowance; not saved.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => suggestConcepts(user, (await params).id));

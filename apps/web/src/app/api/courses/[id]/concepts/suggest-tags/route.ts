import { route } from '@/server/assignments';
import { suggestTags } from '@/server/learning-dna';

// AI-suggested concepts for a quiz's questions or an assignment's criteria (Stage 5 · D1); not saved. POST { quizId | assignmentId }.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => suggestTags(user, (await params).id, await req.json().catch(() => ({}))));

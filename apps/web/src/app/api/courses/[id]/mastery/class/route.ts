import { route } from '@/server/assignments';
import { classMastery } from '@/server/learning-dna';

// The class's Learning DNA (Stage 5 · D1): concept × student and what to re-teach. The teacher only.
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => classMastery(user, (await params).id));

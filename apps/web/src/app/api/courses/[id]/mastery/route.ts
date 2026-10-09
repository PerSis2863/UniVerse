import { route } from '@/server/assignments';
import { studentMastery } from '@/server/learning-dna';

// A student's Learning DNA in a course (Stage 5 · D1). GET [?student= for the teacher].
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => studentMastery(user, (await params).id, new URL(req.url).searchParams.get('student')));

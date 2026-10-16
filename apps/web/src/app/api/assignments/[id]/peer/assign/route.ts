import { route } from '@/server/assignments';
import { handOutReviews } from '@/server/peer-review';

// Hands out peer reviews for an assignment (teacher and co-teachers; src/server/peer-review.ts).

type Ctx = { params: Promise<{ id: string }> };

export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => handOutReviews((await params).id, user, req));

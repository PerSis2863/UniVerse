import { route } from '@/server/assignments';
import { listMyMicroLessons } from '@/server/lecture-micro-lessons';

// Stage 5 · D3: the latest micro-lessons from my classes (Revision Reels with no class chosen).
export const GET = (req: Request) => route(req, (user) => listMyMicroLessons(user));

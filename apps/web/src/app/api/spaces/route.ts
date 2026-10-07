import { route } from '@/server/assignments';
import { mySpaces } from '@/server/spaces';

// GET: my spaces (my courses and study groups). See src/server/spaces.ts.
export const GET = (req: Request) => route(req, (user) => mySpaces(user));

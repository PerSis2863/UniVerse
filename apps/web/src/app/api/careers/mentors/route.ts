import { route } from '@/server/assignments';
import { mentorDirectory } from '@/server/careers';

// Stage 5 · Q15: alumni and mentors taking bookings, with their next free times.
export const GET = (req: Request) => route(req, (user) => mentorDirectory(user));

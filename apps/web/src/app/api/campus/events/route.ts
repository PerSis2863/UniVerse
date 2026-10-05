import { route } from '@/server/assignments';
import { listEvents } from '@/server/campus-life';

// GET: upcoming campus events with seats taken and my RSVP (upgrade 7).
export const GET = (req: Request) => route(req, (user) => listEvents(user));

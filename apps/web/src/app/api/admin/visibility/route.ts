import { route } from '@/server/assignments';
import { schoolVisibility } from '@/server/visibility';

// GET: what is kept to the admin's school, counted (M199, Admin → Safety → Who can see what).
export const GET = (req: Request) => route(req, (user) => schoolVisibility(user));

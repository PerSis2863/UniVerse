import { route } from '@/server/assignments';
import { campusUsage } from '@/server/campus-map';

// The campus map (Stage 5 · D15). GET ?date=YYYY-MM-DD&weeks=1|2|4|8|12[&campus][&building]: admins see how much rooms were used.
export const GET = (req: Request) => route(req, (user) => campusUsage(user, new URL(req.url).searchParams));

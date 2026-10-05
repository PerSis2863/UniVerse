import { route } from '@/server/assignments';
import { volunteeringReport } from '@/server/volunteering';

// GET ?year=YYYY: verified volunteer hours by place, project and SDG (no names): the map and yearly report.
export const GET = (req: Request) => route(req, () => volunteeringReport(new URL(req.url).searchParams.get('year')));

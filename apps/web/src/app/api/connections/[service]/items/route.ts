import { route } from '@/server/assignments';
import { connectionItems } from '@/server/connection-items';

type Ctx = { params: Promise<{ service: string }> };

// GET [?from&to]: the newest mail, Slack messages, calendar events or Classroom classes, read live for me.
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => connectionItems(user, (await params).service, new URL(req.url).searchParams));

import { route } from '@/server/assignments';
import { updateBlock } from '@/server/smart-planner';

// PATCH { done } ticks a study session; { date, start } moves it (it then stays where it was put).
export const PATCH = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => updateBlock(user.id, (await params).id, await req.json().catch(() => ({}))));

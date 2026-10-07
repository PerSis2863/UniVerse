import { route } from '@/server/assignments';
import { callVideos } from '@/server/calls';

// GET: videos this call can watch together from its course (Stage 4 · 4.8).
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => callVideos((await params).id, user));

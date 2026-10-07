import { route } from '@/server/assignments';
import { quietSettings, setQuiet } from '@/server/safety';

// My quiet hours (Stage 4 · 4.10): GET ?tz=, POST { on, start, end, tz } (not when the school sets them).
export const GET = (req: Request) => route(req, (user) => quietSettings(user, new URL(req.url).searchParams.get('tz')));
export const POST = (req: Request) => route(req, async (user) => setQuiet(user, await req.json().catch(() => ({}))));

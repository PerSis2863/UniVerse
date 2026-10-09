import { route } from '@/server/assignments';
import { catalogue } from '@/server/library';

// The library catalogue (Stage 5 · B15.4; src/server/library.ts). GET ?q= (title, author, subject or ISBN).
export const GET = (req: Request) => route(req, (user) => catalogue(user, new URL(req.url).searchParams.get('q') ?? ''));

import { route } from '@/server/assignments';
import { createCallLink } from '@/server/calls';

// POST: a new call link (like a FaceTime link). Anyone signed in to UniVerse with the link can join;
// whoever made it hosts the call.
export const POST = (req: Request) => route(req, (user) => createCallLink(user));

import { randomBytes } from 'node:crypto';
import { route } from '@/server/assignments';

// POST: a new call link (like a FaceTime link). Anyone signed in to UniVerse with the link can join.
export const POST = (req: Request) => route(req, async () => {
  const id = `l_${randomBytes(12).toString('base64url')}`;
  return { id, path: `/call/${id}` };
});

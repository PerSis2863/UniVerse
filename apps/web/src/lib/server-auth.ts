// Server-side (route handler) helper: confirms the caller is a signed-in UniVerse user from the
// bearer token. Keeps paid services (Gemini, file storage) from being used anonymously by anyone
// who finds the endpoint.
import { demoWriteBlocked, extractBearer, resolveUser } from '@/server/auth';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const token = extractBearer(request.headers.get('authorization'));
  if (!token) return null;
  try {
    const user = await resolveUser(token);
    if (demoWriteBlocked(request, user, token)) return null;
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  } catch {
    return null;
  }
}

/** Same check as getSessionUser, for server actions (which receive the token as an argument). */
export async function getUserFromToken(token: string | null | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  return getSessionUser(new Request('http://internal', { headers: { authorization: `Bearer ${token}` } }));
}

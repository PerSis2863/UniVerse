// Server-side (route handler) helper: confirms the caller is a signed-in UniVerse user from the
// bearer token. Keeps paid services (Gemini, file storage) from being used anonymously by anyone
// who finds the endpoint.
import { demoWriteBlocked, extractBearer, isOwner, resolveUser } from '@/server/auth';
import { hasPass, needsTwoStep } from '@/server/two-step';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  /** The platform owner (verified sign-in): every feature, whatever the plan. */
  owner?: boolean;
}

export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const token = extractBearer(request.headers.get('authorization'));
  if (!token) return null;
  try {
    const user = await resolveUser(token);
    if (demoWriteBlocked(request, user, token)) return null;
    // Admins and the owner must have typed the emailed sign-in code (src/server/two-step.ts).
    if (needsTwoStep(user.role, token) && !hasPass(request, user.id, token)) return null;
    return { id: user.id, name: user.name, email: user.email, role: user.role, owner: isOwner(user) };
  } catch {
    return null;
  }
}

/** Same check as getSessionUser, for server actions (which receive the token as an argument). */
export async function getUserFromToken(token: string | null | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  return getSessionUser(new Request('http://internal', { headers: { authorization: `Bearer ${token}` } }));
}

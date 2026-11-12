// Server-side (route handler) helper: confirms the caller is a signed-in UniVerse user from the
// bearer token. Keeps paid services (Gemini, file storage) from being used anonymously by anyone
// who finds the endpoint.
import { demoWriteBlocked, extractBearer, guardianBlocked, isOwner, resolveUser, viewAsBlocked } from '@/server/auth';
import { hasPass, needsTwoStep } from '@/server/two-step';
import { isViewAsToken } from '@/server/session-token';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  /** The platform owner (verified sign-in): every feature, whatever the plan. */
  owner?: boolean;
  /** Organization this person belongs to, if scoped to a school. */
  organizationId?: string | null;
}

export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const token = extractBearer(request.headers.get('authorization'));
  if (!token) return null;
  try {
    const user = await resolveUser(token);
    if (demoWriteBlocked(request, user, token) || guardianBlocked(request, user) || viewAsBlocked(request, token)) return null;
    // Admins and the owner must have typed the emailed sign-in code (src/server/two-step.ts).
    if (needsTwoStep(user.role, token) && !hasPass(request, user.id, token)) return null;
    return { id: user.id, name: user.name, email: user.email, role: user.role, owner: isOwner(user), organizationId: user.organizationId ?? null };
  } catch {
    return null;
  }
}

/**
 * Same check as getSessionUser, for server actions (which receive the token as an argument). `pass`
 * is an admin's two-step pass (twoStepPass() in the browser): an action's request doesn't carry the
 * app's headers, so without it every admin was refused once two-step sign-in was on. `write`: the
 * action changes something, so the read-only demo admin is refused like on any other write.
 */
export async function getUserFromToken(token: string | null | undefined, pass?: string | null, write = false): Promise<SessionUser | null> {
  // Server actions change things: never for the owner's read-only "view as".
  if (!token || isViewAsToken(token)) return null;
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (pass) headers['x-uv-pass'] = pass;
  return getSessionUser(new Request('http://internal', { method: write ? 'POST' : 'GET', headers }));
}

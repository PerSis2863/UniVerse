// Server-side (route handler) helper: confirms the caller is a signed-in UniVerse user by
// asking the API who the bearer token belongs to. Keeps paid services (Gemini, file storage)
// from being used anonymously by anyone who finds the endpoint.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://universe-xsku.onrender.com/api';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const header = request.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: header },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const user = (await res.json()) as SessionUser | null;
    return user && user.id ? user : null;
  } catch {
    return null;
  }
}

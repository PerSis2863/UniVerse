// "Share to UniVerse" (M42): a link or text shared from another app on Android arrives at /app
// (manifest share_target) and waits here until a chat is picked in Messages, where it becomes that
// chat's draft. Kept for this visit only (sessionStorage); never sent anywhere by itself.

const KEY = 'uv-share';

/** One line from what the other app sent: its title, its text and its link, without repeats. */
export function sharedText(p: { title?: string | null; text?: string | null; url?: string | null }): string {
  const parts: string[] = [];
  for (const raw of [p.title, p.text, p.url]) {
    const v = (raw ?? '').trim();
    if (v && !parts.some((x) => x.includes(v))) parts.push(v);
  }
  return parts.join(' ').slice(0, 2000);
}

/** Keeps what arrived in the address (title, text, url); true when there was something. */
export function stashShare(search: string): boolean {
  const q = new URLSearchParams(search);
  const text = sharedText({ title: q.get('title'), text: q.get('text'), url: q.get('url') });
  if (!text) return false;
  try { sessionStorage.setItem(KEY, text); } catch { return false; }
  return true;
}

export function peekShare(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}

export function clearShare() {
  try { sessionStorage.removeItem(KEY); } catch { /* storage blocked */ }
}

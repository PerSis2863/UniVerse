// Rich link cards in chats (Stage 5 · B7.10): which links are the app's own docs, whiteboards and
// task boards (shown live, for people who may open them), and which are YouTube videos.

export type AppLinkKind = 'doc' | 'board' | 'tasks';
const PATHS: Record<string, AppLinkKind> = { docs: 'doc', boards: 'board', tasks: 'tasks' };
const HOSTS = ['universeimpact.com', 'www.universeimpact.com'];

/** The first web address in a message. */
export function firstLink(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"')\]]+/);
  return m ? m[0].replace(/[.,!?;:]+$/, '') : null;
}

/** A link to one of the app's docs, whiteboards or task boards (on this site, or the live one). */
export function appLink(raw: string, origin?: string): { kind: AppLinkKind; id: string } | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const ours = HOSTS.includes(u.hostname) || (!!origin && u.origin === origin);
  if (!ours) return null;
  const m = u.pathname.match(/^\/(docs|boards|tasks)\/([A-Za-z0-9_-]{8,40})\/?$/);
  return m ? { kind: PATHS[m[1]], id: m[2] } : null;
}

/** A YouTube video's id, from watch, short, embed and youtu.be links. */
export function youtubeId(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else id = u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/)?.[1] ?? null;
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

// M227: Meet & call's small rules (the Join box, the invitation, the keys in a call), kept apart so they're tested.

/** The page a meeting code or link opens: a pasted link (…/call/<id>, …/hall/<id>) or a bare code; null when it
 *  can't be one. Only our own paths come out of it, whatever is pasted. */
export function meetingPath(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  const m = t.match(/\/(call|hall)\/([A-Za-z0-9_-]{3,80})(?:[/?#]|$)/);
  if (m) return `/${m[1]}/${m[2]}`;
  return /^[A-Za-z0-9_-]{3,80}$/.test(t) ? `/call/${t}` : null;
}

/** The invitation "Copy invite" puts on the clipboard (like Zoom's). */
export const inviteText = (url: string, code: string, who?: string) =>
  `${who ? `${who} is inviting you` : 'You are invited'} to a meeting on UniVerse.\n\nJoin: ${url}\nMeeting code: ${code}`;

/** What a key does in a call (Zoom's and Discord's): null for keys that do nothing, or while typing. */
export type CallKey = 'mute' | 'camera' | 'hand' | 'chat' | 'people' | 'help';
export function callKey(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }, typing: boolean): CallKey | null {
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (e.key.toLowerCase()) {
    case 'm': return 'mute';
    case 'v': return 'camera';
    case 'h': return 'hand';
    case 'c': return 'chat';
    case 'p': return 'people';
    case '?': return 'help';
    default: return null;
  }
}

/** The keys, as the help lists them. */
export const CALL_KEYS: [string, string][] = [['M', 'Mute or unmute'], ['V', 'Camera on or off'], ['H', 'Raise or lower your hand'], ['C', 'Chat'], ['P', 'People'], ['Space (hold)', 'Talk while muted'], ['?', 'These keys']];

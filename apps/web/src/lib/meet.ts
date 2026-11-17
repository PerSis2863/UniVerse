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

// M234 (the owner: a friend joining from a phone, "the camera doesnt cover the area it should"): a phone held
// upright sends a tall picture; cropped to fill a wide box it showed a narrow band of the face. A picture
// whose shape is far from its box's is shown whole on dark (as Zoom and FaceTime do); one close to it fills.
/** How a camera picture (width / height) fits its box: `cover` fills (cropping a little), `contain` shows it all. */
export function videoFit(video: number | null, box: number | null): 'cover' | 'contain' {
  if (!video || !box || !Number.isFinite(video) || !Number.isFinite(box)) return 'cover';
  return Math.max(video / box, box / video) > 1.35 ? 'contain' : 'cover';
}
/** A tall picture (a phone held upright) gets a tall box in the grid. */
export const isPortrait = (video: number | null) => !!video && video < 0.85;

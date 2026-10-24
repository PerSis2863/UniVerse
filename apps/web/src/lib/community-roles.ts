// Community roles and channel permissions (Stage 5 · B7.4): the pure rules. Owners and moderators
// see and post everywhere; a private channel is seen by members with one of its view roles; an
// announcement channel takes posts from members with one of its post roles.

export type BaseRole = 'OWNER' | 'MOD' | 'MEMBER';
export interface ChannelRules { view: string[]; post: string[] }
export interface MemberLike { role: string; roleIds: string[] }
export interface ChannelLike { channelKind: string | null; channelPrivate: boolean; rules: ChannelRules }

export const ROLE_COLORS = ['#e11d48', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#0284c7', '#253745', '#544b57', '#6b5560', '#64748b'];
export const MAX_ROLES = 20;

/** A JSON list of ids from the database: strings only, at most 50. */
export function parseIds(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))].slice(0, 50) : [];
  } catch { return []; }
}

/** A channel's rules from the database, kept to roles that still exist. */
export function parseRules(json: string | null | undefined, known?: Set<string>): ChannelRules {
  let raw: { view?: unknown; post?: unknown } = {};
  try { raw = json ? JSON.parse(json) : {}; } catch { raw = {}; }
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && (!known || known.has(x))))].slice(0, MAX_ROLES) : []);
  return { view: ids(raw?.view), post: ids(raw?.post) };
}

const staff = (m: MemberLike) => m.role === 'OWNER' || m.role === 'MOD';
const holds = (m: MemberLike, ids: string[]) => ids.some((id) => m.roleIds.includes(id));

/** Whether a member sees a channel (and so is one of its participants). */
export function canSee(ch: ChannelLike, m: MemberLike) {
  return !ch.channelPrivate || staff(m) || holds(m, ch.rules.view);
}

/** Whether a member may post in a channel (voice rooms take no messages). */
export function canPost(ch: ChannelLike, m: MemberLike) {
  if (ch.channelKind === 'VOICE' || !canSee(ch, m)) return false;
  if (ch.channelKind === 'ANNOUNCE') return staff(m) || holds(m, ch.rules.post);
  return true;
}

/** The colour a member's name shows in: their first role in the community's order. */
export function nameColor(roleIds: string[], roles: { id: string; color: string; position: number }[]): string | null {
  const mine = roles.filter((r) => roleIds.includes(r.id)).sort((a, b) => a.position - b.position);
  return mine[0]?.color ?? null;
}

/** Channels in display order: those without a category first, then each category in the order it first appears. */
export function groupChannels<T extends { category: string | null }>(channels: T[]): { category: string | null; channels: T[] }[] {
  const groups: { category: string | null; channels: T[] }[] = [];
  const plain = channels.filter((c) => !c.category);
  if (plain.length) groups.push({ category: null, channels: plain });
  for (const c of channels) {
    if (!c.category) continue;
    const g = groups.find((x) => x.category?.toLowerCase() === c.category!.toLowerCase());
    if (g) g.channels.push(c); else groups.push({ category: c.category, channels: [c] });
  }
  return groups;
}

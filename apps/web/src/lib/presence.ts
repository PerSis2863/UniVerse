// Availability and custom status (Messages). No imports: the fast path (cloudflare/) uses it too.
// Busy, In class and Sleeping are Focus modes: calls don't ring and pushes wait, except from
// favourites (src/server/services/push.service.ts, src/components/chat/IncomingCall.tsx).

export type Presence = 'auto' | 'busy' | 'in_class' | 'studying' | 'sleeping' | 'invisible';
export const PRESENCES: Presence[] = ['auto', 'busy', 'in_class', 'studying', 'sleeping', 'invisible'];
export const FOCUS: Presence[] = ['busy', 'in_class', 'sleeping'];

export const PRESENCE_LABEL: Record<Presence, string> = {
  auto: 'Online', busy: 'Busy', in_class: 'In class', studying: 'Studying', sleeping: 'Sleeping', invisible: 'Invisible',
};

type Raw = { presence?: string | null; statusText?: string | null; statusEmoji?: string | null; statusUntil?: string | Date | null };

/** What others see: the availability (back to "auto" once its time is up) and the custom status. */
export function presenceOf(u: Raw, now = Date.now()) {
  const until = u.statusUntil ? new Date(u.statusUntil).getTime() : null;
  const expired = until !== null && until <= now;
  const presence = (expired || !PRESENCES.includes(u.presence as Presence) ? 'auto' : u.presence) as Presence;
  return {
    presence: presence === 'invisible' ? ('auto' as Presence) : presence, // invisible looks like offline, not "invisible"
    statusText: expired ? null : u.statusText ?? null,
    statusEmoji: expired ? null : u.statusEmoji ?? null,
    hidden: presence === 'invisible',
    focus: FOCUS.includes(presence),
  };
}

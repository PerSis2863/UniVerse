// M395 (the owner, 22 Nov: "remove the green app completely and add this to all the section of other apps where it is
// the part of the daily life"): where each of Green's parts lives now. Old links (/green?view=…, /green/teams, links in
// notifications already sent) are sent on by the /green pages through greenHome.

export const GREEN_LIVING = '/student/life/green';

/** The Green living views inside Student life (the rest moved to Aether, Relief and Trace). */
export const LIVING_VIEWS = ['footprint', 'goals', 'tips', 'teams'] as const;
export type LivingView = (typeof LIVING_VIEWS)[number];

const MOVED: Record<string, string> = {
  trips: '/travel?view=journeys',
  places: '/travel?view=green',
  events: '/relief?view=events',
  swap: '/trace/swap',
  business: '/trace/carbon',
};

/** The new address for an old Green address (its path and query), keeping any other query (e.g. &b=verify). */
export function greenHome(path: string, search: string): string {
  const sp = new URLSearchParams(search);
  const view = path.startsWith('/green/teams') ? 'teams' : sp.get('view');
  sp.delete('view');
  const to = (view && MOVED[view]) || (view && (LIVING_VIEWS as readonly string[]).includes(view) ? `${GREEN_LIVING}?view=${view}` : GREEN_LIVING);
  const rest = sp.toString();
  return rest ? `${to}${to.includes('?') ? '&' : '?'}${rest}` : to;
}

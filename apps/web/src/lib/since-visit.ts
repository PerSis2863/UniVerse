// "Since your last visit" on the home pages' Daily brief (M185): the moment of a person's visit
// before this one, from the times they opened the app (login_events, newest first). Opening a second
// tab or signing in again within the hour is the same visit, not an earlier one; a long absence
// looks back 30 days at most. Pure, so it is tested without a database.

const HOUR = 3_600_000;
const LOOK_BACK = 30 * 24 * HOUR;

/** When the visit before the current one began, or null for someone who has never been here before. */
export function previousVisit(opened: number[], now = Date.now()): number | null {
  if (!opened.length) return null;
  const current = Math.max(...opened);
  const earlier = opened.filter((t) => current - t > HOUR);
  if (!earlier.length) return null;
  return Math.max(Math.max(...earlier), now - LOOK_BACK);
}

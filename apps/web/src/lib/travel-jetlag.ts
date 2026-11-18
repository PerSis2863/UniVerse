// M244: a jet-lag plan from home's time zone to the trip's, pure and tested (travel-jetlag.test.ts). The usual advice
// of sleep clinics, simplified: before an eastward flight sleep an hour earlier each day (westward later), and after
// it seek daylight when it pulls the body clock the right way and avoid it when it pulls the wrong way (eastward:
// morning light; westward: evening light; beyond 8 hours east the body tends to drift the other way first, so the
// first two mornings stay dim). General guidance, not medical advice.

export const isZone = (z: unknown): z is string => {
  if (typeof z !== 'string' || z.length > 64 || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(z)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: z }); return true; } catch { return false; }
};

/** A zone's offset from UTC in minutes at a moment ("GMT+05:30" → 330). */
export function zoneOffset(zone: string, at: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}

/** Hours the clock moves from home to away (east positive), between −12 and +12. */
export function shiftHours(home: string, away: string, at: Date) {
  let h = (zoneOffset(away, at) - zoneOffset(home, at)) / 60;
  if (h > 12) h -= 24;
  if (h <= -12) h += 24;
  return h;
}

export type Window = [number, number]; // minutes past midnight, from and to (may pass midnight)
export interface JetDay { day: number; where: 'home' | 'away'; bed: number; wake: number; seek: Window | null; avoid: Window | null; note: string }
export interface JetPlan { shift: number; east: boolean; mild: boolean; adapt: number; days: JetDay[] }

const wrap = (m: number) => ((Math.round(m) % 1440) + 1440) % 1440;

/** The plan: three days before (home time), the flight, and the days after (local time) until settled. */
export function jetLagPlan(home: string, away: string, flight: Date, bed = 23 * 60, wake = 7 * 60): JetPlan {
  const shift = shiftHours(home, away, flight), east = shift > 0, size = Math.abs(shift);
  const mild = size < 3;
  const adapt = mild ? 1 : Math.min(8, Math.ceil(east ? size : size / 1.5));
  const days: JetDay[] = [];
  if (!mild) {
    const step = Math.min(3, Math.floor(size));
    for (let d = -3; d < 0; d++) {
      const k = Math.min(step, d + 4) * (east ? -60 : 60); // 1, 2 then 3 hours earlier (east) or later (west)
      days.push({ day: d, where: 'home', bed: wrap(bed + k), wake: wrap(wake + k), seek: east ? [wrap(wake + k), wrap(wake + k + 120)] : [wrap(bed + k - 240), wrap(bed + k - 60)], avoid: null,
        note: east ? 'Go to bed and get up a little earlier; get daylight soon after you wake.' : 'Go to bed and get up a little later; get daylight in the evening.' });
    }
  }
  days.push({ day: 0, where: 'away', bed, wake, seek: null, avoid: null, note: mild ? 'Little jet lag: live on local time from the moment you land.' : 'Set your watch to local time when you board. Drink water, go easy on alcohol and caffeine, and sleep on the plane only when it’s night where you’re going.' });
  for (let d = 1; d <= adapt && !mild; d++) {
    const far = east && size > 8 && d <= 2;
    days.push({
      day: d, where: 'away', bed, wake,
      seek: east ? (far ? [wrap(wake + 240), wrap(wake + 420)] : [wake, wrap(wake + 180)]) : [wrap(bed - 300), wrap(bed - 120)],
      avoid: east ? (far ? [wake, wrap(wake + 180)] : [wrap(bed - 180), bed]) : [wake, wrap(wake + 120)],
      note: d === adapt ? 'You should be on local time by now.' : east ? (far ? 'Keep the early morning dim (sunglasses outside); get light from late morning.' : 'Get outside in the morning; keep the evening dim.') : 'Get outside in the late afternoon; keep the early morning dim.',
    });
  }
  return { shift, east, mild, adapt, days };
}

// Attendance rules (Stage 5 · Q11), pure so the server and the register agree: what a class call
// says about someone, when absences are "frequent", the campus location check, and seating charts.

export type Mark = 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED';
export const MARKS: Mark[] = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'];

/** From the time someone was in the class call: present from `threshold` of the call, late from a
 *  quarter of it, absent below that (the teacher confirms before anything is saved). */
export function suggestFromCall(seconds: number, callSeconds: number, threshold = 0.75): Mark {
  if (callSeconds <= 0 || seconds <= 0) return 'ABSENT';
  const share = seconds / callSeconds;
  return share >= threshold ? 'PRESENT' : share >= 0.25 ? 'LATE' : 'ABSENT';
}

/** Attended share (present or late) of the marked days, excused days left out. */
export function attendedRate(marks: Mark[]): { attended: number; counted: number; rate: number | null } {
  const counted = marks.filter((m) => m !== 'EXCUSED').length;
  const attended = marks.filter((m) => m === 'PRESENT' || m === 'LATE').length;
  return { attended, counted, rate: counted ? attended / counted : null };
}

/** Frequent absence: the last three marked days absent, or under 80 % attended over 5+ days. */
export function isChronic(newestFirst: Mark[]): boolean {
  const counted = newestFirst.filter((m) => m !== 'EXCUSED');
  if (counted.length >= 3 && counted.slice(0, 3).every((m) => m === 'ABSENT')) return true;
  const r = attendedRate(counted);
  return r.counted >= 5 && (r.rate ?? 1) < 0.8;
}

/** Metres between two points (haversine). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A position the browser sent, if it's a real one. */
export function cleanPosition(raw: unknown): { lat: number; lng: number; accuracy: number } | null {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const lat = Number(o.lat), lng = Number(o.lng), accuracy = Number(o.accuracy ?? 50);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : 50 };
}

/** Near enough the campus: within its radius, allowing for the phone's own uncertainty (up to 150 m). */
export function nearCampus(pos: { lat: number; lng: number; accuracy: number }, campus: { lat: number; lng: number; radius: number }): boolean {
  return distanceM(pos, campus) <= campus.radius + Math.min(150, pos.accuracy);
}

export interface Seating { rows: number; cols: number; seats: Record<string, string> }
export const EMPTY_SEATING: Seating = { rows: 5, cols: 6, seats: {} };

/** A seating chart from storage or a request: in the grid, each student once, only this class's. */
export function cleanSeating(raw: unknown, students?: Set<string>): Seating {
  let v: unknown = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const rows = Math.min(12, Math.max(1, Math.round(Number(o.rows) || EMPTY_SEATING.rows)));
  const cols = Math.min(12, Math.max(1, Math.round(Number(o.cols) || EMPTY_SEATING.cols)));
  const seats: Record<string, string> = {};
  const used = new Set<string>();
  const given = (o.seats && typeof o.seats === 'object' ? o.seats : {}) as Record<string, unknown>;
  for (const [k, id] of Object.entries(given)) {
    const m = /^(\d{1,2})-(\d{1,2})$/.exec(k);
    if (!m || typeof id !== 'string' || Number(m[1]) >= rows || Number(m[2]) >= cols || used.has(id) || (students && !students.has(id))) continue;
    seats[k] = id;
    used.add(id);
  }
  return { rows, cols, seats };
}

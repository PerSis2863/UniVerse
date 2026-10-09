// A course's colour as a CSS colour. Courses store either a hex colour (#6366f1, set in the course
// form) or, for older / sample courses, a Tailwind class ("bg-blue-500"), which isn't a CSS colour
// and left their tiles blank. Courses without one get a stable colour from their code.

const TAILWIND: Record<string, string> = {
  slate: '#64748b', gray: '#6b7280', zinc: '#71717a', red: '#ef4444', orange: '#f97316', amber: '#f59e0b',
  yellow: '#eab308', lime: '#84cc16', green: '#22c55e', emerald: '#10b981', teal: '#14b8a6', cyan: '#06b6d4',
  sky: '#0ea5e9', blue: '#3b82f6', indigo: '#6366f1', violet: '#8b5cf6', purple: '#a855f7', fuchsia: '#d946ef',
  pink: '#ec4899', rose: '#f43f5e',
};
const PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e'];

export function courseColor(color: string | null | undefined, key = ''): string {
  const c = color?.trim();
  if (c && /^(#|rgb|hsl|oklch)/i.test(c)) return c;
  const tw = c?.match(/^(?:bg-)?([a-z]+)-\d{2,3}$/);
  if (tw && TAILWIND[tw[1]]) return TAILWIND[tw[1]];
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

/** A course colour as a background for white text: darkened enough to read at 4.5:1 (even amber). */
export const courseShade = (color: string | null | undefined, key = '') => `linear-gradient(rgb(0 0 0 / 0.4), rgb(0 0 0 / 0.4)), ${courseColor(color, key)}`;

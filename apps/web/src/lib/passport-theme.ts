/** Portfolio themes for the public skills passport /p/<handle> (CSS variables only; no JS cost). */

export const PASSPORT_THEMES = ['indigo', 'emerald', 'slate', 'rose', 'amber'] as const;
export type PassportTheme = (typeof PASSPORT_THEMES)[number];

export function cleanPassportTheme(v: unknown): PassportTheme {
  return typeof v === 'string' && (PASSPORT_THEMES as readonly string[]).includes(v) ? (v as PassportTheme) : 'indigo';
}

/** Accent classes for headers and pills (Tailwind; light + dark). */
export const PASSPORT_THEME_CLASS: Record<PassportTheme, { accent: string; soft: string; ring: string }> = {
  indigo: {
    accent: 'from-indigo-500 to-fuchsia-500',
    soft: 'from-indigo-500/20 to-fuchsia-500/20',
    ring: 'text-indigo-500',
  },
  emerald: {
    accent: 'from-emerald-500 to-teal-500',
    soft: 'from-emerald-500/20 to-teal-500/20',
    ring: 'text-emerald-500',
  },
  slate: {
    accent: 'from-slate-600 to-zinc-500',
    soft: 'from-slate-500/20 to-zinc-500/20',
    ring: 'text-slate-500',
  },
  rose: {
    accent: 'from-rose-500 to-orange-500',
    soft: 'from-rose-500/20 to-orange-500/20',
    ring: 'text-rose-500',
  },
  amber: {
    accent: 'from-amber-500 to-orange-500',
    soft: 'from-amber-500/20 to-orange-500/20',
    ring: 'text-amber-600',
  },
};

/** Vanity handle: 3–24 chars, lowercase letters/digits/hyphen, not reserved. */
const RESERVED = new Set(['open', 'api', 'admin', 'student', 'teacher', 'www', 'null', 'undefined', 'verify', 'passport', 'cv']);

export function cleanPassportHandle(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== 'string') return undefined;
  const h = v.trim().toLowerCase();
  if (!h) return null;
  if (!/^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$/.test(h)) return undefined;
  if (RESERVED.has(h)) return undefined;
  return h;
}

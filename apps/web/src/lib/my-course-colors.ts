'use client';

import { useMemo, useSyncExternalStore } from 'react';

// My own colour for a course (Phase E): a student picks one on their course tile and it's used on
// their course tiles, home page and calendar, on this device. The course's own colour (set by the
// teacher) stays for everyone else. Kept by course code, which every one of those screens has.

const KEY = 'uv-course-colors';
const EVENT = 'uv-course-colors';
/** The picks offered (each takes white text at 4.5:1 or more). */
export const MY_COURSE_COLORS = [
  { value: '#253745', name: 'Indigo' }, { value: '#253745', name: 'Violet' }, { value: '#be123c', name: 'Red' },
  { value: '#c2410c', name: 'Orange' }, { value: '#a16207', name: 'Gold' }, { value: '#15803d', name: 'Green' },
  { value: '#0f766e', name: 'Teal' }, { value: '#0369a1', name: 'Blue' }, { value: '#4a5c6a', name: 'Grey' },
] as const;

const read = () => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } };
const subscribe = (on: () => void) => {
  window.addEventListener('storage', on);
  window.addEventListener(EVENT, on);
  return () => { window.removeEventListener('storage', on); window.removeEventListener(EVENT, on); };
};

export function parseCourseColors(raw: string): Record<string, string> {
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter(([k, c]) => k.length <= 40 && typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))) as Record<string, string>;
  } catch { return {}; }
}

/** code → my colour, for this device ({} on the server's first drawing). */
export function useMyCourseColors() {
  const raw = useSyncExternalStore(subscribe, read, () => '');
  return useMemo(() => parseCourseColors(raw), [raw]);
}

export function setMyCourseColor(code: string, color: string | null) {
  const next = parseCourseColors(read());
  if (color) next[code] = color; else delete next[code];
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: not kept */ }
  window.dispatchEvent(new Event(EVENT));
}

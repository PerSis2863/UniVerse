'use client';

import { useSyncExternalStore } from 'react';
import { WEEK_START_EVENT, weekStartsOn } from './display-prefs';

// The week's first day from Settings → Appearance (Stage 5 · Q23), for calendars: Monday until the
// page has loaded (so the server and the browser draw the same thing), then the saved choice.

const subscribe = (on: () => void) => {
  window.addEventListener(WEEK_START_EVENT, on);
  window.addEventListener('storage', on);
  return () => { window.removeEventListener(WEEK_START_EVENT, on); window.removeEventListener('storage', on); };
};

export const useWeekStart = (): 0 | 1 => useSyncExternalStore(subscribe, weekStartsOn, () => 1);

/** Short day names in week order, starting on `first`. */
export const weekdayNames = (first: 0 | 1) => (first === 0 ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

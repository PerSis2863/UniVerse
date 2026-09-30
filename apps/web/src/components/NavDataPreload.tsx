'use client';

import { useEffect } from 'react';
import { preload, useSWRConfig } from 'swr';
import { fetcher } from '@/lib/fetcher';
import { authedJson } from '@/lib/authed-fetch';
import { isSampleMode } from '@/lib/sample-mode';

// Opening a page used to be three trips in a row: the page, then its code, then its data. This
// starts the data as soon as a finger or mouse button goes down on the link (the click follows
// 100-200 ms later), so it downloads alongside the page and its code instead of after them. It's
// the same request the page would make anyway (SWR hands it over when the page asks), so it adds
// no requests. Only for pages whose first data isn't on screen yet; keys must match the pages'.

type Loader = [key: string, fetch: (key: string) => Promise<unknown>];

const PAGES: Record<string, () => Loader[]> = {
  '/student': () => [[`/api/student/overview?dow=${(new Date().getDay() + 6) % 7}`, authedJson]],
  '/student/courses': () => [['/courses/my', fetcher]],
  '/student/grades': () => [['/grades/student', fetcher]],
  '/student/quizzes': () => [['/quizzes/student/my-quizzes', fetcher]],
  '/student/attendance': () => [['/attendance/student', fetcher]],
  '/student/groups': () => [['/api/groups/activity?limit=30', authedJson]],
  '/student/inbox': () => [['/api/chat/conversations', authedJson]],
  '/teacher': () => [['/dashboard/teacher', fetcher]],
  '/teacher/courses': () => [['/courses/my', fetcher]],
  '/teacher/grades': () => [['/courses/my', fetcher]],
  '/teacher/students': () => [['/courses/my-students', fetcher]],
  '/teacher/inbox': () => [['/api/chat/conversations', authedJson]],
  '/admin/inbox': () => [['/api/chat/conversations', authedJson]],
};

export function NavDataPreload() {
  const { cache } = useSWRConfig();

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a || a.target === '_blank') return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      const loaders = PAGES[url.pathname.replace(/\/$/, '')];
      if (!loaders || isSampleMode()) return;
      // Already on the device: the page shows it at once and refreshes it itself.
      for (const [key, fn] of loaders()) if (cache.get(key)?.data === undefined) void preload(key, fn).catch(() => {});
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [cache]);

  return null;
}

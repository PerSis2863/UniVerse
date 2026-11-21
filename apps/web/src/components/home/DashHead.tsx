'use client';

import { useNow } from '@/lib/use-now';
import { useLanguageStore } from '@/store/language';

// M282: the top of every app's home: the day, a greeting with the person's first name and one line of what matters
// today, on the same row as the page's own buttons (HomeBoard puts them beside it). Not a page title (the owner, M210:
// no titles): a quiet line, the greeting a little larger. The time comes from useNow, so it's never read while
// rendering on the server; there the day line keeps its height empty.

export function DashHead({ name }: { name?: string | null }) {
  const now = useNow();
  const { t } = useLanguageStore();
  const d = now ? new Date(now) : null, h = d?.getHours() ?? 12;
  const greeting = t(h < 12 ? 'dashboard.greeting_morning' : h < 18 ? 'dashboard.greeting_afternoon' : 'dashboard.greeting_evening');
  // The first name, past a title ("Dr. Jane Smith" → Jane).
  const first = name?.trim().split(/\s+/).find((w) => !/^(dr|prof|mr|mrs|ms|mx|miss|sir|madam)\.?$/i.test(w));
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">{d ? d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) : ' '}</p>
      <p className="mt-0.5 text-[22px] font-semibold leading-tight tracking-[-0.015em] text-zinc-900 sm:text-2xl dark:text-white">
        {greeting}{first ? <>, <span translate="no">{first}</span></> : null}
      </p>
    </div>
  );
}

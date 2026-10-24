'use client';

import { m as motion } from 'framer-motion';
import { AppIcon } from '@/components/apps/AppIcon';
import { APPS, type AppId } from '@/lib/apps';
import { cn } from '@/lib/utils';

// The apps as tabs (the owner: "put the uni-versity and universe trace tab where user can switch to
// where they want to login"): on the website's hero and the sign-in page. The chosen one glides
// under a pill in its own colour.

export function AppTabs({ value, onChange, label = 'Choose an app', small, layoutId = 'app-tab' }: { value: AppId; onChange: (id: AppId) => void; label?: string; small?: boolean; layoutId?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cn('inline-flex max-w-full overflow-x-auto scrollbar-none rounded-full border border-white/10 bg-black/30 backdrop-blur p-1 gap-1', small && 'w-full')}>
      {APPS.map((a) => {
        const on = a.id === value;
        return (
          <button key={a.id} type="button" role="tab" aria-selected={on} onClick={() => onChange(a.id)}
            className={cn('relative shrink-0 inline-flex items-center gap-2 rounded-full font-semibold transition-colors', small ? 'flex-1 justify-center px-2.5 py-2 text-xs' : 'px-3.5 py-2 text-sm', on ? 'text-white' : 'text-zinc-400 hover:text-white')}>
            {on && <motion.span layoutId={layoutId} className="absolute inset-0 rounded-full" style={{ background: `linear-gradient(135deg, ${a.color}cc, ${a.color}66)`, boxShadow: `0 6px 24px -8px ${a.color}` }} transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
            <span className="relative"><AppIcon id={a.id} size={small ? 18 : 22} /></span>
            <span className="relative whitespace-nowrap">{a.name.replace('UniVerse ', '')}</span>
          </button>
        );
      })}
    </div>
  );
}

'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

// The website's dark / light switch (M124, the owner: "keep the dark colour default and in main page
// add a button to shift from dark to light"). One tap flips the whole site and keeps the choice
// (Settings → Appearance shows it); the new colours spread out in a circle from the button (applyTheme).
const watch = (cb: () => void) => {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => mo.disconnect();
};
const isDark = () => document.documentElement.classList.contains('dark');
const ICON = 'absolute inset-0 m-auto w-[18px] h-[18px] transition-[transform,opacity] duration-300 ease-[var(--ease-glide)]';

export function ThemeSwitch({ className }: { className?: string }) {
  const dark = useSyncExternalStore(watch, isDark, () => true);
  return (
    <button
      type="button"
      onClick={(e) => {
        applyTheme(dark ? 'light' : 'dark', { from: { x: e.clientX, y: e.clientY } });
        window.dispatchEvent(new Event('universe:theme'));
      }}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className={cn('relative shrink-0 w-10 h-10 rounded-full text-white/80 hover:text-white hover:bg-white/[0.08] transition-colors', className)}
    >
      <Moon aria-hidden className={cn(ICON, dark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-90')} />
      <Sun aria-hidden className={cn(ICON, dark ? 'opacity-0 rotate-90 scale-90' : 'opacity-100 rotate-0 scale-100')} />
    </button>
  );
}

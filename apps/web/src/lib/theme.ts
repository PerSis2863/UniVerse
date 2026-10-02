export type Theme = 'dark' | 'light' | 'system';

export const getSystemTheme = (): 'dark' | 'light' =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export function getSavedTheme(): Theme {
  try { return (localStorage.getItem('theme') as Theme | null) ?? 'dark'; } catch { return 'dark'; }
}

/**
 * Applies a theme with a soft crossfade (View Transitions where supported, instant otherwise).
 * "system" follows the device setting live.
 */
export function applyTheme(theme: Theme, { animate = true, from }: { animate?: boolean; from?: { x: number; y: number } } = {}) {
  try { localStorage.setItem('theme', theme); } catch { /* private mode */ }
  const dark = (theme === 'system' ? getSystemTheme() : theme) === 'dark';
  const html = document.documentElement;
  if (html.classList.contains('dark') === dark) return;

  const flip = () => html.classList.toggle('dark', dark);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (animate && !reduce && doc.startViewTransition) {
    html.classList.add('theme-fading');
    if (from) html.classList.add('theme-reveal');
    const vt = doc.startViewTransition(flip) as { finished?: Promise<void>; ready?: Promise<void> } | undefined;
    // From the tapped button, the new colours spread out in a circle (like iOS), instead of a fade.
    if (from) {
      void vt?.ready?.then(() => {
        const r = Math.hypot(Math.max(from.x, innerWidth - from.x), Math.max(from.y, innerHeight - from.y));
        html.animate(
          { clipPath: [`circle(0px at ${from.x}px ${from.y}px)`, `circle(${r}px at ${from.x}px ${from.y}px)`] },
          { duration: 520, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
        );
      });
    }
    vt?.finished?.finally(() => html.classList.remove('theme-fading', 'theme-reveal'));
  } else {
    flip();
  }
}

let systemListener: ((e: MediaQueryListEvent) => void) | null = null;
/** Keep "system" in sync when the device switches between light and dark. */
export function watchSystemTheme() {
  if (typeof window === 'undefined' || systemListener) return;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  systemListener = () => { if (getSavedTheme() === 'system') applyTheme('system'); };
  mq.addEventListener('change', systemListener);
}

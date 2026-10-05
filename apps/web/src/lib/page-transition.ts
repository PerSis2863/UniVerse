'use client';

// iOS-style page transitions. Switching sections (menus, tabs, the tab bar) crossfades; opening
// something deeper pushes in from the right; going back pops in from the left. They run as a View
// Transition on the page area only (<main> is named "page" in globals.css), so the navigation bar,
// sidebar and tab bar stay still while the content moves, and the browser animates snapshots on
// the compositor (smooth even while the new page is still rendering).
//
// The screen waits at most 300 ms for the new page: a slower page glides into its loading
// skeleton instead, and fades in when it arrives (the template's CSS animation). Browsers without
// View Transitions, and "Reduce motion", get the CSS animation alone.

export type PageMotion = 'push' | 'pop' | 'fade';
type VTDocument = Document & { startViewTransition?: (cb: () => Promise<void>) => { finished: Promise<void>; ready: Promise<void> } };

let active = false;
let nextMotion: PageMotion = 'fade';

const depth = (path: string) => path.split('/').filter(Boolean).length;

/** The motion for going from one page to another: a hint from the link, or deeper/shallower/sideways. */
export function motionFor(from: string, to: string, hint?: string | null): PageMotion {
  if (hint === 'push' || hint === 'pop' || hint === 'fade') return hint;
  const a = depth(from), b = depth(to);
  return b > a ? 'push' : b < a ? 'pop' : 'fade';
}

/** Starts a transition for a navigation that's about to happen (call before the router changes page). */
export function startPageTransition(motion: PageMotion) {
  nextMotion = motion;
  const doc = document as VTDocument;
  if (active || !doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const root = document.documentElement;
  root.classList.add('vt-nav', `vt-${motion}`);
  active = true;
  const end = () => {
    active = false;
    root.classList.remove('vt-nav', 'vt-push', 'vt-pop', 'vt-fade');
  };
  try {
    const t = doc.startViewTransition(() => new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.removeEventListener('universe:route-rendered', finish);
        resolve();
      };
      window.addEventListener('universe:route-rendered', finish);
      setTimeout(finish, 300);
    }));
    t.ready.catch(() => {}); // skipped (e.g. another transition started): not an error
    t.finished.then(end, end);
  } catch {
    end();
  }
}

/**
 * The CSS entrance for a page that just mounted: none while a View Transition is animating it,
 * otherwise the motion of the navigation that opened it. Pure (React may call it twice); the page
 * calls pageEntranceShown() once it has mounted.
 */
export function pageEntrance(): string {
  if (active) return '';
  return nextMotion === 'push' ? 'page-push' : nextMotion === 'pop' ? 'page-pop' : 'page-enter';
}

/** The entrance has been used: later pages (without a tap, e.g. a redirect) just fade. */
export function pageEntranceShown() {
  if (!active) nextMotion = 'fade';
}

'use client';

import { EASE_IOS, reducedMotion } from './page-transition';

// List → detail, the iOS way: tap a card and its title glides into place as the detail page's
// title. Mark the title in the card and on the detail page with the same key:
//   card:   <span data-shared={`board:${b.id}`}>{b.title}</span>
//   detail: <Topbar title={…} sharedId={`board:${id}`} />
// A tap records where the card's title is (rememberShared, from NavProgress); the detail page
// comes in with an opacity-only entrance ('shared' motion), and when its title appears (also after
// its data loads) it starts at the card title's place and size and glides to its own. Transform
// only (FLIP, Web Animations), so it's smooth and never blocks taps. With Reduce Motion it's off.

type Pending = { key: string; from: DOMRect; fontSize: number; source: Element; until: number };
let pending: Pending | null = null;
let observer: MutationObserver | null = null;

/** The title to move from, inside the tapped link (or the link itself). */
function sourceIn(link: Element): Element | null {
  return link.matches('[data-shared]') ? link : link.querySelector('[data-shared]') ?? link.closest('[data-shared]');
}

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

/** Call on a tap on a link. True when there's a title to carry over (use the 'shared' motion). */
export function rememberShared(link: Element): boolean {
  if (reducedMotion()) return false;
  const el = sourceIn(link);
  const key = el?.getAttribute('data-shared');
  if (!el || !key || !visible(el)) return false;
  pending = { key, from: el.getBoundingClientRect(), fontSize: parseFloat(getComputedStyle(el).fontSize) || 16, source: el, until: Date.now() + 4000 };
  watch();
  return true;
}

function target(p: Pending): Element | null {
  for (const el of document.querySelectorAll(`[data-shared="${CSS.escape(p.key)}"]`)) {
    if (el !== p.source && !p.source.contains(el) && visible(el)) return el;
  }
  return null;
}

function fly(el: Element, p: Pending) {
  const to = el.getBoundingClientRect();
  const scale = p.fontSize / (parseFloat(getComputedStyle(el).fontSize) || p.fontSize);
  const dx = p.from.left - to.left;
  const dy = p.from.top - to.top;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(scale - 1) < 0.01) return;
  (el as HTMLElement).animate(
    [
      { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`, transformOrigin: '0 0' },
      { transform: 'none', transformOrigin: '0 0' },
    ],
    { duration: 440, easing: EASE_IOS },
  );
}

function check() {
  const p = pending;
  if (!p) return stop();
  if (Date.now() > p.until) return stop();
  const el = target(p);
  if (!el) return;
  stop();
  fly(el, p);
}

function watch() {
  observer?.disconnect();
  observer = new MutationObserver(check);
  observer.observe(document.body, { childList: true, subtree: true });
  // Give up if the page never shows the title (e.g. it failed to load).
  setTimeout(check, 4100);
}

function stop() {
  pending = null;
  observer?.disconnect();
  observer = null;
}

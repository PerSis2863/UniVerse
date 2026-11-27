import type { Transition, Variants } from 'framer-motion';

// One motion language for the whole app, tuned like SwiftUI's springs: described by how long they
// feel (visualDuration) and how much they overshoot (bounce). Controls get a hint of bounce,
// surfaces settle without wobble.
// With "Reduce Motion" on, springs keep moving (the highlights still glide) but without overshoot
// and a little quicker, like iOS. Read once in the browser (on the server: the normal springs).
const calm = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const s = (visualDuration: number, bounce: number): Transition =>
  ({ type: 'spring', visualDuration: calm ? visualDuration * 0.8 : visualDuration, bounce: calm ? 0 : bounce });

export const spring = {
  /** Default for layout, sheets and cards (SwiftUI .smooth). */
  smooth: s(0.38, 0),
  /** Small controls: toggles, chips, segmented thumbs, tab indicators (SwiftUI .snappy). */
  snappy: s(0.3, 0.15),
  /** Large surfaces that travel far (full-height sheets, drawers). */
  gentle: s(0.48, 0),
  /** Playful confirmations: a sent message, a completed task (SwiftUI .bouncy). */
  bouncy: s(0.42, 0.3),
};

/** M372 (the owner, 20 Nov: "the way spot light is ultra smooth… make every button like that"): Spotlight's opening,
 *  measured on the search window (M368): from 94% and 6 px up to its place on a quick, firm spring (~0.2 s), as one
 *  transform string the compositor runs; closing quicker, easing in. Used by menus and pop-ups (Popover). */
export const pop = {
  from: { opacity: 0, transform: 'translateY(-6px) scale(0.94)' },
  to: { opacity: 1, transform: 'translateY(0px) scale(1)' },
  out: { opacity: 0, transform: 'translateY(-4px) scale(0.97)', transition: { duration: 0.13, ease: [0.4, 0, 1, 1] as const } },
  spring: { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 } as Transition,
};

/** M480: `pop` as framer-motion props, for a hand-made menu or pop-up window: `<motion.div {...popIn}>`. */
export const popIn = { initial: pop.from, animate: pop.to, exit: pop.out, transition: pop.spring };

export const ease = {
  ios: [0.32, 0.72, 0, 1] as const,
  out: [0.22, 1, 0.36, 1] as const,
};

/** M481: a window that is a bottom sheet on phones and centred on larger screens: it slides up from the edge on a
 *  phone (iOS's sheet) and opens as the search window does elsewhere (`popIn`). Read when it opens, not on the server. */
export function sheetIn() {
  if (typeof window === 'undefined' || window.innerWidth >= 640) return popIn;
  return {
    initial: { transform: 'translateY(100%)' }, animate: { transform: 'translateY(0%)' },
    exit: { transform: 'translateY(100%)', transition: { duration: 0.24, ease: ease.ios } }, transition: spring.smooth,
  };
}

/** M481: `popIn` for a menu that opens above its button (a list over a text box): it rises a touch instead. */
export const popUp = { ...popIn, initial: { ...pop.from, transform: 'translateY(6px) scale(0.94)' }, exit: { ...pop.out, transform: 'translateY(4px) scale(0.97)' } };

/** Fade + slight rise, for content that appears once. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: ease.ios } },
};

/** List container: children arrive together with a very short cascade (capped, never slow). */
export const list: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.025, delayChildren: 0.02 } },
};

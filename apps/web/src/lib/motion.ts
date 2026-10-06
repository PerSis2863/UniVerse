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

export const ease = {
  ios: [0.32, 0.72, 0, 1] as const,
  out: [0.22, 1, 0.36, 1] as const,
};

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

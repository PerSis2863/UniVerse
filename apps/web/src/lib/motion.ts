import type { Transition, Variants } from 'framer-motion';

// One motion language for the whole app, tuned like SwiftUI's springs: described by how long they
// feel (visualDuration) and how much they overshoot (bounce). Controls get a hint of bounce,
// surfaces settle without wobble.
export const spring = {
  /** Default for layout, sheets and cards (SwiftUI .smooth). */
  smooth: { type: 'spring', visualDuration: 0.38, bounce: 0 } as Transition,
  /** Small controls: toggles, chips, segmented thumbs, tab indicators (SwiftUI .snappy). */
  snappy: { type: 'spring', visualDuration: 0.3, bounce: 0.15 } as Transition,
  /** Large surfaces that travel far (full-height sheets, drawers). */
  gentle: { type: 'spring', visualDuration: 0.48, bounce: 0 } as Transition,
  /** Playful confirmations: a sent message, a completed task (SwiftUI .bouncy). */
  bouncy: { type: 'spring', visualDuration: 0.42, bounce: 0.3 } as Transition,
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

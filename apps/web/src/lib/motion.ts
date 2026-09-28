import type { Transition, Variants } from 'framer-motion';

// One motion language for the whole app. Springs are critically damped (no wobble),
// quick to start and soft to settle — the feel of iOS sheets and controls.
export const spring = {
  /** Default for layout, sheets and cards. */
  smooth: { type: 'spring', stiffness: 380, damping: 38, mass: 0.9 } as Transition,
  /** Small controls: toggles, chips, tab indicators. */
  snappy: { type: 'spring', stiffness: 520, damping: 40, mass: 0.7 } as Transition,
  /** Large surfaces that travel far (full-height sheets, drawers). */
  gentle: { type: 'spring', stiffness: 260, damping: 34, mass: 1 } as Transition,
};

export const ease = {
  ios: [0.32, 0.72, 0, 1] as const,
  out: [0.22, 1, 0.36, 1] as const,
};

/** Fade + slight rise, for content that appears once. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.26, ease: ease.out } },
};

/** List container: children arrive together with a very short cascade (capped, never slow). */
export const list: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.025, delayChildren: 0.02 } },
};

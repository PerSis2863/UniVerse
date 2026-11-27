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

/** M482 (the owner, 27 Nov: "smooth them, keep their style"): the parts that keep their own movement, on the search
 *  window's timing: in on a firm spring as one transform string (the compositor runs it), out quicker, easing in. */
const outQuick = { duration: 0.16, ease: [0.4, 0, 1, 1] as const };
/** The dark backdrop behind a window, panel or viewer: a fade, in 0.2 s, out 0.15 s. */
export const fadeIn = {
  initial: { opacity: 0 }, animate: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: 0.15, ease: [0.4, 0, 1, 1] as const } }, transition: { duration: 0.2, ease: ease.ios },
};
/** A full-screen viewer (photo, file, QR): fades in with a touch of size, out as a fade. */
export const viewIn = {
  initial: { opacity: 0, transform: 'scale(0.98)' }, animate: { opacity: 1, transform: 'scale(1)' },
  exit: { opacity: 0, transition: outQuick }, transition: pop.spring,
};
/** A panel rising from a button bar at the bottom (the call's panels): 24 px up on the search window's spring. */
export const riseIn = {
  initial: { opacity: 0, transform: 'translateY(24px)' }, animate: { opacity: 1, transform: 'translateY(0px)' },
  exit: { opacity: 0, transform: 'translateY(16px)', transition: outQuick }, transition: pop.spring,
};
/** A small window over a call's button bar (More, Reactions, Background, a poll): rises 16 px from 96%. */
export const barPop = {
  initial: { opacity: 0, transform: 'translateY(16px) scale(0.96)' }, animate: { opacity: 1, transform: 'translateY(0px) scale(1)' },
  exit: { opacity: 0, transform: 'translateY(10px) scale(0.98)', transition: outQuick }, transition: pop.spring,
};
/** A pane that slides a short way in from the end side (a thread, a document's side panel). Mirrors in Arabic. */
export function sideIn() {
  const d = typeof document !== 'undefined' && document.dir === 'rtl' ? -1 : 1;
  return {
    initial: { opacity: 0, transform: `translateX(${24 * d}px)` }, animate: { opacity: 1, transform: 'translateX(0px)' },
    exit: { opacity: 0, transform: `translateX(${16 * d}px)`, transition: outQuick }, transition: pop.spring,
  };
}
/** A side panel that slides all the way in from the end edge (Groups, Internships, class details). Mirrors in Arabic. */
export function edgeIn() {
  const off = typeof document !== 'undefined' && document.dir === 'rtl' ? 'translateX(-100%)' : 'translateX(100%)';
  return {
    initial: { transform: off }, animate: { transform: 'translateX(0%)' },
    exit: { transform: off, transition: { duration: 0.24, ease: ease.ios } }, transition: spring.smooth,
  };
}

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

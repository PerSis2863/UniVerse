'use client';

import { useEffect } from 'react';
import { startScrollMotion } from '@/lib/scroll-motion';
import { startTapMotion } from '@/lib/tap-motion';
import { startLightMotion } from '@/lib/light-motion';
import { startSmoothScroll } from '@/lib/smooth-scroll';
import { startClickBurst } from '@/lib/click-burst';

/** Scroll motion (src/lib/scroll-motion.ts), tap motion (src/lib/tap-motion.ts), light that answers presses (src/lib/light-motion.ts) the wheel's glide (src/lib/smooth-scroll.ts) on every page, and the website's click burst (src/lib/click-burst.ts), started once for the whole app. */
export function ScrollMotion() {
  useEffect(() => startScrollMotion(), []);
  useEffect(() => startTapMotion(), []);
  useEffect(() => startLightMotion(), []);
  useEffect(() => startSmoothScroll(), []);
  useEffect(() => startClickBurst(), []);
  return null;
}

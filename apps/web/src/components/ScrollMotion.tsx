'use client';

import { useEffect } from 'react';
import { startScrollMotion } from '@/lib/scroll-motion';
import { startTapMotion } from '@/lib/tap-motion';
import { startLightMotion } from '@/lib/light-motion';

/** Scroll motion (src/lib/scroll-motion.ts), tap motion (src/lib/tap-motion.ts) and light that answers presses (src/lib/light-motion.ts) on every page, started once for the whole app. */
export function ScrollMotion() {
  useEffect(() => startScrollMotion(), []);
  useEffect(() => startTapMotion(), []);
  useEffect(() => startLightMotion(), []);
  return null;
}

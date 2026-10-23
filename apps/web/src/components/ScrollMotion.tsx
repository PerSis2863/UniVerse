'use client';

import { useEffect } from 'react';
import { startScrollMotion } from '@/lib/scroll-motion';
import { startTapMotion } from '@/lib/tap-motion';

/** Scroll motion (src/lib/scroll-motion.ts) and tap motion (src/lib/tap-motion.ts) on every page, started once for the whole app. */
export function ScrollMotion() {
  useEffect(() => startScrollMotion(), []);
  useEffect(() => startTapMotion(), []);
  return null;
}

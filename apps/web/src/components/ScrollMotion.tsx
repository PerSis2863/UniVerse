'use client';

import { useEffect } from 'react';
import { startScrollMotion } from '@/lib/scroll-motion';

/** Scroll motion on every page (src/lib/scroll-motion.ts), started once for the whole app. */
export function ScrollMotion() {
  useEffect(() => startScrollMotion(), []);
  return null;
}

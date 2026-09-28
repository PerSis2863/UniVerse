'use client';

import { MotionConfig } from 'framer-motion';
import { spring } from '@/lib/motion';

/** App-wide motion defaults: one spring for every animation, and "Reduce motion" is honoured automatically. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={spring.smooth}>
      {children}
    </MotionConfig>
  );
}

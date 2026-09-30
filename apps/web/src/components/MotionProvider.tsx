'use client';

import { LazyMotion, MotionConfig } from 'framer-motion';
import { spring } from '@/lib/motion';
import { DialogHost } from '@/components/ui/Dialogs';
import { SheetGestures } from '@/components/ui/SheetGestures';

// The animation engine loads just after the page (lightweight `m` components everywhere).
const loadFeatures = () => import('@/lib/motion-features').then((mod) => mod.default);

/**
 * App-wide interaction layer: one spring for every animation ("Reduce motion" honoured),
 * designed confirm/prompt dialogs, and swipe-down-to-close for sheets on phones.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadFeatures}>
      <MotionConfig reducedMotion="user" transition={spring.smooth}>
        {children}
        <DialogHost />
        <SheetGestures />
      </MotionConfig>
    </LazyMotion>
  );
}

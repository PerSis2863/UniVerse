'use client';

import { MotionConfig } from 'framer-motion';
import { spring } from '@/lib/motion';
import { DialogHost } from '@/components/ui/Dialogs';
import { SheetGestures } from '@/components/ui/SheetGestures';

/**
 * App-wide interaction layer: one spring for every animation ("Reduce motion" honoured),
 * designed confirm/prompt dialogs, and swipe-down-to-close for sheets on phones.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={spring.smooth}>
      {children}
      <DialogHost />
      <SheetGestures />
    </MotionConfig>
  );
}

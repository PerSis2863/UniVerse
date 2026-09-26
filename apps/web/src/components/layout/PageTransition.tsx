import { ReactNode } from 'react';

/**
 * Lightweight page-enter animation (see .page-enter in globals.css).
 * Kept as a component for backwards compatibility; uses CSS instead of a
 * framer-motion blur spring, which was janky on phones and left a CSS filter on the
 * wrapper that broke position:fixed descendants.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return <div className="page-enter flex flex-col flex-1 min-w-0">{children}</div>;
}

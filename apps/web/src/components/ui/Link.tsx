'use client';

import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { type ComponentProps, type FocusEvent, type MouseEvent, type TouchEvent, forwardRef, useRef } from 'react';

// next/link without automatic prefetching. Next prefetches every link as it scrolls into view or is
// hovered; in Next 16 each prefetch is two Worker requests, and most of them are never used (a
// menu has dozens of links). Instead a page starts loading when someone shows they're about to
// open it: the mouse resting on the link, a finger touching it, or keyboard focus (Workers Paid,
// since 22 Oct 2026: 10 million requests a month are included). Each page at most once per visit.
// Pass `prefetch` to opt a link back into Next's own prefetching, `prefetch={false}` to opt out.

type Props = ComponentProps<typeof NextLink>;

const warmed = new Set<string>();
const HOVER_MS = 90;

/** The app page a link opens, if it's one of ours (not a file, another site or a hash on this page). */
export function warmable(href: Props['href']): string | null {
  const s = typeof href === 'string' ? href : href.pathname ?? null;
  if (!s || !s.startsWith('/') || s.startsWith('//') || s.startsWith('/api/') || /\.[a-z0-9]{2,5}(\?|#|$)/i.test(s)) return null;
  return s;
}

const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ prefetch, onMouseEnter, onMouseLeave, onTouchStart, onFocus, ...rest }, ref) {
  const router = useRouter();
  // An explicit prefetch (on or off) is left to Next.
  const target = prefetch != null || rest.target === '_blank' ? null : warmable(rest.href);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const warm = () => {
    if (!target || warmed.has(target)) return;
    warmed.add(target);
    try { router.prefetch(target); } catch { warmed.delete(target); }
  };
  return (
    <NextLink
      ref={ref}
      prefetch={prefetch ?? false}
      onMouseEnter={(e: MouseEvent<HTMLAnchorElement>) => { onMouseEnter?.(e); if (target) timer.current = setTimeout(warm, HOVER_MS); }}
      onMouseLeave={(e: MouseEvent<HTMLAnchorElement>) => { onMouseLeave?.(e); clearTimeout(timer.current); }}
      onTouchStart={(e: TouchEvent<HTMLAnchorElement>) => { onTouchStart?.(e); warm(); }}
      onFocus={(e: FocusEvent<HTMLAnchorElement>) => { onFocus?.(e); warm(); }}
      {...rest}
    />
  );
});

export default Link;

'use client';

import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { type ComponentProps, type FocusEvent, type PointerEvent, forwardRef, useRef } from 'react';

// next/link without automatic prefetching. Next prefetches every link as it scrolls into view; in
// Next 16 each prefetch is two Worker requests, and most of them are never used (a menu has dozens
// of links). Instead a link starts loading its page when someone shows they're about to open it:
// a finger or mouse button going down (the click follows 100-200 ms later), the mouse resting on it
// for a moment, or keyboard focus. The click then reuses that download, so opening a page costs no
// extra requests and waits one network trip less. Pass `prefetch` to opt a link back in.

type Props = ComponentProps<typeof NextLink>;

const HOVER_MS = 80; // a mouse passing over a menu isn't intent; resting on a link is

const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ prefetch, onPointerEnter, onPointerLeave, onPointerDown, onFocus, ...rest }, ref) {
  const router = useRouter();
  const hover = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(false);

  const warm = () => {
    if (done.current || prefetch != null) return;
    const href = typeof rest.href === 'string' ? rest.href : rest.href.pathname;
    if (!href || !href.startsWith('/') || href.startsWith('//') || href.startsWith('/api/')) return;
    done.current = true;
    router.prefetch(href);
  };
  const stopHover = () => {
    if (hover.current) clearTimeout(hover.current);
    hover.current = null;
  };

  return (
    <NextLink
      ref={ref}
      prefetch={prefetch ?? false}
      onPointerEnter={(e: PointerEvent<HTMLAnchorElement>) => {
        onPointerEnter?.(e);
        if (e.pointerType === 'mouse' && !done.current) hover.current = setTimeout(warm, HOVER_MS);
      }}
      onPointerLeave={(e: PointerEvent<HTMLAnchorElement>) => {
        onPointerLeave?.(e);
        stopHover();
      }}
      onPointerDown={(e: PointerEvent<HTMLAnchorElement>) => {
        onPointerDown?.(e);
        stopHover();
        if (e.button === 0) warm();
      }}
      onFocus={(e: FocusEvent<HTMLAnchorElement>) => {
        onFocus?.(e);
        if (e.currentTarget.matches(':focus-visible')) warm();
      }}
      {...rest}
    />
  );
});

export default Link;

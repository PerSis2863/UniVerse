'use client';

import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { type ComponentProps, forwardRef } from 'react';

// next/link, but a page is fetched ahead only when someone points at or touches the link, not
// whenever the link scrolls into view. Viewport prefetching loaded ~16 pages in the background
// on every page view, each one a paid Worker request. Pass `prefetch` to opt back in.

type Props = ComponentProps<typeof NextLink>;

const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ prefetch, href, onMouseEnter, onTouchStart, onFocus, ...rest }, ref) {
  const router = useRouter();
  const warm = () => {
    if (typeof href === 'string' && href.startsWith('/')) router.prefetch(href);
  };
  return (
    <NextLink
      ref={ref}
      href={href}
      prefetch={prefetch ?? false}
      onMouseEnter={(e) => {
        warm();
        onMouseEnter?.(e);
      }}
      onTouchStart={(e) => {
        warm();
        onTouchStart?.(e);
      }}
      onFocus={(e) => {
        warm();
        onFocus?.(e);
      }}
      {...rest}
    />
  );
});

export default Link;

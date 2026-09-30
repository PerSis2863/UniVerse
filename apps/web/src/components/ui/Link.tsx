'use client';

import NextLink from 'next/link';
import { type ComponentProps, forwardRef } from 'react';

// next/link without automatic prefetching. Next prefetches every link as it scrolls into view or is
// hovered; in Next 16 each prefetch is two Worker requests, and most of them are never used (a
// menu has dozens of links). Loading a page on click is one request, and pages show their loading
// skeleton immediately, so navigation still feels instant. Pass `prefetch` to opt a link back in.

type Props = ComponentProps<typeof NextLink>;

const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ prefetch, ...rest }, ref) {
  return <NextLink ref={ref} prefetch={prefetch ?? false} {...rest} />;
});

export default Link;

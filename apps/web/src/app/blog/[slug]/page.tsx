import { Suspense } from 'react';
import View from './View';

// Built once ahead of time, as /blog/open: the Worker answers every /blog/[slug] with this page
// (cloudflare/page-routes.gen.ts), and View reads the post's address in the browser, so opening a
// post never starts the whole Next.js server on a fresh Worker (Workers Free's 10 ms CPU).
export function generateStaticParams() {
  return [{ slug: 'open' }];
}

export default function Page() {
  return (
    <Suspense>
      <View />
    </Suspense>
  );
}

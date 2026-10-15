import { Suspense } from 'react';
import View from './View';

// Built once ahead of time, as /student/profile/open: the Worker answers every /student/profile/[id]
// with this page (cloudflare/page-routes.gen.ts), and View reads the name from the address, so opening
// one never starts the whole Next.js server on a fresh Worker (Workers Free's 10 ms CPU; "Error 1101").
export function generateStaticParams() {
  return [{ id: 'open' }];
}

export default function Page() {
  return (
    <Suspense>
      <View />
    </Suspense>
  );
}

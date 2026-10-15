import { Suspense } from 'react';
import View from './View';

// Built once ahead of time, as /apply/status/open: the Worker answers every /apply/status/[token] with this page
// (cloudflare/page-routes.gen.ts), and View reads the values from the address, so opening one never
// starts the whole Next.js server on a fresh Worker (Workers Free's 10 ms CPU; "Error 1101").
export function generateStaticParams() {
  return [{ token: 'open' }];
}

export default function Page() {
  return (
    <Suspense>
      <View />
    </Suspense>
  );
}

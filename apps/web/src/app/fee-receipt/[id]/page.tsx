import { Suspense } from 'react';
import View from './View';

// Built once ahead of time, as /fee-receipt/open: the Worker answers every /fee-receipt/[id] with this page
// (cloudflare/page-routes.gen.ts), and View reads the values from the address, so opening one never
// starts the whole Next.js server on a fresh Worker (Workers Free's 10 ms CPU; "Error 1101").
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

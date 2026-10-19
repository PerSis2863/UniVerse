import { Suspense } from 'react';
import View from './View';

// Built once ahead of time, as /donation-receipt/open: the Worker answers every /donation-receipt/[id]
// with this page (cloudflare/page-routes.gen.ts) and View reads the id from the address.
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

import { Suspense } from 'react';
import View from './View';

// M248: a trip's family link. Built once ahead of time, as /journey/open: the Worker answers every /journey/[code]
// with this page (cloudflare/page-routes.gen.ts) and View reads the code from the address (like /aid/[code]).
export function generateStaticParams() {
  return [{ code: 'open' }];
}

export default function Page() {
  return (
    <Suspense>
      <View />
    </Suspense>
  );
}

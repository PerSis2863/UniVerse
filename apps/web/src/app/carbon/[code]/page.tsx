import { Suspense } from 'react';
import View from './View';

// Built once ahead of time, as /carbon/open: the Worker answers every /carbon/[code] with this page
// (cloudflare/page-routes.gen.ts) and View reads the code from the address (like /aid/[code]).
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

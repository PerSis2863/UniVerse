import { Suspense } from 'react';
import View from './View';

// Built once ahead of time, as /aid/open: the Worker answers every /aid/[code] with this page
// (cloudflare/page-routes.gen.ts) and View reads the code from the address (like /t/[code]).
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

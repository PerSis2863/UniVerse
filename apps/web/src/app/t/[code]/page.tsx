import { Suspense } from 'react';
import View from './View';

// Built once ahead of time, as /t/open: the Worker answers every /t/[code] with this page
// (cloudflare/page-routes.gen.ts) and View reads the code from the address (like /verify/[id]).
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

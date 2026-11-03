import { Suspense } from 'react';
import View from './View';

// Built once ahead of time, as /s/open: the Worker answers every /s/[token] with this page
// (cloudflare/page-routes.gen.ts) and View reads the token from the address (like /t/[code]).
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

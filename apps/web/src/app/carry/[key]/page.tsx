import { Suspense } from 'react';
import View from './View';

// Built once ahead of time, as /carry/open: the Worker answers every /carry/[key] with this page
// (cloudflare/page-routes.gen.ts) and View reads the key from the address (like /t/[code]).
export function generateStaticParams() {
  return [{ key: 'open' }];
}

export default function Page() {
  return (
    <Suspense>
      <View />
    </Suspense>
  );
}

import { Suspense } from 'react';
import View from './View';

// Built once ahead of time, as /b/open: the Worker answers every /b/[slug] with this page
// (cloudflare/page-routes.gen.ts) and View reads the brand from the address (like /t/[code]).
export function generateStaticParams() {
  return [{ slug: 'open' }];
}

export default function Page() {
  return (
    <Suspense>
      <View />
    </Suspense>
  );
}

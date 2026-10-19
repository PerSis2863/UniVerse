import { Suspense } from 'react';
import View from './View';

// Stage 5 · Q18: a person's profile. Built once ahead of time, as /people/open: the Worker answers
// every /people/[id] with this page (cloudflare/page-routes.gen.ts) and View reads the id from the address.
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

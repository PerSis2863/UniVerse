import { Suspense } from 'react';
import View from './View';

// Built once as /p/open so every /p/[handle] avoids cold-starting Next.js on Workers Free.
export function generateStaticParams() {
  return [{ handle: 'open' }];
}

export default function Page() {
  return (
    <Suspense>
      <View />
    </Suspense>
  );
}

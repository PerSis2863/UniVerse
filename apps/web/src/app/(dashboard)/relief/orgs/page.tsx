'use client';

import { Suspense } from 'react';
import { ReliefOrgs } from '@/components/relief/ReliefOrgs';

// UniVerse Relief → Organisations (M106): NGOs, food banks and shelters, their supplies, volunteer
// shifts and needs (src/components/relief/ReliefOrgs.tsx). The organisation is ?org=<id>, so the page
// is built once (no [id] route).
export default function ReliefOrgsPage() {
  return (
    <Suspense fallback={<div className="flex-1 p-4 sm:p-8"><div className="max-w-5xl mx-auto panel h-40 skeleton" /></div>}>
      <ReliefOrgs />
    </Suspense>
  );
}

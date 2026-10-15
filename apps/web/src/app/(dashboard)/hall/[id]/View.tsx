'use client';

import { usePathParams } from '@/hooks/usePathParams';
import { AddressLoading } from '@/components/layout/AddressLoading';
import { HallView } from '@/components/hall/HallView';

// A class's or study group's Study Hall (Stage 4 · 4.2): /hall/hc_<course> or /hall/hg_<group>.
function HallPage({ id }: { id: string }) {
  return <HallView hallId={id} />;
}

// Served for every address from the page built once with "open" (page.tsx, cloudflare/page-routes.gen.ts):
// the values come from the address, read in the browser.
export default function HallPageRoute() {
  const p = usePathParams('/hall/[id]');
  return p ? <HallPage key={p.id} id={p.id} /> : <AddressLoading portal />;
}

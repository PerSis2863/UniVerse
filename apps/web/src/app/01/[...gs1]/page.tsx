import { redirect } from 'next/navigation';
import { gs1Target } from '@/lib/dpp';

// GS1 Digital Link addresses (M108): /01/<GTIN>/21/<unit code> opens that unit's passport, /01/<GTIN>
// the product's (src/lib/dpp.ts gs1Target). The Worker answers them before Next.js
// (cloudflare/page-match.ts); this page does the same for `next dev`.
export default async function Gs1Page({ params }: { params: Promise<{ gs1: string[] }> }) {
  const { gs1 } = await params;
  const [path, query] = gs1Target(gs1.map((s) => decodeURIComponent(s)).join('/')) ?? ['/dpp', ''];
  redirect(query ? `${path}?${query}` : path);
}

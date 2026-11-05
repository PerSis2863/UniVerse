import type { Metadata } from 'next';

// A product's EU Digital Product Passport (M108): public, the page a GS1 Digital Link address without a
// unit leads to (/01/<GTIN> → /dpp?g=<GTIN>).
export const metadata: Metadata = { title: 'Digital Product Passport', description: 'What this product is made of, where, its footprint, and how to care for it, repair it and recycle it.' };

export default function DppLayout({ children }: { children: React.ReactNode }) {
  return children;
}

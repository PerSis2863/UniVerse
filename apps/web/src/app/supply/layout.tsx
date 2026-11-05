import type { Metadata } from 'next';

// A supplier's link (M108, UniVerse Trace): a brand asks them to describe one material of a product's
// Digital Product Passport. Public (no account), kept out of search results (each link is private).
export const metadata: Metadata = {
  title: 'Describe a material',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function SupplyLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from 'next';

// Public brand pages (UniVerse Trace): a brand's trust score, its products and what owners say,
// linked from every passport. Anyone can open one; no sign-in.
export const metadata: Metadata = {
  title: 'Brand on UniVerse Trace',
};

export default function BrandLayout({ children }: { children: React.ReactNode }) {
  return children;
}

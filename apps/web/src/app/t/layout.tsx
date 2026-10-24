import type { Metadata } from 'next';

// Product passports (UniVerse Trace): anyone who scans a product's code lands here. Public, but kept
// out of search results (every unit has its own address).
export const metadata: Metadata = {
  title: 'Product passport',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function PassportLayout({ children }: { children: React.ReactNode }) {
  return children;
}

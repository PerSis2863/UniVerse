import type { Metadata } from 'next';
import { shareMeta } from '@/lib/share-meta';

// Product passports (UniVerse Trace): anyone who scans a product's code lands here. Public, but kept
// out of search results (every unit has its own address).
export const metadata: Metadata = {
  ...shareMeta('trace', 'One signed code on every unit: buyers see it is genuine, shops earn points and brands watch every product move on a live map.'),
  title: 'Product passport',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function PassportLayout({ children }: { children: React.ReactNode }) {
  return children;
}

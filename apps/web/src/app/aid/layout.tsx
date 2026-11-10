import type { Metadata } from 'next';
import { shareMeta } from '@/lib/share-meta';

// M151: an aid box's trip (UniVerse Relief): anyone with the link or the QR code on the box lands here.
// Public, but kept out of search results (every box has its own address).
export const metadata: Metadata = {
  ...shareMeta('relief', 'Follow an aid box from the organisation that packed it to the place it helps.'),
  title: 'Aid tracker',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function AidLayout({ children }: { children: React.ReactNode }) {
  return children;
}

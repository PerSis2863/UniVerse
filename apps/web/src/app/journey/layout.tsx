import type { Metadata } from 'next';
import { shareMeta } from '@/lib/share-meta';

// M248: a trip's family link (UniVerse Travel): a read-only page of the plan for the people at home. Public, but kept
// out of search results (every trip has its own address).
export const metadata: Metadata = {
  ...shareMeta('travel', 'Follow a trip: the plan, where they are today and their check-ins.'),
  title: 'Trip for family',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function JourneyLayout({ children }: { children: React.ReactNode }) {
  return children;
}

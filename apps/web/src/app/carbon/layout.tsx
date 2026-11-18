import type { Metadata } from 'next';
import { shareMeta } from '@/lib/share-meta';

// M271–M274: Green → Business's share links: a supplier's form, the staff commute survey, an auditor's view.
// Public by an unguessable code, kept out of search results.
export const metadata: Metadata = {
  ...shareMeta('green', 'A company’s carbon footprint on UniVerse Green: send your figures, answer the commute survey, or review the report.'),
  title: 'Carbon footprint',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function CarbonLayout({ children }: { children: React.ReactNode }) {
  return children;
}

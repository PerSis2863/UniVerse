import type { Metadata } from 'next';

// An impact room's public page (Stage 4 · 4.12), for sponsors: shared by link, not listed by
// search engines (a school decides who sees it).
export const metadata: Metadata = {
  title: 'Impact',
  description: 'Verified volunteer hours, news and monthly reports from an NGO project on UniVerse.',
  robots: { index: false, follow: false },
};

export default function ImpactLayout({ children }: { children: React.ReactNode }) {
  return children;
}

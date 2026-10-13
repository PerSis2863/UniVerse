import type { Metadata } from 'next';

// An Impact League challenge's public showcase (Stage 5 · D14): shared by link, not listed by search
// engines (the organizers decide who sees it).
export const metadata: Metadata = {
  title: 'Impact League',
  description: 'Student teams from different universities working on a UN Sustainable Development Goal, on UniVerse.',
  robots: { index: false, follow: false },
};

export default function LeagueLayout({ children }: { children: React.ReactNode }) {
  return children;
}

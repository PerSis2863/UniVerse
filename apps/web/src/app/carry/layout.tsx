import type { Metadata } from 'next';

// A driver's sharing link (UniVerse Trace): whoever carries a batch opens it on their phone and shares
// where it is. Public (no sign-in), kept out of search results (each link is private to one batch).
export const metadata: Metadata = {
  title: 'Share a delivery',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function CarryLayout({ children }: { children: React.ReactNode }) {
  return children;
}

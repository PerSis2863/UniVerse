import type { Metadata } from 'next';

// Shared work from Collaborate → Create (M76): a view link opens here for anyone, no sign-in.
// Kept out of search results (every link is its own private address).
export const metadata: Metadata = {
  title: 'Shared work',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

export default function SharedLayout({ children }: { children: React.ReactNode }) {
  return children;
}

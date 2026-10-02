import type { Metadata } from 'next';

// Verification pages carry a person's name: reachable by anyone with the link (or QR code),
// but kept out of search results.
export const metadata: Metadata = {
  title: 'Credential verification',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from 'next';

// The parent / guardian page is reached by a private link: never listed by search engines, and the
// link isn't passed on to other sites in the Referer header.
export const metadata: Metadata = {
  title: 'Student progress',
  description: 'A read-only view of a student’s progress, shared by the student.',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

export default function GuardianLayout({ children }: { children: React.ReactNode }) {
  return children;
}

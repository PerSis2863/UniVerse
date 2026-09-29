import type { Metadata } from 'next';
import { LegalDocPage } from '@/components/legal/LegalDocPage';

export const metadata: Metadata = { title: 'Terms and Conditions · UniVerse', description: 'The terms for using UniVerse.' };

export default function TermsPage() {
  return <LegalDocPage doc="terms" />;
}

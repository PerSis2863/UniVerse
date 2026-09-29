import type { Metadata } from 'next';
import { LegalDocPage } from '@/components/legal/LegalDocPage';

export const metadata: Metadata = { title: 'Privacy Policy · UniVerse', description: 'How UniVerse collects, uses and protects your information.' };

export default function PrivacyPage() {
  return <LegalDocPage doc="privacy" />;
}

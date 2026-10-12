import type { Metadata } from 'next';
import { TrustClient } from './TrustClient';

export const metadata: Metadata = {
  title: 'Trust Center · Security, Privacy & Compliance · UniVerse',
  description:
    'Institutional governance, India DPDP Act 2023, FERPA, COPPA, and GDPR compliance, cryptographic verification, and operational transparency for UniVerse.',
};

export default function TrustPage() {
  return <TrustClient />;
}

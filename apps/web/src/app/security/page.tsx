import type { Metadata } from 'next';
import { A, Bullets, Card, LegalShell, Mail, Section } from '@/components/legal/LegalShell';
import { COMPANY } from '@/lib/company';

export const metadata: Metadata = { title: 'Product Security', description: 'How UniVerse protects your data, and how to report a security vulnerability.' };

const MEASURES = [
  { title: 'Encryption', text: 'All traffic uses HTTPS (TLS). The database and stored files are encrypted at rest by Cloudflare.' },
  { title: 'Sign-in', text: 'Accounts use Firebase Authentication (Google, Apple, email or phone). We never see or store your Google password.' },
  { title: 'Access control', text: 'Every request is checked on the server against your role: student, teacher, admin or NGO. Staff accounts need an administrator’s approval.' },
  { title: 'Audit trail', text: 'Administrative actions are recorded in an audit log. You can see your own sign-in history in Settings.' },
  { title: 'Abuse protection', text: 'Rate limits, a strict Content Security Policy, and checks on uploaded file types protect against automated attacks and malicious files.' },
  { title: 'Payments', text: 'Card details go straight to Stripe (PCI DSS Level 1). UniVerse never receives or stores card numbers.' },
];

export default function SecurityPage() {
  return (
    <LegalShell
      eyebrow="Trust"
      title="Product Security"
      intro={<>Schools trust UniVerse with grades, messages and health information. Here is how we protect it, and how to tell us if you find a problem.</>}
      updated="29 September 2026"
    >
      <Section title="How we protect your data">
        <div className="grid sm:grid-cols-2 gap-3">
          {MEASURES.map((m) => (
            <Card key={m.title}>
              <p className="font-semibold text-white">{m.title}</p>
              <p className="mt-1.5 text-sm text-zinc-400">{m.text}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Keeping your account safe">
        <Bullets items={[
          'Sign in with Google or Apple where you can, and turn on two-step verification for that account.',
          'Check Settings → Privacy → Recent sign-ins from time to time. If you see one you don’t recognise, change your password and tell us.',
          'UniVerse will never ask for your password by email, message or phone.',
        ]} />
      </Section>

      <Section id="report" title="Report a vulnerability">
        <p>
          If you believe you’ve found a security vulnerability in UniVerse, please email <Mail to={COMPANY.email.security} /> with a description,
          the steps to reproduce it, and its impact. You can write in English or French.
        </p>
        <p>We will:</p>
        <Bullets items={[
          'acknowledge your report within 3 working days;',
          'keep you updated while we investigate and fix it;',
          'credit you when it’s fixed, if you would like.',
        ]} />
        <p>Please:</p>
        <Bullets items={[
          'only test against your own accounts, and never access, change or delete other people’s data;',
          'not run denial-of-service, spam or social-engineering tests;',
          'give us reasonable time to fix the issue before sharing it publicly.',
        ]} />
        <p>
          If you follow these guidelines in good faith, we will not take legal action against you for your research. We don’t currently run a paid
          bug bounty. Our contact details are also published in <A href="/.well-known/security.txt">security.txt</A>.
        </p>
      </Section>
    </LegalShell>
  );
}

import type { Metadata } from 'next';
import { ArrowRight, FileText } from 'lucide-react';
import Link from '@/components/ui/Link';
import { LegalShell, Section } from '@/components/legal/LegalShell';

export const metadata: Metadata = { title: 'Corporate Policies', description: 'All of UniVerse’s legal documents and policies in one place.' };

const DOCS = [
  { href: '/terms', title: 'Terms of Service', text: 'The agreement for using UniVerse, including acceptable use, content, subscriptions and liability.' },
  { href: '/privacy', title: 'Privacy Policy', text: 'What personal data we collect, why, who we share it with, and your rights.' },
  { href: '/privacy-choices', title: 'Your Privacy Choices', text: 'The settings you control and how to access, download or delete your data.' },
  { href: '/terms', title: 'Acceptable Use', text: 'What is and isn’t allowed on UniVerse (Terms of Service, section 4).' },
  { href: '/privacy-choices', title: 'Cookie Notice', text: 'We only use essential cookies and storage: no analytics or advertising trackers.' },
  { href: '/security', title: 'Product Security', text: 'How we protect data, and how to report a vulnerability responsibly.' },
  { href: '/accessibility', title: 'Accessibility', text: 'Our accessibility commitment, known limitations, and how to report a barrier.' },
  { href: '/legal-notice', title: 'Legal Notice', text: 'Who publishes UniVerse and who hosts it (mentions légales).' },
];

const PROVIDERS = [
  ['Cloudflare, Inc.', 'Hosting, database, file storage and real-time features', 'United States / global'],
  ['Google LLC — Firebase Authentication', 'Sign-in and identity', 'United States / global'],
  ['Google LLC — Gemini API', 'AI features (only when you use them)', 'United States / global'],
  ['Stripe, Inc.', 'Payments', 'United States / Ireland'],
  ['Resend, Inc.', 'Notification and account emails', 'United States'],
  ['Polygon public blockchain', 'Verification fingerprints of credentials (no personal data)', 'Public network'],
];

const RETENTION = [
  ['Account data', 'Until the account is deleted, plus a 30-day grace period'],
  ['Academic records', 'Enrollment plus 5–7 years, as required by law or the institution'],
  ['Payment records', '7 years (tax and accounting law)'],
  ['Audit and security logs', '2 years (deleted automatically)'],
  ['Sign-in history and technical logs', '90 days (deleted automatically)'],
  ['Staff application documents', 'Until the decision, plus 12 months (deleted automatically)'],
  ['Medical information', 'Until you remove it, withdraw consent, or delete your account'],
  ['Messages', 'Until deleted by the participants or the account is deleted'],
];

export default function PoliciesPage() {
  return (
    <LegalShell eyebrow="Legal" title="Corporate Policies" intro={<>Every policy that governs UniVerse, in one place.</>}>
      <div className="grid sm:grid-cols-2 gap-3">
        {DOCS.map((d) => (
          <Link key={d.title} href={d.href} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:border-indigo-500/40 hover:bg-white/[0.05] transition-colors">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-semibold text-white inline-flex items-center gap-1.5">{d.title} <ArrowRight className="w-4 h-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" /></p>
                <p className="mt-1 text-sm text-zinc-400">{d.text}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <Section id="subprocessors" title="Service providers (subprocessors)">
        <p>These companies process data for us, under data processing agreements, to run UniVerse.</p>
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[520px] text-sm border-collapse">
            <thead><tr className="text-left text-zinc-400"><th className="py-2 px-4 font-semibold">Provider</th><th className="py-2 px-4 font-semibold">Purpose</th><th className="py-2 px-4 font-semibold">Location</th></tr></thead>
            <tbody>
              {PROVIDERS.map(([a, b, c]) => (
                <tr key={a} className="border-t border-white/10"><td className="py-2.5 px-4 text-white">{a}</td><td className="py-2.5 px-4 text-zinc-300">{b}</td><td className="py-2.5 px-4 text-zinc-400">{c}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-zinc-400">Transfers outside the European Union are protected by the European Commission’s Standard Contractual Clauses or the EU–US Data Privacy Framework.</p>
      </Section>

      <Section id="retention" title="How long we keep data">
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[440px] text-sm border-collapse">
            <tbody>
              {RETENTION.map(([a, b]) => (
                <tr key={a} className="border-t border-white/10 first:border-t-0"><td className="py-2.5 px-4 text-white w-2/5">{a}</td><td className="py-2.5 px-4 text-zinc-300">{b}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </LegalShell>
  );
}

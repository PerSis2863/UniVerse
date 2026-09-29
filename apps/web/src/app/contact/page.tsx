import type { Metadata } from 'next';
import { Building2, HelpCircle, LifeBuoy, Lock, Mail as MailIcon, Scale, ShieldAlert } from 'lucide-react';
import { LegalShell, Mail, Section } from '@/components/legal/LegalShell';
import { COMPANY } from '@/lib/company';

export const metadata: Metadata = { title: 'Contact', description: 'How to reach the UniVerse team.' };

const CHANNELS = [
  { id: 'sales', icon: Building2, title: 'Schools, universities & sales', text: 'Plans, demos, Enterprise quotes and partnerships.', email: COMPANY.email.general, subject: 'UniVerse enquiry' },
  { id: 'support', icon: LifeBuoy, title: 'Help with your account', text: 'Signed in? Use Support in the app for the fastest answer. Otherwise, email us.', email: COMPANY.email.support },
  { id: 'privacy', icon: Lock, title: 'Privacy & your data', text: 'Data requests (access, download, deletion) and questions for our data protection contact.', email: COMPANY.email.privacy },
  { id: 'legal', icon: Scale, title: 'Legal', text: 'Legal notices, copyright complaints and questions about our terms.', email: COMPANY.email.legal },
  { id: 'security', icon: ShieldAlert, title: 'Security', text: 'Report a vulnerability or a suspected account compromise.', email: COMPANY.email.security },
  { id: 'general', icon: HelpCircle, title: 'Everything else', text: 'Press, feedback, or if you’re not sure who to ask.', email: COMPANY.email.general },
];

export default function ContactPage() {
  return (
    <LegalShell eyebrow="Company" title="Contact us" intro={<>We’re a small team and we read every message. Pick the right address below and we’ll get back to you, usually within one working day.</>}>
      <div className="grid sm:grid-cols-2 gap-3">
        {CHANNELS.map((c) => (
          <div id={c.id} key={c.id} className="scroll-mt-28 rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex flex-col">
            <c.icon className="w-5 h-5 text-indigo-400" />
            <p className="mt-3 font-semibold text-white">{c.title}</p>
            <p className="mt-1 text-sm text-zinc-400 flex-1">{c.text}</p>
            <a href={`mailto:${c.email}${c.subject ? `?subject=${encodeURIComponent(c.subject)}` : ''}`} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-indigo-400 hover:text-indigo-300 break-all">
              <MailIcon className="w-4 h-4 shrink-0" /> {c.email}
            </a>
          </div>
        ))}
      </div>

      <Section title="Postal address">
        <address className="not-italic text-zinc-300">
          <strong className="text-white">{COMPANY.legalName}</strong><br />
          {COMPANY.address.map((l) => <span key={l}>{l}<br /></span>)}
        </address>
        <p className="text-sm text-zinc-400">For legal notices, please also email <Mail to={COMPANY.email.legal} />.</p>
      </Section>
    </LegalShell>
  );
}

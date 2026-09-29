import type { Metadata } from 'next';
import { A, Card, LegalShell, Mail, Section } from '@/components/legal/LegalShell';
import { COMPANY } from '@/lib/company';

export const metadata: Metadata = { title: 'Legal Notice', description: 'Publisher and hosting information for universeimpact.com (mentions légales).' };

export default function LegalNoticePage() {
  return (
    <LegalShell eyebrow="Legal" title="Legal Notice" intro={<>Mentions légales: information required by French law (article 6 of the Loi pour la confiance dans l’économie numérique, LCEN).</>}>
      <Section title="Publisher">
        <Card>
          <p className="text-white font-semibold">{COMPANY.legalName}</p>
          <p className="mt-1 text-zinc-300">{COMPANY.address.join(', ')}</p>
          <p className="mt-2 text-sm text-zinc-400">Email: <Mail to={COMPANY.email.legal} /> · Website: {COMPANY.website}</p>
        </Card>
      </Section>

      <Section title="Hosting">
        <Card>
          <p className="text-white font-semibold">{COMPANY.host.name}</p>
          <p className="mt-1 text-zinc-300">{COMPANY.host.address}</p>
          <p className="mt-2 text-sm text-zinc-400">Website: <A href={`https://www.${COMPANY.host.website}`}>{COMPANY.host.website}</A></p>
        </Card>
      </Section>

      <Section title="Intellectual property">
        <p>
          The UniVerse name, logo, design and software are the property of {COMPANY.legalName}. Content posted by users belongs to them, as set out in
          the <A href="/terms">Terms of Service</A>.
        </p>
      </Section>

      <Section title="Personal data">
        <p>
          How we handle personal data is explained in the <A href="/privacy">Privacy Policy</A>. To exercise your rights, email <Mail to={COMPANY.email.privacy} />,
          or see <A href="/privacy-choices">Your Privacy Choices</A>.
        </p>
      </Section>
    </LegalShell>
  );
}

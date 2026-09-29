import type { Metadata } from 'next';
import { A, Bullets, Card, LegalShell, Mail, Section } from '@/components/legal/LegalShell';
import { COMPANY } from '@/lib/company';

export const metadata: Metadata = { title: 'Your Privacy Choices', description: 'The choices you have over your information on UniVerse, and how to use them.' };

const CHOICES = [
  { title: 'Email notifications', where: 'Settings → Notifications', text: 'Turn off emails about grades, credential decisions, missed messages and quiz reminders. You will still see them in the app.' },
  { title: 'Push notifications', where: 'Settings → Notifications, or your browser settings', text: 'Allow or block notifications on each device. You can change this at any time in your browser or phone settings.' },
  { title: 'Sign-in history', where: 'Settings → Privacy', text: 'See when and where your account was used (device, browser, approximate location). If you don’t recognise a sign-in, change your password and contact us.' },
  { title: 'Medical information', where: 'Student Life → Medical', text: 'Adding medical details is optional. You can change or clear them whenever you want.' },
  { title: 'Whiteboard sharing', where: 'Any whiteboard → Share', text: 'Choose exactly who can view or edit each board, and turn link sharing on or off.' },
  { title: 'AI features', where: 'Settings → AI Features', text: 'Turn the AI study assistant off. Nothing is sent to our AI provider unless you use an AI feature.' },
];

export default function PrivacyChoicesPage() {
  return (
    <LegalShell
      eyebrow="Privacy"
      title="Your Privacy Choices"
      intro={<>You decide how your information is used on UniVerse. Here is what you can control, where to find it, and how to ask us for more.</>}
    >
      <Section title="We don’t sell or share your personal information">
        <p>
          UniVerse does not sell your personal information, does not share it for cross-context behavioural advertising, and does not use
          advertising or tracking cookies. There is nothing to opt out of, but if your browser sends a <strong>Global Privacy Control</strong> signal
          we treat it as a request not to sell or share, as California law requires.
        </p>
      </Section>

      <Section title="Choices in your account">
        <div className="grid sm:grid-cols-2 gap-3">
          {CHOICES.map((c) => (
            <Card key={c.title}>
              <p className="font-semibold text-white">{c.title}</p>
              <p className="mt-0.5 text-xs font-medium text-indigo-300">{c.where}</p>
              <p className="mt-2 text-sm text-zinc-400">{c.text}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Cookies">
        <p>
          We only use what the platform needs to work: keeping you signed in, remembering your theme and language, and security. These can’t be
          switched off without breaking sign-in, so there is no cookie banner. We use no analytics, advertising or social media trackers.
        </p>
      </Section>

      <Section title="Access, correct, download or delete your data">
        <p>You can ask us to:</p>
        <Bullets items={[
          'send you a copy of the personal data we hold about you, in a machine-readable format (JSON);',
          'correct information that is wrong or out of date;',
          'delete your account and personal data, except what we or your institution must keep by law;',
          'restrict or object to how we use your data, or withdraw consent you gave (for example for medical information).',
        ]} />
        <p>
          Email <Mail to={COMPANY.email.privacy} /> from the address on your account, and say which request you are making. We may ask you to confirm
          your identity. We reply within 30 days (45 days for California residents). If your account is managed by your school or university, you
          can also ask its administrator.
        </p>
      </Section>

      <Section title="If you’re not satisfied">
        <p>
          Contact our privacy team first at <Mail to={COMPANY.email.privacy} />. You also have the right to complain to a data protection authority.
          Because {COMPANY.legalName} is based in France, our lead authority is the <A href="https://www.cnil.fr/en">CNIL</A> (Commission Nationale de
          l’Informatique et des Libertés); you can also contact the authority where you live, such as the ICO (UK), the California Privacy Protection
          Agency, or the Data Protection Board of India.
        </p>
        <p>
          Read the full <A href="/privacy">Privacy Policy</A> for details.
        </p>
      </Section>
    </LegalShell>
  );
}

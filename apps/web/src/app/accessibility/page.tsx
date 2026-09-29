import type { Metadata } from 'next';
import { A, Bullets, LegalShell, Mail, Section } from '@/components/legal/LegalShell';
import { COMPANY } from '@/lib/company';

export const metadata: Metadata = { title: 'Accessibility', description: 'How UniVerse works to be usable by everyone, and how to tell us about a barrier.' };

export default function AccessibilityPage() {
  return (
    <LegalShell
      eyebrow="Trust"
      title="Accessibility"
      intro={<>Education should be open to everyone. We want every student, teacher and partner to be able to use UniVerse, whatever device, ability or assistive technology they rely on.</>}
      updated="29 September 2026"
    >
      <Section title="Our goal">
        <p>
          We aim to meet the <A href="https://www.w3.org/TR/WCAG22/">Web Content Accessibility Guidelines (WCAG) 2.2</A> at level AA across the website
          and app, which is also the level referenced by the European Accessibility Act (EN 301 549) and France’s RGAA.
        </p>
      </Section>

      <Section title="What we do">
        <Bullets items={[
          'Works on phones, tablets and computers, and can be installed as an app on iOS, Android and desktop.',
          'Light and dark themes, with text and controls checked for colour contrast.',
          'Respects your device’s “reduce motion” setting and switches off animations.',
          'Buttons, menus and dialogs have text labels for screen readers, and can be used with a keyboard.',
          'Text can be enlarged with browser or phone zoom without losing content.',
          'Available in English, French, Spanish and Hindi (Settings → Language).',
          'Our Terms and Privacy Policy are tagged PDFs that screen readers can read, and can be downloaded.',
        ]} />
      </Section>

      <Section title="Known limitations">
        <p>We are still working on some areas:</p>
        <Bullets items={[
          'Whiteboards are drawing canvases. Screen readers can’t describe what is drawn; export a board as an image or add text notes to share it.',
          'Some older pages and charts don’t yet have full text alternatives.',
          'Files that users upload (documents, images, videos) may not be accessible; we can’t control their content.',
          'Video calls use Jitsi Meet, whose accessibility depends on that service.',
        ]} />
      </Section>

      <Section title="Tell us about a barrier">
        <p>
          If something on UniVerse is hard or impossible for you to use, email <Mail to={COMPANY.email.support} /> with the page and what happened.
          We aim to reply within 5 working days and, where we can, to give you the information in another format in the meantime.
        </p>
        <p>
          If you are in France and not satisfied with our response, you can contact the <A href="https://www.defenseurdesdroits.fr/">Défenseur des droits</A>.
        </p>
      </Section>
    </LegalShell>
  );
}

// UniVerse Terms of Use and Privacy Notice, shown on the sign-up page and on the first-sign-in
// acceptance screen. When you change the text in a way people must agree to again, bump
// TERMS_VERSION in src/lib/terms-version.ts: everyone is asked to accept it on their next visit.

import { TERMS_UPDATED } from '@/lib/terms-version';
export { TERMS_VERSION, TERMS_UPDATED } from '@/lib/terms-version';

const H = ({ children }: { children: React.ReactNode }) => <h3 className="mt-6 mb-2 text-base font-bold text-white">{children}</h3>;
const P = ({ children }: { children: React.ReactNode }) => <p className="mb-3 text-sm leading-relaxed text-zinc-300">{children}</p>;
const L = ({ items }: { items: React.ReactNode[] }) => (
  <ul className="mb-3 space-y-1.5 text-sm leading-relaxed text-zinc-300 list-disc pl-5">
    {items.map((x, i) => <li key={i}>{x}</li>)}
  </ul>
);

export function TermsContent() {
  return (
    <article className="text-left">
      <p className="text-xs text-zinc-500">Last updated {TERMS_UPDATED}</p>

      <h2 className="mt-4 text-lg font-black text-white">Terms of Use</h2>
      <P>
        UniVerse (“the platform”, “we”) connects students, universities, teachers and NGOs for learning, collaboration and social-impact work.
        By creating an account or using the platform you agree to these terms. If you don&apos;t agree, please don&apos;t use UniVerse.
      </P>

      <H>1. Your account</H>
      <L items={[
        'Give accurate information and keep it up to date. One account per person.',
        'Keep your sign-in details private. You are responsible for what happens under your account; tell us straight away if you think someone else has used it.',
        'Teacher and NGO accounts are approved by an administrator before they get staff access. We may ask for proof of your role.',
        'If you are under 18, use UniVerse only with the permission of a parent, guardian or your institution.',
      ]} />

      <H>2. Acceptable use</H>
      <P>You agree not to:</P>
      <L items={[
        'harass, bully, threaten or discriminate against anyone, or share hateful, violent, sexual or illegal content;',
        'cheat, plagiarise, or help others do so in quizzes, assignments or credentials;',
        'pretend to be someone else, or misrepresent your role, institution or qualifications;',
        'upload malware, spam, or content you don’t have the right to share;',
        'try to break, overload, scrape or get around the platform’s security or limits.',
      ]} />

      <H>3. Your content</H>
      <P>
        You keep ownership of what you post (messages, files, projects, applications). You give UniVerse permission to store, display and process it
        so the platform can work, for example showing your posts to the people you share them with. Remove content at any time; copies may remain in
        backups for a limited period.
      </P>

      <H>4. Credentials, grades and certificates</H>
      <P>
        Grades, attendance and credentials are issued by your teachers, institution or administrators. Verified credentials are digitally signed and
        may be checked publicly by anyone with their code. Credentials can be revoked if they were issued in error or obtained dishonestly.
      </P>

      <H>5. Moderation and suspension</H>
      <P>
        Administrators may review, edit or remove content and may suspend or close accounts that break these terms or put others at risk.
        Where appropriate we will tell you why.
      </P>

      <H>6. Paid plans</H>
      <P>Organizations may subscribe to paid plans. Prices, billing periods and cancellation are shown before you pay and handled by our payment provider.</P>

      <H>7. Availability and liability</H>
      <P>
        We work to keep UniVerse available, accurate and secure, but the platform is provided “as is”. To the extent the law allows, we are not
        liable for indirect losses, or for content posted by other users. Nothing in these terms limits rights you have under the law.
      </P>

      <H>8. Changes</H>
      <P>We may update these terms. If a change matters, we will ask you to accept the new version before you continue.</P>

      <h2 className="mt-8 text-lg font-black text-white">Privacy Notice</h2>

      <H>What we collect</H>
      <L items={[
        'Account details: name, email, phone number, profile photo, role, institution and department.',
        'What you add: courses, grades, attendance, quiz answers, messages and calls, files, applications, documents, emergency contacts and, if you choose to add it, medical information.',
        'Sign-in and usage information: when you sign in or open the app, your device and browser, IP address and approximate location (city and country), and actions you take on the platform.',
      ]} />

      <H>How we use it</H>
      <L items={[
        'to run the platform: sign-in, courses, messaging, notifications, credentials and applications;',
        'to keep it safe: detecting misuse, investigating reports, and showing you your own sign-in history;',
        'to send you notifications and emails (you can turn emails off in Settings).',
      ]} />

      <H>Who can see your information</H>
      <L items={[
        'Other people you interact with see what they need (e.g. your name in a chat, your work in a course).',
        'Your teachers and institution see your academic records for their courses.',
        <span key="admin"><strong className="text-white">Platform administrators can access account data, including private messages, call records, documents and activity history,</strong> to operate the platform, moderate content, investigate reports and keep users safe. Administrator actions are logged.</span>,
        'Service providers that host and run the platform for us (e.g. cloud hosting, email delivery, payments, sign-in), only as needed to provide their service.',
        'Authorities, when required by law.',
      ]} />
      <P>We do not sell your personal information.</P>

      <H>Keeping and deleting data</H>
      <P>
        We keep your data while your account is active and as long as needed for the purposes above or by law. You can ask to see, correct or
        delete your data through Support; some records (e.g. issued credentials, grades) may be kept by your institution.
      </P>

      <H>Contact</H>
      <P>Questions about these terms or your data: use Support in the app.</P>
    </article>
  );
}

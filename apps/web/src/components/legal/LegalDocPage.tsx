import { FileText } from 'lucide-react';
import Link from '@/components/ui/Link';
import { LegalShell, Mail } from '@/components/legal/LegalShell';
import { LegalMarkdown, parseLegal } from '@/components/legal/LegalMarkdown';
import { LEGAL_DOCS, type LegalDocId } from '@/lib/legal';
import { COMPANY } from '@/lib/company';
import termsMd from '../../../legal/terms.md';
import privacyMd from '../../../legal/privacy.md';

const SOURCES: Record<LegalDocId, string> = { terms: termsMd, privacy: privacyMd };

/** Shows one of UniVerse's legal documents as part of the page, like the other legal pages. */
export function LegalDocPage({ doc }: { doc: LegalDocId }) {
  const d = LEGAL_DOCS[doc];
  const other = LEGAL_DOCS[doc === 'terms' ? 'privacy' : 'terms'];
  const { updated, body, headings } = parseLegal(SOURCES[doc]);
  return (
    <LegalShell title={d.title} intro={d.blurb} updated={updated}>
      <nav aria-label="Contents" className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Contents</p>
        <ol className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 text-sm">
          {headings.map((h) => (
            <li key={h.id}><a href={`#${h.id}`} className="text-zinc-300 hover:text-white transition-colors">{h.title}</a></li>
          ))}
        </ol>
      </nav>

      <LegalMarkdown source={body} />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/10 pt-6 text-sm text-zinc-500">
        <Link href={other.href} className="inline-flex items-center gap-2 font-semibold text-zinc-300 hover:text-white transition-colors">
          <FileText className="w-4 h-4" /> {other.title}
        </Link>
        <p>
          Questions about this document? Email <Mail to={COMPANY.email.legal} />, or see all our{' '}
          <Link href="/policies" className="text-indigo-400 hover:underline">policies</Link>.
        </p>
      </div>
    </LegalShell>
  );
}

import { Download, ExternalLink, FileText } from 'lucide-react';
import Link from '@/components/ui/Link';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { LEGAL_DOCS, type LegalDocId } from '@/lib/legal';

/** Shows one of UniVerse's legal documents (a PDF) inside the site, with open and download links. */
export function LegalDocPage({ doc }: { doc: LegalDocId }) {
  const d = LEGAL_DOCS[doc];
  const other = LEGAL_DOCS[doc === 'terms' ? 'privacy' : 'terms'];
  const file = d.pdf.split('/').pop();
  return (
    <div className="dark min-h-screen overflow-x-clip font-sans" style={{ backgroundColor: '#0a0d13', color: '#ffffff' }}>
      <div aria-hidden className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-35%] w-[max(80vw,760px)] h-[max(80vw,760px)] rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(79,70,229,0.22), transparent)' }} />
        <div className="absolute bottom-[-25%] right-[-40%] w-[max(75vw,720px)] h-[max(75vw,720px)] rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(192,38,211,0.14), transparent)' }} />
      </div>

      <MarketingNav />

      <main className="relative z-10 px-4 sm:px-6 pt-32 md:pt-40 pb-20">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400">Legal</p>
          <h1 className="mt-3 text-3xl sm:text-5xl font-black tracking-tight">{d.title}</h1>
          <p className="mt-3 max-w-2xl text-zinc-400">{d.blurb}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a href={d.pdf} target="_blank" rel="noopener" className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-white text-zinc-900 text-sm font-bold hover:bg-zinc-200 transition-colors">
              <ExternalLink className="w-4 h-4" /> Open full screen
            </a>
            <a href={d.pdf} download={file} className="inline-flex items-center gap-2 h-11 px-5 rounded-full border border-white/15 text-sm font-semibold text-zinc-200 hover:bg-white/[0.06] transition-colors">
              <Download className="w-4 h-4" /> Download PDF
            </a>
            <Link href={other.href} className="inline-flex items-center gap-2 h-11 px-5 rounded-full text-sm font-semibold text-zinc-400 hover:text-white transition-colors">
              <FileText className="w-4 h-4" /> {other.title}
            </Link>
          </div>

          {/* Phones show PDFs poorly inside a page, so they get a button to open it instead. */}
          <div className="mt-8 hidden sm:block rounded-3xl overflow-hidden border border-white/10 bg-white shadow-2xl shadow-black/40">
            <iframe src={`${d.pdf}#navpanes=0&view=FitH`} title={`UniVerse ${d.title}`} className="w-full h-[80vh] min-h-[560px] block" />
          </div>
          <a href={d.pdf} target="_blank" rel="noopener" className="sm:hidden mt-8 flex items-center gap-4 p-5 rounded-3xl border border-white/10 bg-white/[0.04]">
            <span className="w-12 h-12 rounded-2xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0"><FileText className="w-6 h-6" /></span>
            <span className="min-w-0">
              <span className="block font-bold">Read the {d.title}</span>
              <span className="block text-sm text-zinc-400">Opens the PDF · 6 pages</span>
            </span>
          </a>

          <p className="mt-6 text-sm text-zinc-500">
            Questions about this document? Email{' '}
            <a href="mailto:myuniverseimpact@gmail.com" className="text-indigo-400 hover:underline">myuniverseimpact@gmail.com</a>.
          </p>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}

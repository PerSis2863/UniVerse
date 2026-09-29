import Link from '@/components/ui/Link';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';

// Layout for the public legal and trust pages (/privacy-choices, /accessibility, /security, …):
// the marketing nav and footer, a page heading, and readable body text.

export function LegalShell({ eyebrow = 'Legal', title, intro, updated, children }: { eyebrow?: string; title: string; intro?: React.ReactNode; updated?: string; children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen overflow-x-clip font-sans" style={{ backgroundColor: '#0a0d13', color: '#ffffff' }}>
      <div aria-hidden className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-35%] w-[max(80vw,760px)] h-[max(80vw,760px)] rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(79,70,229,0.22), transparent)' }} />
        <div className="absolute bottom-[-25%] right-[-40%] w-[max(75vw,720px)] h-[max(75vw,720px)] rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(192,38,211,0.14), transparent)' }} />
      </div>
      <MarketingNav />
      <main className="relative z-10 px-4 sm:px-6 pt-32 md:pt-40 pb-20">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400">{eyebrow}</p>
          <h1 className="mt-3 text-3xl sm:text-5xl font-black tracking-tight break-words">{title}</h1>
          {intro && <div className="mt-4 text-base sm:text-lg text-zinc-400 leading-relaxed">{intro}</div>}
          {updated && <p className="mt-3 text-xs text-zinc-500">Last updated {updated}</p>}
          <div className="mt-10 space-y-10">{children}</div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}

export function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="text-xl sm:text-2xl font-bold text-white">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-zinc-300">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2 pl-5 list-disc marker:text-indigo-400">
      {items.map((x, i) => <li key={i}>{x}</li>)}
    </ul>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-white/10 bg-white/[0.03] p-5 ${className}`}>{children}</div>;
}

export function A({ href, children }: { href: string; children: React.ReactNode }) {
  const cls = 'text-indigo-400 hover:text-indigo-300 underline-offset-2 hover:underline break-words';
  return href.startsWith('/') ? <Link href={href} className={cls}>{children}</Link> : <a href={href} className={cls} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener">{children}</a>;
}

export function Mail({ to }: { to: string }) {
  return <A href={`mailto:${to}`}>{to}</A>;
}

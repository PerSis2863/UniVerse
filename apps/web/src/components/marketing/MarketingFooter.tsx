import Link from '@/components/ui/Link';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { COMPANY, LEGAL_LINKS } from '@/lib/company';

const COLUMNS = [
  { title: 'Product', links: [{ href: '/#product', label: 'Platform' }, { href: '/#solutions', label: 'Solutions' }, { href: '/#security', label: 'Security' }] },
  { title: 'For', links: [{ href: '/#solutions', label: 'Students' }, { href: '/#solutions', label: 'Universities' }, { href: '/#solutions', label: 'NGOs & organizations' }] },
  { title: 'Company', links: [{ href: '/#faq', label: 'FAQ' }, { href: '/contact', label: 'Contact' }, { href: '/contact#sales', label: 'Talk to sales' }] },
  { title: 'Trust', links: [{ href: '/security', label: 'Product Security' }, { href: '/accessibility', label: 'Accessibility' }, { href: '/policies', label: 'Corporate Policies' }] },
];

export function MarketingFooter() {
  return (
    <footer className="relative z-10 border-t border-white/[0.06] mt-10">
      <div className="max-w-7xl mx-auto px-6 py-14 grid gap-10 grid-cols-2 md:grid-cols-[1.5fr_repeat(4,1fr)]">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2.5 mb-4">
            <UniverseLogo size="sm" />
            <span className="font-black text-white text-lg">UniVerse</span>
          </div>
          <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">The operating system for education that creates real-world impact.</p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-4">{col.title}</h4>
            <ul className="space-y-2.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-zinc-500 hover:text-white transition-colors">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Legal bar */}
      <div className="border-t border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 py-7">
          {/* Phones: a tidy two-column list. Wider screens: one line with dividers. */}
          <nav aria-label="Legal" className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] text-zinc-400 md:flex md:flex-wrap md:items-center md:gap-y-2">
            {LEGAL_LINKS.map((l, i) => (
              <span key={l.href} className="inline-flex items-center">
                {i > 0 && <span aria-hidden className="hidden md:inline-block mx-3.5 h-3.5 w-px bg-white/15" />}
                <Link href={l.href} className="hover:text-white transition-colors">{l.label}</Link>
              </span>
            ))}
          </nav>
          <div className="mt-6 pt-5 border-t border-white/[0.04] flex flex-col md:flex-row gap-3 md:items-center justify-between text-xs text-zinc-500">
            <p className="leading-relaxed">
              Copyright © {new Date().getFullYear()} {COMPANY.legalName}. All rights reserved.
              <span className="block md:inline md:before:content-['·'] md:before:mx-2">Paris, France</span>
            </p>
            <p className="inline-flex items-center gap-1.5 text-zinc-400">
              Made with
              <span className="animate-heartbeat text-rose-500" role="img" aria-label="love">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden><path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2.2 4.5 5.9 4.1c2.2-.2 3.6 1 4.4 2.2.3.4.8.4 1.1 0 .9-1.2 2.3-2.4 4.5-2.2 3.7.4 5.5 4.3 3.9 7.6C19.5 16.4 12 21 12 21z" /></svg>
              </span>
              by <span className="font-semibold text-zinc-200">Aditya Bhatt</span>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

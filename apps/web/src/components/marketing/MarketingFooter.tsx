import Link from 'next/link';
import { UniverseLogo } from '@/components/ui/UniverseLogo';

const COLUMNS = [
  { title: 'Product', links: [{ href: '/#product', label: 'Platform' }, { href: '/#solutions', label: 'Solutions' }, { href: '/pricing', label: 'Pricing' }, { href: '/#security', label: 'Security' }] },
  { title: 'For', links: [{ href: '/#solutions', label: 'Students' }, { href: '/#solutions', label: 'Universities' }, { href: '/#solutions', label: 'NGOs & organizations' }] },
  { title: 'Company', links: [{ href: '/#faq', label: 'FAQ' }, { href: 'mailto:myuniverseimpact@gmail.com', label: 'Contact' }, { href: 'mailto:myuniverseimpact@gmail.com?subject=Enterprise%20enquiry', label: 'Talk to sales' }] },
];

export function MarketingFooter() {
  return (
    <footer className="relative z-10 border-t border-white/[0.06] mt-10">
      <div className="max-w-7xl mx-auto px-6 py-16 grid gap-12 md:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <UniverseLogo size="sm" />
            <span className="font-black text-white text-lg">UniVerse</span>
          </div>
          <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">
            The operating system for education that creates real-world impact.
          </p>
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
      <div className="border-t border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row gap-2 items-center justify-between text-xs text-zinc-600">
          <span>© {new Date().getFullYear()} UniVerse Impact Network · <a href="mailto:myuniverseimpact@gmail.com" className="hover:text-indigo-400">myuniverseimpact@gmail.com</a></span>
          <span>Made with <span className="text-red-500">❤️</span> by Aditya Bhatt</span>
        </div>
      </div>
    </footer>
  );
}

'use client';

import Link from '@/components/ui/Link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, MotionConfig, m as motion, useScroll, useSpring } from 'framer-motion';
import { ArrowRight, ChevronDown, Smartphone, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { StrandField } from '@/components/landing/StrandField';
import { LightTrail } from '@/components/LightTrail';
import { HeroFlow } from '@/components/landing/HeroFlow';
import { Proof } from '@/components/landing/Proof';
import { Glue } from '@/components/landing/Glue';
import { Bento } from '@/components/landing/Bento';
import { Statement } from '@/components/landing/Statement';
import { Pricing } from '@/components/landing/Pricing';
import { SplitCta } from '@/components/landing/SplitCta';
import { Accent, EASE, Reveal, Tag, ghost, primary } from '@/components/landing/bits';

// The public landing page, in the style of the owner's Relay video (a dark page, a bundle of light
// pouring through the hero, a live flow card, numbers that draw themselves as you scroll) and in
// UniVerse's two tones: indigo into fuchsia, never green. Every claim on it is about what the
// product does; no invented usage numbers or quotes. Sections: src/components/landing/.

const FAQ = [
  { q: 'Is UniVerse free to use?', a: 'Yes. The Starter plan is free forever and includes the full student, teacher and admin portals, the NGO marketplace, messaging and verified credentials. Organizations upgrade only when they want premium analytics, exports or AI reporting.' },
  { q: 'How does an organization upgrade?', a: 'Admins see the plans in Billing & Plans inside the admin portal. Pro can be started there with a 14-day free trial; Enterprise is tailored to each institution, so admins contact our team from the same page for a quote.' },
  { q: 'Can we switch plans or cancel later?', a: 'Any time. Admins manage their subscription, payment method and invoices from Billing & Plans inside the admin dashboard.' },
  { q: 'Who pays — students or organizations?', a: 'Organizations. Students never pay to use UniVerse. Premium plans are purchased by a university, NGO or company admin for their organization.' },
  { q: 'How are credentials verified?', a: 'Each certificate is fingerprinted and anchored on the Polygon blockchain. Anyone can open its public verification link to confirm it is genuine and unaltered.' },
  { q: 'Do you offer custom contracts or invoicing?', a: 'Yes — Enterprise customers can request invoiced billing. Email us and we will get back to you.' },
];

function FaqItem({ q, a, i }: { q: string; a: string; i: number }) {
  const [open, setOpen] = useState(i === 0);
  return (
    <Reveal delay={i * 0.04}>
      <div className="border-b border-white/[0.07]">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center justify-between gap-6 py-6 text-start">
          <span className="font-semibold text-lg text-white">{q}</span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.3 }} className="shrink-0 w-8 h-8 rounded-full border border-white/10 flex items-center justify-center">
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden">
              <p className="pb-6 text-zinc-400 leading-relaxed max-w-3xl">{a}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Reveal>
  );
}

/** Chrome's beforeinstallprompt event (not in the DOM types). */
type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export default function ShowcasePage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30 });

  useEffect(() => {
    if (user) router.replace(user.owner ? '/console' : `/${user.role.toLowerCase() || 'student'}`);
  }, [user, router]);

  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e as InstallPromptEvent); };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (installed) return void toast.success('App is already installed!');
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') { setInstalled(true); toast.success('App installed successfully!'); }
      setInstallPrompt(null);
      return;
    }
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
    toast(isIOS ? '📱 How to install on iOS' : '💻 How to install', {
      description: isIOS
        ? 'Tap the Share icon at the bottom of Safari, then scroll down and tap "Add to Home Screen".'
        : 'Look for the install icon (usually a computer with a down arrow) in your address bar to install the app.',
      duration: 10000,
      style: { background: '#4f46e5', color: 'white', border: 'none' },
    });
  };

  return (
    <MotionConfig reducedMotion="user">
      {/* Opened as the installed app (an older install whose start address is still "/"): go to
          the app's start (sign in, or your dashboard) instead of the website's landing page. */}
      <script dangerouslySetInnerHTML={{ __html: "if(window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone){location.replace('/app')}" }} />
      <div className="mkt-smooth dark min-h-screen overflow-x-clip font-sans" style={{ backgroundColor: '#07080f', color: '#ffffff' }}>
        <motion.div style={{ scaleX: progress }} className="fixed top-0 inset-x-0 h-[2px] origin-left z-[60] bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-pink-500" />
        {/* The page's two-tone glow and the river of light, behind everything below the hero. */}
        <div aria-hidden className="fixed inset-0 pointer-events-none z-0">
          {/* The river of light, from below the hero to the bottom of the page (the hero has its own bend). */}
          <LightTrail tone="dark" from={0.9} strength={0.72} />
          <div className="mkt-drift-a absolute top-[30%] start-[-30%] w-[max(70vw,700px)] h-[max(70vw,700px)] rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(79,70,229,0.16), transparent)' }} />
          <div className="mkt-drift-b absolute bottom-[-25%] end-[-35%] w-[max(70vw,700px)] h-[max(70vw,700px)] rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(192,38,211,0.12), transparent)' }} />
        </div>

        <MarketingNav />

        {/* data-no-motion: this page has its own choreography (the site-wide reveals would hide its
            sections, and the typing and ticking parts would keep waking them). */}
        <main data-no-motion className="relative z-10">
          {/* ── Hero: the light pours through behind the words and the flow card ── */}
          <section data-no-motion className="relative min-h-[100svh] px-6 pt-32 md:pt-36 pb-20 overflow-hidden">
            <StrandField className="absolute inset-0 w-full h-full pointer-events-none opacity-60 lg:opacity-100" />
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#07080f] pointer-events-none" />
            <div className="relative max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
              <div>
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
                  <span className="inline-flex items-center gap-2 h-8 px-3 rounded-full border border-white/10 bg-black/30 backdrop-blur font-mono text-xs text-zinc-200">
                    <Sparkles className="w-3.5 h-3.5 text-fuchsia-300" /> free for students / 13 languages
                  </span>
                </motion.div>
                <h1 className="mt-7 text-5xl sm:text-6xl lg:text-7xl font-bold tracking-[-0.035em] leading-[1.02] text-white">
                  {['The', 'school', 'day', 'runs'].map((w, i) => (
                    <motion.span key={w} className="inline-block me-[0.25em]" initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.8, delay: 0.1 + i * 0.07, ease: EASE }}>{w}</motion.span>
                  ))}
                  <motion.span className="inline-block" initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.9, delay: 0.42, ease: EASE }}><Accent>itself.</Accent></motion.span>
                </h1>
                <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.55, ease: EASE }} className="mt-6 text-lg text-zinc-300 max-w-md leading-relaxed">
                  UniVerse runs the steps between classes, grades and parents, and only asks a person when it matters.
                </motion.p>
                <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.65, ease: EASE }} className="mt-9 flex flex-wrap items-center gap-3">
                  <Link href="/register" className={primary}>Start free <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></Link>
                  <button type="button" onClick={handleInstallClick} className={ghost}><Smartphone className="w-4 h-4" /> {installed ? 'Open the app' : 'Get the app'}</button>
                </motion.div>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.8 }} className="mt-5 font-mono text-xs text-zinc-400">free for students / no card / every role in one app</motion.p>
              </div>
              <motion.div initial={{ opacity: 0, y: 40, rotateX: 12 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ duration: 1.1, delay: 0.35, ease: EASE }} style={{ transformPerspective: 1200 }} className="flex justify-center lg:justify-end">
                <HeroFlow />
              </motion.div>
            </div>
          </section>

          <Proof />
          <Glue />
          <Bento />
          <Statement />
          <Pricing />

          <section id="faq" className="px-6 py-24 scroll-mt-24">
            <div className="max-w-3xl mx-auto">
              <Reveal><Tag>faq</Tag></Reveal>
              <Reveal delay={0.05}><h2 className="mt-5 mb-8 text-4xl md:text-5xl font-bold tracking-tight text-white">Questions, <Accent>answered.</Accent></h2></Reveal>
              {FAQ.map((f, i) => <FaqItem key={f.q} {...f} i={i} />)}
            </div>
          </section>

          <SplitCta />
        </main>

        <MarketingFooter />
      </div>
    </MotionConfig>
  );
}

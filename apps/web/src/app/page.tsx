'use client';

import Link from '@/components/ui/Link';
import { InstallGuide } from '@/components/pwa/InstallGuide';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, MotionConfig, m as motion, useScroll, useSpring, useTransform } from 'framer-motion';
import { ArrowRight, ChevronDown, Smartphone, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { LightTrail } from '@/components/LightTrail';
import { CampusScene, GreenScene, PlayScene, ReliefScene, TraceScene } from '@/components/landing/HeroScenes';
import { TraceSection } from '@/components/landing/TraceSection';
import { CampaignsSection, HowSection, MapsSection, PricingSection } from '@/components/landing/Business';
import { Proof } from '@/components/landing/Proof';
import { Glue } from '@/components/landing/Glue';
import { Bento } from '@/components/landing/Bento';
import { Statement } from '@/components/landing/Statement';
import { AppTabs } from '@/components/landing/AppTabs';
import { AppsGrid, GreenSection, ReliefSection, PlaySection } from '@/components/landing/ImpactApps';
import { SplitCta } from '@/components/landing/SplitCta';
import { Accent, EASE, Reveal, Tag, ghost, primary } from '@/components/landing/bits';
import type { AppId } from '@/lib/apps';
import { setChosenApp, useChosenApp } from '@/lib/chosen-app';
import { homeFor } from '@/lib/role-home';

// The public landing page, in the style of the owner's Relay video (a dark page, one river of light
// from top to bottom, a live flow card, numbers that draw themselves as you scroll) and in
// UniVerse's two tones: dark blue and hot pink. Every claim on it is about what the product does; no
// invented usage numbers or quotes. UniVerse Impact is a home for several apps (src/lib/apps.ts): the
// tabs at the top pick one (the owner: "put the uni-versity and universe trace tab where user can
// switch to where they want to login"); the hero, the sections below and the sign-in buttons follow
// it. Sections: src/components/landing/.

const FAQ: Record<AppId | 'all', { q: string; a: string }[]> = {
  all: [
    { q: 'What is UniVerse Impact?', a: 'One account for five apps: school, products, help, climate and games. Messages and the assistant work in all of them.' },
    { q: 'Does it work on phones and in other languages?', a: 'Yes. It installs on any phone or computer and speaks 13 languages.' },
  ],
  campus: [
    { q: 'Is UniVersity free to use?', a: 'Yes, students never pay. Their school sets it up.' },
    { q: 'Who sets it up?', a: 'A school admin signs up and invites everyone. Each school sees only its own data.' },
    { q: 'How are credentials verified?', a: 'Each certificate has a public link that proves it is real.' },
  ],
  trace: [
    { q: 'What is UniVerse Trace?', a: 'A signed code on every product. Scan it to see it’s real. Try the sample: universeimpact.com/t/demo.' },
    { q: 'What does it cost?', a: 'Free for 10,000 products. Campaigns cost 5 cents per verified sale.' },
  ],
  relief: [
    { q: 'Who can use Relief?', a: 'Anyone. Requests show an area, never an address.' },
  ],
  play: [
    { q: 'Do I need friends online to play?', a: 'No. Every game works solo. For friends, share a room code.' },
    { q: 'Is it free?', a: 'Yes, all twelve games are free.' },
  ],
  green: [
    { q: 'How is the CO₂ saved worked out?', a: 'From published averages: a young tree takes up about 22 kg a year.' },
  ],
};

type Hero = { words: string[]; accent: string; text: string; note: string; card: React.ReactNode; extra?: React.ReactNode };
// The quiet links under the two main buttons (Get the app, Scan a sample).
const SMALL = 'inline-flex items-center gap-1.5 text-sm font-medium text-zinc-300 hover:text-white underline-offset-4 hover:underline';

const HERO: Record<AppId, Hero> = {
  campus: { words: ['The', 'school', 'day', 'runs'], accent: 'itself.', text: 'Classes, grades and messages in one calm place.', note: 'free for students', card: <CampusScene /> },
  trace: { words: ['Every', 'product', 'gets', 'a'], accent: 'passport.', text: 'Scan the code. See if it’s real.', note: 'free to start', card: <TraceScene />, extra: <Link href="/t/demo" className={SMALL}>Scan a sample</Link> },
  relief: { words: ['Help', 'that', 'reaches', 'people'], accent: 'fast.', text: 'Ask for help or offer it, on one live map.', note: 'free, always', card: <ReliefScene /> },
  play: { words: ['Games', 'that', 'teach'], accent: 'something.', text: 'Quick games that teach. Solo or with friends.', note: 'free · up to 8 in a room', card: <PlayScene /> },
  green: { words: ['Climate', 'action', 'you', 'can'], accent: 'prove.', text: 'Log what you do. See the CO₂ you save.', note: 'free for everyone', card: <GreenScene /> },
};

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
  const app = useChosenApp();
  const hero = HERO[app];
  const pick = (id: AppId) => { setChosenApp(id); window.history.replaceState(null, '', id === 'campus' ? '/' : `/?app=${id}`); };
  const router = useRouter();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [guide, setGuide] = useState(false);
  const { scrollYProgress, scrollY } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30 });
  // The hero picture drifts up a little slower than the page as you scroll (parallax).
  const sceneY = useSpring(useTransform(scrollY, [0, 800], [0, -90]), { stiffness: 120, damping: 26 });

  useEffect(() => {
    if (user) router.replace(homeFor(user));
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
    setGuide(true);
  };

  return (
    <MotionConfig reducedMotion="user">
      {/* Opened as the installed app (an older install whose start address is still "/"): go to
          the app's start (sign in, or your dashboard) instead of the website's landing page. */}
      <script dangerouslySetInnerHTML={{ __html: "if(window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone){location.replace('/app')}" }} />
      <div data-cursor-light className="mkt-smooth dark min-h-screen overflow-x-clip font-sans" style={{ backgroundColor: '#0b0b0c', color: '#ffffff' }}>
        <motion.div style={{ scaleX: progress }} className="fixed top-0 inset-x-0 h-[2px] origin-left z-[60] bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-pink-500" />
        {/* The page's two-tone glow and the river of light, behind everything below the hero. */}
        <div aria-hidden className="fixed inset-0 pointer-events-none z-0">
          {/* One river of light from the top of the page to the bottom: it pours in on arrival and
              bends in the gap between the hero's words and its card. */}
          <LightTrail tone="dark" hero className="opacity-70 lg:opacity-100" />
          <div className="mkt-drift-a absolute top-[30%] start-[-30%] w-[max(70vw,700px)] h-[max(70vw,700px)] rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(42,41,39,0.16), transparent)' }} />
          <div className="mkt-drift-b absolute bottom-[-25%] end-[-35%] w-[max(70vw,700px)] h-[max(70vw,700px)] rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(236,72,153,0.12), transparent)' }} />
        </div>

        <MarketingNav />

        {/* data-no-motion: this page has its own choreography (the site-wide reveals would hide its
            sections, and the typing and ticking parts would keep waking them). */}
        <main data-no-motion className="relative z-10">
          {/* ── Hero: the light pours through behind the words and the flow card ── */}
          <section data-no-motion className="relative min-h-[100svh] px-6 pt-32 md:pt-36 pb-20 overflow-hidden">
            <div className="relative max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
              <div>
                <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }} className="hidden sm:block font-mono text-xs text-zinc-300">
                  <Sparkles className="inline w-3.5 h-3.5 me-1.5 text-fuchsia-300" aria-hidden />UniVerse Impact · one account, apps that change something
                </motion.p>
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.08, ease: EASE }} className="mt-4">
                  <AppTabs value={app} onChange={pick} label="Choose an app" />
                </motion.div>
                <AnimatePresence mode="wait">
                  <motion.div key={app} initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -10, filter: 'blur(6px)', transition: { duration: 0.2 } }} transition={{ duration: 0.55, ease: EASE }}>
                    <h1 className="mt-8 text-5xl sm:text-6xl lg:text-7xl font-bold tracking-[-0.035em] leading-[1.02] text-white">
                      {hero.words.map((w, i) => (
                        <motion.span key={w + i} className="inline-block me-[0.25em]" initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.7, delay: 0.05 + i * 0.06, ease: EASE }}>{w}</motion.span>
                      ))}
                      <motion.span className="inline-block" initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.8, delay: 0.32, ease: EASE }}><Accent>{hero.accent}</Accent></motion.span>
                    </h1>
                    <p className="mt-6 text-lg text-zinc-300 max-w-md leading-relaxed">{hero.text}</p>
                    <div className="mt-9 flex flex-wrap items-center gap-3">
                      <Link href={`/register?app=${app}`} data-magnetic className={primary}>Get started <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></Link>
                      <Link href={`/login?app=${app}`} data-magnetic className={ghost}>Sign in</Link>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
                      <button type="button" onClick={handleInstallClick} className={SMALL}><Smartphone className="w-4 h-4" aria-hidden /> {installed ? 'Open the app' : 'Get the app'}</button>
                      {hero.extra}
                      <span className="font-mono text-xs text-zinc-400">{hero.note}</span>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
              <motion.div style={{ y: sceneY }}>
              <AnimatePresence mode="wait">
                <motion.div key={app} initial={{ opacity: 0, y: 40, rotateX: 12 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }} transition={{ duration: 0.9, ease: EASE }} style={{ transformPerspective: 1200 }} className="flex justify-center lg:justify-end">
                  <div data-tilt className="w-full flex justify-center lg:justify-end">{hero.card}</div>
                </motion.div>
              </AnimatePresence>
              </motion.div>
            </div>
          </section>

          <AnimatePresence mode="wait">
            <motion.div key={app} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} transition={{ duration: 0.4 }}>
              {app === 'campus' && <><Proof /><Glue /><Bento /><Statement /></>}
              {app === 'trace' && <><TraceSection /><MapsSection /><HowSection /><CampaignsSection /><PricingSection /></>}
              {app === 'relief' && <ReliefSection />}
              {app === 'green' && <GreenSection />}
              {app === 'play' && <PlaySection />}
            </motion.div>
          </AnimatePresence>

          <AppsGrid onPick={pick} />

          <section id="faq" className="px-6 py-24 scroll-mt-24">
            <div className="max-w-3xl mx-auto">
              <Reveal><Tag>faq</Tag></Reveal>
              <Reveal delay={0.05}><h2 className="mt-5 mb-8 text-4xl md:text-5xl font-bold tracking-tight text-white">Questions, <Accent>answered.</Accent></h2></Reveal>
              {[...FAQ.all, ...FAQ[app]].map((f, i) => <FaqItem key={f.q} {...f} i={i} />)}
            </div>
          </section>

          <SplitCta app={app} />
        </main>

        <MarketingFooter />
      </div>
      {guide && <InstallGuide onClose={() => setGuide(false)} />}
    </MotionConfig>
  );
}

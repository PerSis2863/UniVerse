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
import { appById, type AppId } from '@/lib/apps';
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
    { q: 'What is UniVerse Impact?', a: 'One account for several apps that each make a difference somewhere: UniVersity for schools and universities, UniVerse Trace for products, UniVerse Relief for getting help to people, and UniVerse Green for climate action. Messages, files, calls and the AI assistant work across all of them.' },
    { q: 'Does it work on phones and in other languages?', a: 'Yes. It installs as an app on iOS, Android and desktop, works on a patchy connection, and speaks 13 languages, including Arabic and Urdu, which read right to left.' },
  ],
  campus: [
    { q: 'Is UniVersity free to use?', a: 'Yes for students: they never pay. A school, university or NGO sets it up for its people, and everyone in it gets the student, teacher and admin portals, messaging, the NGO marketplace and verified credentials.' },
    { q: 'Who sets it up?', a: 'An admin at the school or organization signs up and invites teachers and students. Each school only ever sees its own people and data.' },
    { q: 'How are credentials verified?', a: 'Each certificate is fingerprinted and anchored on the Polygon blockchain. Anyone can open its public verification link to confirm it is genuine and unaltered.' },
  ],
  trace: [
    { q: 'What is UniVerse Trace?', a: 'A passport for every product. Each unit gets its own signed code. Buyers scan it to see it’s genuine; shops scan it to earn the brand’s points; the brand sees every scan on a live map, every shipment on the road and every likely copy. Try the sample: universeimpact.com/t/demo.' },
    { q: 'What does it cost?', a: 'Starting is free: 10,000 passports, the live maps, tracking, shop rewards and the wallet. Campaigns cost 5 cents per verified sale. PRO adds a million passports and your whole category on the map.' },
  ],
  relief: [
    { q: 'Who can use Relief?', a: 'Anyone with an account: people who need help, neighbours who can give it, and NGOs coordinating it. Requests show an area, never an exact address.' },
  ],
  play: [
    { q: 'Do I need friends online to play?', a: 'No. Every game has a solo mode against the clock and your own best. With friends, one person opens a room and shares its code or link; everyone plays the same rounds at the same time.' },
    { q: 'Is it free?', a: 'Yes. All twelve games, rooms of up to 8 and the leaderboards are free with a UniVerse account.' },
  ],
  green: [
    { q: 'How is the CO₂ saved worked out?', a: 'Each action uses a published average factor (for example, a young tree takes up about 22 kg of CO₂ a year; a kilometre by bike instead of by car saves about 0.2 kg). It’s an honest estimate, shown with the factor used.' },
  ],
};

type Hero = { words: string[]; accent: string; text: string; note: string; card: React.ReactNode; extra?: React.ReactNode };
const HERO: Record<AppId, Hero> = {
  campus: { words: ['The', 'school', 'day', 'runs'], accent: 'itself.', text: 'UniVerse unifies academics, collaboration and social impact, connecting students, universities and NGOs on one secure, AI-powered platform.', note: 'free for students / a school sets it up / no card', card: <CampusScene /> },
  trace: { words: ['Every', 'product', 'gets', 'a'], accent: 'passport.', text: 'One code on every unit. Buyers see it’s genuine, shops earn points for every sale, and you watch every product move on a live map, and catch every copy the day it appears.', note: 'for brands, shops, drivers and buyers / free to start', card: <TraceScene />, extra: <Link href="/t/demo" className={ghost}>Scan a sample</Link> },
  relief: { words: ['Help', 'that', 'reaches', 'people'], accent: 'fast.', text: 'People post what they need, neighbours and NGOs offer what they have, and a live map matches them: food, water, shelter, medicine or a lift to the clinic.', note: 'for people in need, volunteers and NGOs / free', card: <ReliefScene /> },
  play: { words: ['Games', 'that', 'teach'], accent: 'something.', text: 'Quiz battles and type races, spotting fakes and pinning the world map, flood rescues by helicopter and cleaning the ocean. Beat your best alone, or share a room code and race your friends live.', note: 'free / up to 8 in a room / phones and computers', card: <PlayScene /> },
  green: { words: ['Climate', 'action', 'you', 'can'], accent: 'prove.', text: 'Log trees planted, kilometres cycled and waste recycled, see the CO₂ saved, and beat a weekly challenge with your class, office or club.', note: 'for schools, companies and clubs / free', card: <GreenScene /> },
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
  const hero = HERO[app], meta = appById(app);
  const pick = (id: AppId) => { setChosenApp(id); window.history.replaceState(null, '', id === 'campus' ? '/' : `/?app=${id}`); };
  const router = useRouter();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30 });

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
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
    toast(isIOS ? '📱 How to install on iOS' : '💻 How to install', {
      description: isIOS
        ? 'Tap the Share icon at the bottom of Safari, then scroll down and tap "Add to Home Screen".'
        : 'Look for the install icon (usually a computer with a down arrow) in your address bar to install the app.',
      duration: 10000,
      style: { background: '#2a2927', color: 'white', border: 'none' },
    });
  };

  return (
    <MotionConfig reducedMotion="user">
      {/* Opened as the installed app (an older install whose start address is still "/"): go to
          the app's start (sign in, or your dashboard) instead of the website's landing page. */}
      <script dangerouslySetInnerHTML={{ __html: "if(window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone){location.replace('/app')}" }} />
      <div className="mkt-smooth dark min-h-screen overflow-x-clip font-sans" style={{ backgroundColor: '#0b0b0c', color: '#ffffff' }}>
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
            <div className="relative max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
              <div>
                <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }} className="font-mono text-xs text-zinc-300">
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
                      <Link href={`/register?app=${app}`} className={primary}>Get started with {meta.name.replace('UniVerse ', '')} <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></Link>
                      <Link href={`/login?app=${app}`} className={ghost}>Sign in</Link>
                      {hero.extra}
                      <button type="button" onClick={handleInstallClick} className={ghost}><Smartphone className="w-4 h-4" /> {installed ? 'Open the app' : 'Get the app'}</button>
                    </div>
                    <p className="mt-5 font-mono text-xs text-zinc-400">{hero.note}</p>
                  </motion.div>
                </AnimatePresence>
              </div>
              <AnimatePresence mode="wait">
                <motion.div key={app} initial={{ opacity: 0, y: 40, rotateX: 12 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }} transition={{ duration: 0.9, ease: EASE }} style={{ transformPerspective: 1200 }} className="flex justify-center lg:justify-end">
                  {hero.card}
                </motion.div>
              </AnimatePresence>
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
    </MotionConfig>
  );
}

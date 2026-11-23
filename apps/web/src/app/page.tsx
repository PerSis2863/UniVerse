'use client';

import Link from '@/components/ui/Link';
import { InstallGuide } from '@/components/pwa/InstallGuide';
import { Activity, Fragment, Suspense, useDeferredValue, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, MotionConfig, m as motion } from 'framer-motion';
import { ArrowRight, ChevronDown, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { AppBackdrop } from '@/components/AppBackdrop';
import dynamic from 'next/dynamic';
import { CampusScene } from '@/components/landing/HeroScenes';
import { Proof } from '@/components/landing/Proof';
import { Glue } from '@/components/landing/Glue';
import { Bento } from '@/components/landing/Bento';
import { Statement } from '@/components/landing/Statement';
import { AppTabs } from '@/components/landing/AppTabs';
import { AppsGrid, ReliefSection } from '@/components/landing/ImpactApps';
import { SplitCta } from '@/components/landing/SplitCta';
import { LiveTotals } from '@/components/landing/LiveTotals';
import { WorldSection } from '@/components/landing/WorldSection';
import { Accent, EASE, Live, Motion, Reveal, ghost, primary } from '@/components/landing/bits';
import type { AppId } from '@/lib/apps';
import { setChosenApp, useChosenApp } from '@/lib/chosen-app';
import { homeFor } from '@/lib/role-home';
import { cn } from '@/lib/utils';

// M117: the four Lab apps' hero pictures and sections load when their tab is first opened, not with
// the page (most visitors stay on UniVersity's tab). A picture keeps its place while it loads.
const scene = () => <div className="h-[480px] w-full max-w-[520px]" />;
const TraceScene = dynamic(() => import('@/components/landing/HeroScenesLab').then((m) => m.TraceScene), { loading: scene });
const ReliefScene = dynamic(() => import('@/components/landing/HeroScenesLab').then((m) => m.ReliefScene), { loading: scene });
const TravelScene = dynamic(() => import('@/components/landing/HeroScenesLab').then((m) => m.TravelScene), { loading: scene });
const LabScene = dynamic(() => import('@/components/landing/HeroScenesLab').then((m) => m.LabScene), { loading: scene });
const TraceSection = dynamic(() => import('@/components/landing/TraceSection').then((m) => m.TraceSection));
const MapsSection = dynamic(() => import('@/components/landing/Business').then((m) => m.MapsSection));
const HowSection = dynamic(() => import('@/components/landing/Business').then((m) => m.HowSection));
const CampaignsSection = dynamic(() => import('@/components/landing/Business').then((m) => m.CampaignsSection));
const PricingSection = dynamic(() => import('@/components/landing/Business').then((m) => m.PricingSection));
const ReliefMore = dynamic(() => import('@/components/landing/ImpactMore').then((m) => m.ReliefMore));
/** M130: the other apps' parts start loading when the pointer or focus reaches the tabs, so the first
 *  switch to an app doesn't wait for (and stall on) its code. */
// M211: only the code of the app pointed at (all of it at once was a long task on a slow phone).
const warmApp = (id: AppId) => {
  if (id === 'campus') return;
  void import('@/components/landing/HeroScenesLab');
  if (id === 'trace') { void import('@/components/landing/TraceSection'); void import('@/components/landing/Business'); } else void import('@/components/landing/ImpactMore');
};

// The public landing page, in the style of the owner's Relay video (a dark page, a live flow card,
// numbers that draw themselves as you scroll; behind it the chosen app's own scene, M129) and in
// the M91 look (black and white, pink as the one accent); UniVersity's home pictured under its hero
// (M116), then the planet section. Every claim on it is about what the product does; no
// invented usage numbers or quotes. UniVerse Impact is a home for several apps (src/lib/apps.ts): the
// tabs at the top pick one (the owner: "put the uni-versity and universe trace tab where user can
// switch to where they want to login"); the hero, the sections below and the sign-in buttons follow
// it. Sections: src/components/landing/.

const FAQ: Record<AppId | 'all', { q: string; a: string }[]> = {
  all: [
    { q: 'What is UniVerse Impact?', a: 'UniVersity, a calm place for a school’s classes, grades and messages, plus four newer apps for products, help, climate and games. One account opens them all.' },
    { q: 'What does Lab mean?', a: 'A new app that is still finding its first people. It works; expect it to change.' },
    { q: 'Does it work on phones and in other languages?', a: 'Yes. It installs on any phone or computer and speaks 8 languages.' },
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
  lab: [
    { q: 'Is it MATLAB?', a: 'No. Hyperion is our own engine that understands the same kind of code (matrices, plot, ode45 and more), so most student scripts run as they are.' },
    { q: 'Can I use the figures in a report?', a: 'Yes: save any figure as a picture, or as LaTeX code for papers and theses.' },
  ],
  travel: [
    { q: 'Where do the guides come from?', a: 'From Wikivoyage, written by travellers: every place with its address, hours and prices.' },
    { q: 'Can I book through UniVerse?', a: 'Stays, flights and tours open on our partners’ sites with your place and dates filled in.' },
  ],
};

type Hero = { words: string[]; accent: string; text: string; note: string; card: React.ReactNode; extra?: React.ReactNode };
// The quiet links under the two main buttons (Get the app, Scan a sample).
// The hero's two buttons, a size up to sit under the bigger headline (M116).
const HERO_BTN = 'h-12 px-6 text-[15px]';
/** The hero's CSS entrance (`.hero-in`), a step later for each part (M117). */
const rise = (delay: number, duration = 600): React.CSSProperties => ({ animationDelay: `${delay}ms`, animationDuration: `${duration}ms` });
const SMALL = 'inline-flex items-center gap-1.5 text-sm font-medium text-zinc-300 hover:text-white underline-offset-4 hover:underline';

const HERO: Record<AppId, Hero> = {
  campus: { words: ['The', 'school', 'day', 'runs'], accent: 'itself.', text: 'Classes, grades and messages in one calm place.', note: 'free for students', card: <CampusScene /> },
  trace: { words: ['Every', 'product', 'gets', 'a'], accent: 'passport.', text: 'Scan the code. See if it’s real.', note: 'free to start', card: <TraceScene />, extra: <Link href="/t/demo" className={SMALL}>Scan a sample</Link> },
  relief: { words: ['Help', 'that', 'reaches', 'people'], accent: 'fast.', text: 'Ask for help or offer it, on one live map.', note: 'free, always', card: <ReliefScene /> },
  travel: { words: ['Plan', 'trips'], accent: 'anywhere.', text: 'Where to go, eat and sleep, planned day by day.', note: 'free · plan with friends', card: <TravelScene /> },
  lab: { words: ['Maths,', 'matrices', 'and'], accent: 'plots.', text: 'Run MATLAB-style code in your browser, or download Hyperion for your computer.', note: 'free · no install needed', card: <LabScene /> },
};

function FaqItem({ q, a, i }: { q: string; a: string; i: number }) {
  const [open, setOpen] = useState(i === 0);
  return (
    <Reveal delay={i * 0.04}>
      <div className="border-b border-white/[0.07]">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center justify-between gap-6 py-6 text-start">
          <span className="font-semibold text-lg text-white">{q}</span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2, ease: EASE }} className="shrink-0 w-8 h-8 rounded-full border border-white/10 flex items-center justify-center">
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          </motion.span>
        </button>
        {/* The answer fades in (transform and opacity, under 300 ms) and closes at once; animating
            its height would lay the page out again on every frame (§8). */}
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: EASE }}>
            <p className="pb-6 text-zinc-400 leading-relaxed max-w-3xl">{a}</p>
          </motion.div>
        )}
      </div>
    </Reveal>
  );
}

/** Chrome's beforeinstallprompt event (not in the DOM types). */
type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

/** M221: an app's sections on the landing, built ahead while hidden (M137, React's Activity). Its own Suspense
 *  boundary catches a part still downloading: without it the hidden Activity did, and when the visitor moved on to
 *  another tab before the download ended, the dropped Activity made React crash on its arrival ("null is not an
 *  object (evaluating 'e.stateNode._retryCache')", the live error log, 16 Nov). */
function AppPart({ shown, children }: { shown: boolean; children: React.ReactNode }) {
  return <Activity mode={shown ? 'visible' : 'hidden'}><Suspense fallback={null}><div className="app-in">{children}</div></Suspense></Activity>;
}

export default function ShowcasePage() {
  const { user } = useAuthStore();
  const app = useChosenApp();
  const hero = HERO[app];
  // M130: a tab switch changes the words, the tabs and the scene behind at once; the hero's picture
  // and everything below follow a moment later in a render React can pause between frames (it was
  // all one 120 ms frame: the page's own content, rebuilt for the new app).
  const later = useDeferredValue(app);
  // M137: the visitor reached for the app tabs: build the other apps' sections ahead (below).
  // M211: just the app whose tab is pointed at or focused is built ahead (building all five hidden at
  // once froze a slow phone for half a second).
  const [warm, setWarm] = useState<AppId | null>(null);
  const warmAt = (e: React.SyntheticEvent) => {
    const id = (e.target as Element).closest('[data-uv-app]')?.getAttribute('data-uv-app') as AppId | null;
    if (id && id !== warm) { warmApp(id); setWarm(id); }
  };
  const pick = (id: AppId) => { setChosenApp(id); window.history.replaceState(null, '', id === 'campus' ? '/' : `/?app=${id}`); };
  const router = useRouter();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [guide, setGuide] = useState(false);
  // The hero picture drifts up a little slower than the page as you scroll (parallax): `.hero-drift`, M133.

  // M225: smooth jumps to the page's sections (#faq…) while the landing is open (globals.css html.mkt-smooth-root).
  useEffect(() => { const h = document.documentElement; h.classList.add('mkt-smooth-root'); return () => h.classList.remove('mkt-smooth-root'); }, []);

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
      <div data-cursor-light className="mkt-smooth flip-light min-h-screen overflow-x-clip font-sans bg-[var(--background)] text-white">
        {/* M133: tied to the scroll in CSS (`.scroll-progress`), on the compositor. */}
        <div aria-hidden className="scroll-progress fixed top-0 inset-x-0 h-[2px] z-[60] bg-gradient-to-r from-aqua-300 via-pink-400 to-pink-500" />
        {/* Behind everything: the chosen app's own scene (M129), fading to the next when a tab is picked. */}
        <div aria-hidden className="fixed inset-0 pointer-events-none z-0">
          <AppBackdrop own app={app} />
        </div>

        <MarketingNav />

        {/* data-no-motion: this page has its own choreography (the site-wide reveals would hide its
            sections, and the typing and ticking parts would keep waking them). */}
        <main data-no-motion className="relative z-10">
          {/* ── Hero: the light pours through behind the words and the flow card ── */}
          <section data-no-motion className="horizon relative min-h-[100svh] lg:min-h-[calc(100svh-9rem)] px-6 pt-32 md:pt-36 pb-6 lg:pb-20 overflow-hidden">
            <div className="relative max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
              <div>
                {/* M117: the hero arrives with CSS (`.hero-in`), so it shows as soon as the page does. With
                    framer's `initial` the server sent it at opacity 0 and it waited for all the page's
                    script: about 4 s on a budget phone over slow mobile data. Tab switches still glide
                    with framer (AnimatePresence `initial={false}` only skips the first render). */}
                <div className="hero-in" style={rise(40)}>
                  <div onPointerOver={warmAt} onFocus={warmAt}><AppTabs value={app} onChange={pick} label="Choose an app" /></div>
                </div>
                <AnimatePresence mode="wait" initial={false}>
                  {/* Transform and opacity only (§8: a blur filter repaints every frame), as one `transform`
                    so the compositor runs it (framer's x / y run on the page's thread, M130). */}
                  <motion.div key={app} initial={{ opacity: 0, transform: 'translateY(14px)' }} animate={{ opacity: 1, transform: 'translateY(0px)' }} exit={{ opacity: 0, transform: 'translateY(-8px)', transition: { duration: 0.15 } }} transition={{ duration: 0.45, ease: EASE }}>
                    {/* M116: bigger (the owner: "really big"); the text shadow keeps it readable over the
                        app's scene on a phone (one column, the scene right behind the words). */}
                    <h1 className="mt-8 text-[3.25rem] sm:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-[-0.04em] leading-[0.98] text-white max-lg:dark:[text-shadow:0_2px_22px_rgba(12,13,16,0.85)]">
                      {/* A real space after each word (not a margin): screen readers, search engines and
                          copy-paste read "The school day…", not "Theschoolday…". */}
                      {hero.words.map((w, i) => (
                        <Fragment key={w + i}><span className="hero-in inline-block" style={rise(60 + i * 50)}>{w}</span>{' '}</Fragment>
                      ))}
                      <span className="hero-in inline-block" style={rise(60 + hero.words.length * 50)}><Accent>{hero.accent}</Accent></span>
                    </h1>
                    <p className="hero-in mt-6 text-lg sm:text-xl text-zinc-300 max-w-md leading-relaxed max-lg:dark:[text-shadow:0_1px_14px_rgba(12,13,16,0.9)]" style={rise(320)}>{hero.text}</p>
                    <div className="hero-in mt-9 flex flex-wrap items-center gap-3" style={rise(380)}>
                      <Link href={`/register?app=${app}`} data-magnetic className={cn(primary, HERO_BTN)}>Get started <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></Link>
                      <Link href={`/login?app=${app}`} data-magnetic className={cn(ghost, HERO_BTN)}>Sign in</Link>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
                      <button type="button" onClick={handleInstallClick} className={SMALL}><Smartphone className="w-4 h-4" aria-hidden /> {installed ? 'Open the app' : 'Get the app'}</button>
                      {hero.extra}
                      <span className="text-xs text-zinc-400">{hero.note}</span>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className="hero-in" style={rise(200, 800)}><Live><div className="hero-drift">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={later} initial={{ opacity: 0, transform: 'translateY(40px) rotateX(12deg)' }} animate={{ opacity: 1, transform: 'translateY(0px) rotateX(0deg)' }} exit={{ opacity: 0, transform: 'translateY(-20px) rotateX(0deg)', transition: { duration: 0.2 } }} transition={{ duration: 0.9, ease: EASE }} style={{ transformPerspective: 1200 }} className="flex justify-center lg:justify-end">
                  {/* The scene animates itself all the time: the page-wide motion layer leaves it alone (M211). */}
                  <div data-tilt data-no-motion className="w-full flex justify-center lg:justify-end">{HERO[later].card}</div>
                </motion.div>
              </AnimatePresence>
              </div></Live></div>
            </div>
          </section>

          {/* M223 (the owner, 16 Nov: "remove this from the main page"): no picture of UniVersity's home under the
              hero any more (M116's ProductWindow). */}
          <WorldSection app={later} onShow={pick} />
          <LiveTotals />

          {/* M137: each app's sections. Once the visitor reaches for an app's tab (`warm`, M211: that one only), its
              sections are built ahead, hidden (React's Activity: no effects, no loops while hidden), so the
              first switch to an app shows them at once instead of building them in that frame. Each part's
              looping demos run only while it is on screen (Live); each section arrives its own way (M63,
              bits.tsx `Motion`); `.app-in` fades a newly shown app in (AppPart). */}
          {(warm === 'campus' || later === 'campus') && <AppPart shown={later === 'campus'}><Motion kind="fan"><Proof /></Motion><Motion kind="sweep"><Glue /></Motion><Motion kind="tilt"><Live><Bento /></Live></Motion><Motion kind="mask"><Live><Statement /></Live></Motion></AppPart>}
          {(warm === 'trace' || later === 'trace') && <AppPart shown={later === 'trace'}><Motion kind="scrub"><TraceSection /></Motion><Motion kind="depth"><Live><MapsSection /></Live></Motion><Motion kind="sweep"><HowSection /></Motion><Motion kind="tilt"><CampaignsSection /></Motion><Motion kind="fan"><PricingSection /></Motion></AppPart>}
          {(warm === 'relief' || later === 'relief') && <AppPart shown={later === 'relief'}><Motion kind="scrub"><ReliefSection /></Motion><Motion kind="tilt"><Live><ReliefMore /></Live></Motion></AppPart>}

          <Motion kind="fan"><AppsGrid onPick={pick} /></Motion>

          <section id="faq" className="px-6 py-24 scroll-mt-24">
            <div className="max-w-3xl mx-auto">
              <Reveal delay={0.05}><h2 className="mt-5 mb-8 text-4xl md:text-5xl font-bold tracking-tight text-white">Questions, <Accent>answered.</Accent></h2></Reveal>
              {[...FAQ.all, ...FAQ[later]].map((f, i) => <FaqItem key={f.q} {...f} i={i} />)}
            </div>
          </section>

          <SplitCta app={later} />
        </main>

        <MarketingFooter />
      </div>
      {guide && <InstallGuide onClose={() => setGuide(false)} />}
    </MotionConfig>
  );
}

'use client';

import Link from '@/components/ui/Link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AnimatePresence, MotionConfig, m as motion, useMotionTemplate, useMotionValue, useScroll, useSpring, useTransform,
} from 'framer-motion';
import {
  ArrowRight, BadgeCheck, BarChart3, Bell, BookOpen, Brain, Building2, CalendarDays, Check, ChevronDown,
  CreditCard, GraduationCap, HeartHandshake, KeyRound, Link2, Lock, MessagesSquare, ShieldCheck, Smartphone,
  Sparkles, Users, WifiOff, Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';

const EASE = [0.22, 1, 0.36, 1] as const;

const ROTATING = ['students', 'universities', 'NGOs', 'changemakers'];

// Real platform capabilities — shown where the old (unverified) usage numbers used to be.
const CAPABILITIES = [
  { icon: BadgeCheck, title: 'Blockchain-verified', desc: 'Credentials anchored on Polygon, checkable by anyone.', tint: 'from-indigo-500/20' },
  { icon: Brain, title: 'AI-powered', desc: 'Gemini-driven study help and project matching.', tint: 'from-fuchsia-500/20' },
  { icon: MessagesSquare, title: 'Real-time', desc: 'Live chat, groups and instant notifications.', tint: 'from-cyan-500/20' },
  { icon: Smartphone, title: 'Install anywhere', desc: 'One app for iOS, Android and desktop — works offline.', tint: 'from-emerald-500/20' },
];

const SOLUTIONS = {
  students: {
    label: 'Students', icon: GraduationCap,
    headline: 'Your whole academic life — and your impact — in one place.',
    points: ['Courses, grades, attendance and timetable at a glance', 'Apply to NGO projects and internships that match your skills', 'Earn verifiable credentials that employers can check instantly', 'An AI study assistant that is available 24/7'],
  },
  universities: {
    label: 'Universities', icon: Building2,
    headline: 'Run campus operations and prove your social impact.',
    points: ['Student, teacher and admin portals out of the box', 'Manage courses, rooms, timetables, finances and announcements', 'Track engagement and impact with advanced analytics (Pro)', 'Export everything to CSV for accreditation and reporting (Pro)'],
  },
  ngos: {
    label: 'NGOs & organizations', icon: HeartHandshake,
    headline: 'Reach motivated student talent for the work that matters.',
    points: ['Publish projects to a marketplace of skilled students', 'Review applications and track project progress', 'Issue tamper-proof certificates for completed work', 'AI-written executive impact reports for your board (Enterprise)'],
  },
} as const;

const BENTO = [
  { icon: BarChart3, title: 'Intelligent dashboards', desc: 'Every role gets a live overview of what matters today — deadlines, grades, attendance, applications.', span: 'md:col-span-2' },
  { icon: Link2, title: 'Verifiable credentials', desc: 'Certificates are hashed and anchored on-chain, with a public verify page.', span: '' },
  { icon: CalendarDays, title: 'Timetable & rooms', desc: 'Schedules, room bookings and calendar in sync.', span: '' },
  { icon: Wand2, title: 'AI impact reports', desc: 'Turn live platform data into a board-ready executive summary in seconds.', span: 'md:col-span-2', premium: true },
  { icon: Users, title: 'Groups & communities', desc: 'Study groups, associations and campus life, all connected.', span: '' },
  { icon: CreditCard, title: 'Payments built in', desc: 'Tuition and fees paid securely through Stripe, with receipts.', span: '' },
  { icon: WifiOff, title: 'Offline-ready', desc: 'Installable PWA that keeps working on a patchy connection.', span: '' },
];

const SECURITY = [
  { icon: KeyRound, title: 'Secure sign-in', desc: 'Authentication powered by Firebase, with expiring tokens verified on every request.' },
  { icon: Lock, title: 'Role-based access', desc: 'Students, teachers and admins only ever see what their role allows.' },
  { icon: CreditCard, title: 'PCI-compliant payments', desc: 'Card details go straight to Stripe — they never touch our servers.' },
  { icon: ShieldCheck, title: 'Tamper-proof records', desc: 'Credentials are anchored on a public blockchain, so they cannot be forged.' },
];

const FAQ = [
  { q: 'Is UniVerse free to use?', a: 'Yes. The Starter plan is free forever and includes the full student, teacher and admin portals, the NGO marketplace, messaging and verified credentials. Organizations upgrade only when they want premium analytics, exports or AI reporting.' },
  { q: 'How does an organization upgrade?', a: 'Admins see the plans in Billing & Plans inside the admin portal. Pro can be started there with a 14-day free trial; Enterprise is tailored to each institution, so admins contact our team from the same page for a quote.' },
  { q: 'Can we switch plans or cancel later?', a: 'Any time. Admins manage their subscription, payment method and invoices from Billing & Plans inside the admin dashboard.' },
  { q: 'Who pays — students or organizations?', a: 'Organizations. Students never pay to use UniVerse. Premium plans are purchased by a university, NGO or company admin for their organization.' },
  { q: 'How are credentials verified?', a: 'Each certificate is fingerprinted and anchored on the Polygon blockchain. Anyone can open its public verification link to confirm it is genuine and unaltered.' },
  { q: 'Do you offer custom contracts or invoicing?', a: 'Yes — Enterprise customers can request invoiced billing. Email us and we will get back to you.' },
];

/* ─────────────────────────── Small building blocks ─────────────────────────── */

function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.8, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SectionHeading({ eyebrow, title, sub }: { eyebrow: string; title: React.ReactNode; sub?: string }) {
  return (
    <Reveal className="text-center max-w-3xl mx-auto mb-14">
      <span className="inline-block text-xs font-bold uppercase tracking-[0.2em] text-indigo-400 mb-4">{eyebrow}</span>
      <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-[1.1]">{title}</h2>
      {sub && <p className="text-zinc-400 text-lg mt-5 leading-relaxed">{sub}</p>}
    </Reveal>
  );
}

/** Card with a soft spotlight that follows the cursor. */
function SpotlightCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const x = useMotionValue(-200);
  const y = useMotionValue(-200);
  const bg = useMotionTemplate`radial-gradient(360px circle at ${x}px ${y}px, rgba(129,140,248,0.14), transparent 70%)`;
  return (
    <motion.div
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set(e.clientX - r.left);
        y.set(e.clientY - r.top);
      }}
      onMouseLeave={() => { x.set(-200); y.set(-200); }}
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={`group relative overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.025] ${className}`}
    >
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: bg }} />
      <div className="relative h-full">{children}</div>
    </motion.div>
  );
}

function RotatingWord() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % ROTATING.length), 2400);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="relative inline-grid align-bottom overflow-hidden pb-1">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={ROTATING[i]}
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{ duration: 0.55, ease: EASE }}
          className="col-start-1 row-start-1 bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent"
        >
          {ROTATING[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Illustrative product preview (not real data) — clearly a UI mock, no usage claims. */
function ProductPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const rotateX = useSpring(useTransform(scrollYProgress, [0, 0.45], [22, 0]), { stiffness: 120, damping: 24 });
  const scale = useSpring(useTransform(scrollYProgress, [0, 0.45], [0.9, 1]), { stiffness: 120, damping: 24 });

  return (
    <div ref={ref} className="relative mx-auto max-w-5xl [perspective:1400px]">
      <div aria-hidden className="absolute -inset-x-24 -top-40 -bottom-16 pointer-events-none" style={{ background: 'radial-gradient(ellipse 55% 45% at 50% 45%, rgba(99,102,241,0.30), rgba(217,70,239,0.10) 55%, transparent 80%)' }} />
      <motion.div style={{ rotateX, scale }} className="relative origin-top rounded-[1.75rem] border border-white/10 bg-[#0f141c]/90 backdrop-blur-xl shadow-[0_40px_120px_-20px_rgba(79,70,229,0.45)] overflow-hidden">
        {/* window chrome */}
        <div className="flex items-center gap-2 px-4 h-11 border-b border-white/[0.06]">
          <span className="w-3 h-3 rounded-full bg-[#ff5f57]" /><span className="w-3 h-3 rounded-full bg-[#febc2e]" /><span className="w-3 h-3 rounded-full bg-[#28c840]" />
          <div className="mx-auto h-6 w-60 max-w-[50%] rounded-md bg-white/[0.05] text-[10px] text-zinc-500 flex items-center justify-center">app.universe · dashboard</div>
        </div>
        <div className="grid grid-cols-[56px_1fr] sm:grid-cols-[180px_1fr] min-h-[320px] sm:min-h-[400px]">
          <aside className="border-r border-white/[0.06] p-3 space-y-1.5">
            {[BarChart3, BookOpen, HeartHandshake, MessagesSquare, BadgeCheck, CalendarDays].map((Icon, i) => (
              <div key={i} className={`flex items-center gap-2.5 h-9 px-2.5 rounded-lg ${i === 0 ? 'bg-indigo-500/15 text-indigo-300' : 'text-zinc-500'}`}>
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden sm:block h-2 rounded-full bg-current opacity-40" style={{ width: `${50 + ((i * 17) % 40)}%` }} />
              </div>
            ))}
          </aside>
          <div className="p-4 sm:p-6 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {['from-indigo-500', 'from-fuchsia-500', 'from-emerald-500'].map((c, i) => (
                <motion.div key={c} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 + i * 0.1 }} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 sm:p-4">
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${c} to-transparent mb-3`} />
                  <div className="h-2 w-1/2 rounded-full bg-white/20 mb-2" />
                  <div className="h-2 w-3/4 rounded-full bg-white/10" />
                </motion.div>
              ))}
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 h-40 sm:h-52 flex items-end gap-1.5 sm:gap-2">
              {[38, 52, 44, 63, 58, 72, 66, 80, 74, 88, 83, 95].map((h, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  whileInView={{ height: `${h}%` }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4 + i * 0.05, duration: 0.8, ease: EASE }}
                  className="flex-1 rounded-t-[4px] bg-gradient-to-t from-indigo-600/60 to-fuchsia-400/80"
                />
              ))}
            </div>
          </div>
        </div>
      </motion.div>
      {/* floating chips */}
      <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.8, ease: EASE }} className="hidden md:block absolute -left-10 top-1/3"><div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-[#111722]/90 backdrop-blur-xl px-4 py-3 shadow-2xl mkt-float">
        <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center"><BadgeCheck className="w-4 h-4 text-emerald-400" /></div>
        <div><div className="text-xs font-bold text-white">Credential verified</div><div className="text-[10px] text-zinc-500">Anchored on Polygon</div></div>
      </div></motion.div>
      <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 1, ease: EASE }} className="hidden md:block absolute -right-8 bottom-16"><div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-[#111722]/90 backdrop-blur-xl px-4 py-3 shadow-2xl mkt-float [animation-delay:1.5s]">
        <div className="w-8 h-8 rounded-full bg-fuchsia-500/15 flex items-center justify-center"><Sparkles className="w-4 h-4 text-fuchsia-400" /></div>
        <div><div className="text-xs font-bold text-white">AI match found</div><div className="text-[10px] text-zinc-500">Projects that fit your skills</div></div>
      </div></motion.div>
    </div>
  );
}

function Solutions() {
  const [tab, setTab] = useState<keyof typeof SOLUTIONS>('students');
  const s = SOLUTIONS[tab];
  return (
    <div className="max-w-5xl mx-auto">
      <Reveal className="flex justify-center mb-10">
        <div className="inline-flex flex-wrap justify-center p-1.5 rounded-full border border-white/[0.08] bg-white/[0.03]">
          {(Object.keys(SOLUTIONS) as (keyof typeof SOLUTIONS)[]).map((k) => {
            const Icon = SOLUTIONS[k].icon;
            return (
              <button key={k} onClick={() => setTab(k)} className={`relative px-4 sm:px-5 py-2.5 rounded-full text-sm font-bold inline-flex items-center gap-2 transition-colors ${tab === k ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>
                {tab === k && <motion.span layoutId="solution-pill" className="absolute inset-0 -z-0 rounded-full bg-gradient-to-r from-indigo-600 to-fuchsia-600" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                <Icon className="relative w-4 h-4" /><span className="relative">{SOLUTIONS[k].label}</span>
              </button>
            );
          })}
        </div>
      </Reveal>
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="grid md:grid-cols-2 gap-10 items-center rounded-[2rem] border border-white/[0.07] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-8 md:p-12"
        >
          <h3 className="text-2xl md:text-3xl font-black leading-tight">{s.headline}</h3>
          <ul className="space-y-4">
            {s.points.map((p, i) => (
              <motion.li key={p} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.07, ease: EASE }} className="flex gap-3 text-zinc-300">
                <span className="mt-0.5 w-5 h-5 rounded-full bg-indigo-500/15 flex items-center justify-center shrink-0"><Check className="w-3 h-3 text-indigo-300" strokeWidth={3} /></span>
                {p}
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function FaqItem({ q, a, i }: { q: string; a: string; i: number }) {
  const [open, setOpen] = useState(i === 0);
  return (
    <Reveal delay={i * 0.04}>
      <div className="border-b border-white/[0.07]">
        <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-6 py-6 text-left">
          <span className="font-bold text-lg text-white">{q}</span>
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

/* ─────────────────────────────────── Page ─────────────────────────────────── */

export default function ShowcasePage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30 });
  const heroY = useTransform(scrollYProgress, [0, 0.2], [0, -60]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0.3]);

  useEffect(() => {
    if (user) router.push(`/${user.role.toLowerCase() || 'student'}`);
  }, [user, router]);

  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e); };
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
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
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
      <div className="dark min-h-screen overflow-x-clip font-sans scroll-smooth" style={{ backgroundColor: '#0a0d13', color: '#ffffff' }}>
        {/* scroll progress */}
        <motion.div style={{ scaleX: progress }} className="fixed top-0 inset-x-0 h-[2px] origin-left z-[60] bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-pink-500" />

        {/* ambient background */}
        <div aria-hidden className="fixed inset-0 pointer-events-none z-0">
          <motion.div animate={{ x: [0, 40, 0], y: [0, -30, 0] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }} className="absolute top-[-20%] left-[-35%] w-[max(80vw,760px)] h-[max(80vw,760px)] rounded-full will-change-transform" style={{ background: 'radial-gradient(closest-side, rgba(79,70,229,0.26), transparent)' }} />
          <motion.div animate={{ x: [0, -40, 0], y: [0, 30, 0] }} transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }} className="absolute bottom-[-25%] right-[-40%] w-[max(75vw,720px)] h-[max(75vw,720px)] rounded-full will-change-transform" style={{ background: 'radial-gradient(closest-side, rgba(192,38,211,0.17), transparent)' }} />
          <div className="absolute inset-0 opacity-[0.035]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)', backgroundSize: '64px 64px', maskImage: 'radial-gradient(ellipse at top, black 20%, transparent 70%)', WebkitMaskImage: 'radial-gradient(ellipse at top, black 20%, transparent 70%)' }} />
        </div>

        <MarketingNav />

        <main className="relative z-10">
          {/* ── Hero ─────────────────────────────────────────── */}
          <section className="px-6 pt-36 md:pt-44 pb-16">
            <motion.div style={{ y: heroY, opacity: heroOpacity }} className="max-w-5xl mx-auto flex flex-col items-center text-center">
              <a
                href="#product"
                style={{ animationDelay: '0ms' }}
                className="hero-in group inline-flex items-center gap-2 pl-1.5 pr-4 py-1.5 rounded-full text-xs font-semibold border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] transition-colors mb-8"
              >
                <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white text-[10px] font-black uppercase tracking-wider">New</span>
                <span className="text-zinc-300">Live whiteboards: draw together with your class</span>
                <ArrowRight className="w-3 h-3 text-zinc-500 group-hover:translate-x-0.5 transition-transform" />
              </a>

              <h1
                style={{ animationDelay: '80ms' }}
                className="hero-in text-[2.75rem] leading-[1.05] sm:text-6xl md:text-7xl lg:text-[5.25rem] font-black tracking-[-0.035em]"
              >
                The impact platform
                <br />
                for <RotatingWord />
              </h1>

              <p
                style={{ animationDelay: '180ms' }}
                className="hero-in mt-7 text-lg md:text-xl text-zinc-400 max-w-2xl leading-relaxed"
              >
                UniVerse unifies academics, collaboration and social impact — connecting students,
                universities and NGOs on one secure, AI-powered platform.
              </p>

              <div
                style={{ animationDelay: '280ms' }}
                className="hero-in mt-10 flex flex-wrap items-center justify-center gap-3"
              >
                <Link href="/register" className="group relative inline-flex items-center gap-2 h-14 px-8 rounded-full bg-white text-zinc-900 font-bold text-sm overflow-hidden shadow-[0_0_40px_-8px_rgba(129,140,248,0.7)] hover:shadow-[0_0_60px_-6px_rgba(129,140,248,0.9)] transition-shadow">
                  <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-indigo-200/60 to-transparent" />
                  <span className="relative">Get started free</span>
                  <ArrowRight className="relative w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <a href="#product" className="inline-flex items-center gap-2 h-14 px-8 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white font-bold text-sm transition-colors">
                  Explore features
                </a>
                <button onClick={handleInstallClick} className="inline-flex items-center gap-2 h-14 px-6 rounded-full text-zinc-300 hover:text-white font-semibold text-sm transition-colors">
                  <Smartphone className="w-4 h-4" /> {installed ? 'Open app' : 'Download app'}
                </button>
              </div>

              <p style={{ animationDelay: '400ms' }} className="hero-in mt-6 text-xs text-zinc-500">
                Free for students, forever · Premium plans for organizations · 14-day free trial
              </p>
            </motion.div>
          </section>

          {/* ── Product preview ─────────────────────────────── */}
          <section id="product" className="px-6 pb-24 scroll-mt-24">
            <ProductPreview />
          </section>

          {/* ── Capabilities (replaces the old stat numbers) ───── */}
          <section className="px-6 pb-32">
            <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {CAPABILITIES.map((c, i) => (
                <Reveal key={c.title} delay={i * 0.08}>
                  <SpotlightCard className="p-6 h-full">
                    <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${c.tint} to-transparent border border-white/[0.08] flex items-center justify-center mb-5`}>
                      <c.icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="font-bold text-white text-lg">{c.title}</h3>
                    <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">{c.desc}</p>
                  </SpotlightCard>
                </Reveal>
              ))}
            </div>
          </section>

          {/* ── Solutions ──────────────────────────────────────── */}
          <section id="solutions" className="px-6 pb-32 scroll-mt-24">
            <SectionHeading eyebrow="Solutions" title={<>Built for everyone in the <span className="bg-gradient-to-r from-indigo-400 to-fuchsia-400 bg-clip-text text-transparent">impact ecosystem</span></>} sub="One platform, three experiences — each designed around the people who use it every day." />
            <Solutions />
          </section>

          {/* ── Bento features ─────────────────────────────────── */}
          <section className="px-6 pb-32">
            <SectionHeading eyebrow="Platform" title="Everything in one place" sub="Replace a patchwork of tools with a single, beautifully fast platform." />
            <div className="max-w-6xl mx-auto grid md:grid-cols-4 gap-4">
              {BENTO.map((f, i) => (
                <Reveal key={f.title} delay={(i % 4) * 0.06} className={f.span}>
                  <SpotlightCard className="p-7 h-full min-h-[190px]">
                    <div className="flex items-start justify-between">
                      <div className="w-11 h-11 rounded-2xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center mb-6">
                        <f.icon className="w-5 h-5 text-indigo-300" />
                      </div>
                      {f.premium && <span className="text-[10px] font-black tracking-wider px-2 py-1 rounded-md bg-gradient-to-r from-indigo-500 to-fuchsia-500">ENTERPRISE</span>}
                    </div>
                    <h3 className="font-bold text-white text-lg">{f.title}</h3>
                    <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{f.desc}</p>
                  </SpotlightCard>
                </Reveal>
              ))}
            </div>
          </section>

          {/* ── How it works ───────────────────────────────────── */}
          <section className="px-6 pb-32">
            <SectionHeading eyebrow="How it works" title="From sign-up to real-world impact" />
            <div className="relative max-w-6xl mx-auto grid md:grid-cols-4 gap-6">
              <motion.div aria-hidden initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1.4, ease: EASE }} className="hidden md:block absolute top-6 left-[12%] right-[12%] h-px origin-left bg-gradient-to-r from-indigo-500/0 via-indigo-500/60 to-fuchsia-500/0" />
              {[
                { t: 'Join', d: 'Sign up as a student, teacher or organization admin in under a minute.' },
                { t: 'Learn & organize', d: 'Courses, grades, timetable, groups and messaging — all in one place.' },
                { t: 'Collaborate', d: 'Discover NGO projects and internships matched to your skills.' },
                { t: 'Prove impact', d: 'Earn blockchain-verified credentials and report outcomes with confidence.' },
              ].map((s, i) => (
                <Reveal key={s.t} delay={0.15 + i * 0.12} className="relative text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-[#0a0d13] border border-indigo-500/40 flex items-center justify-center font-black text-indigo-300 mb-6 shadow-[0_0_30px_-4px_rgba(99,102,241,0.6)]">{i + 1}</div>
                  <h3 className="font-bold text-lg text-white mb-2">{s.t}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed max-w-[240px] mx-auto">{s.d}</p>
                </Reveal>
              ))}
            </div>
          </section>

          {/* ── Security ───────────────────────────────────────── */}
          <section id="security" className="px-6 pb-32 scroll-mt-24">
            <div className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_1.3fr] gap-12 items-center">
              <Reveal>
                <span className="inline-block text-xs font-bold uppercase tracking-[0.2em] text-emerald-400 mb-4">Security & trust</span>
                <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-[1.1]">Enterprise-grade by design.</h2>
                <p className="text-zinc-400 text-lg mt-5 leading-relaxed">Student data deserves serious protection. UniVerse is built on proven infrastructure — so institutions can adopt it with confidence.</p>
              </Reveal>
              <div className="grid sm:grid-cols-2 gap-4">
                {SECURITY.map((s, i) => (
                  <Reveal key={s.title} delay={i * 0.08}>
                    <SpotlightCard className="p-6 h-full">
                      <s.icon className="w-5 h-5 text-emerald-400 mb-4" />
                      <h3 className="font-bold text-white">{s.title}</h3>
                      <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">{s.desc}</p>
                    </SpotlightCard>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          {/* ── FAQ ────────────────────────────────────────────── */}
          <section id="faq" className="px-6 pb-32 scroll-mt-24">
            <SectionHeading eyebrow="FAQ" title="Questions, answered" />
            <div className="max-w-3xl mx-auto">
              {FAQ.map((f, i) => <FaqItem key={f.q} {...f} i={i} />)}
            </div>
          </section>

          {/* ── Final CTA ──────────────────────────────────────── */}
          <section className="px-6 pb-24">
            <Reveal className="max-w-6xl mx-auto">
              <div className="relative overflow-hidden rounded-[2.5rem] border border-white/[0.08] px-8 py-20 md:py-24 text-center" style={{ background: 'linear-gradient(135deg, #10123a 0%, #1d1049 50%, #0f0c29 100%)' }}>
                <motion.div aria-hidden animate={{ rotate: 360 }} transition={{ duration: 40, repeat: Infinity, ease: 'linear' }} className="absolute -top-1/2 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full opacity-40" style={{ background: 'conic-gradient(from 0deg, transparent, rgba(99,102,241,0.35), transparent 30%, rgba(217,70,239,0.3), transparent 60%)' }} />
                <div className="absolute inset-0 bg-[#0a0d13]/40" />
                <div className="relative">
                  <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/10 text-indigo-200 text-xs font-bold mb-7">
                    <Bell className="w-3.5 h-3.5" /> Now onboarding partner organizations
                  </span>
                  <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.05] max-w-3xl mx-auto">
                    Build the future of education <span className="bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-pink-300 bg-clip-text text-transparent">with us.</span>
                  </h2>
                  <p className="text-zinc-300/80 text-lg mt-6 max-w-xl mx-auto">Start free today. Upgrade when your organization is ready for premium insight.</p>
                  <div className="mt-10 flex flex-wrap gap-3 justify-center">
                    <Link href="/register" className="group inline-flex items-center gap-2 h-14 px-8 rounded-full bg-white text-zinc-900 font-bold text-sm hover:scale-[1.03] active:scale-[0.98] transition-transform">
                      Create free account <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </Link>
                    <a href="mailto:myuniverseimpact@gmail.com?subject=UniVerse%20demo%20request" className="inline-flex items-center gap-2 h-14 px-8 rounded-full border border-white/15 text-white font-bold text-sm hover:bg-white/[0.06] transition-colors">
                      Book a demo
                    </a>
                  </div>
                </div>
              </div>
            </Reveal>
          </section>
        </main>

        <MarketingFooter />
      </div>
    </MotionConfig>
  );
}

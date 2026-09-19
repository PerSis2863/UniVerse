'use client';

import { motion } from 'framer-motion';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Globe2, Heart, Users, Sparkles, Sprout, ArrowRight, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

const stats = [
  { value: '50+',  label: 'Global NGO Partners',  icon: Globe2,  color: 'text-blue-500',    lightBg: 'bg-blue-50',    darkBg: 'dark:bg-blue-500/10',    border: 'border-blue-100 dark:border-blue-500/20' },
  { value: '12K',  label: 'Students Engaged',      icon: Users,  color: 'text-indigo-500',  lightBg: 'bg-indigo-50',  darkBg: 'dark:bg-indigo-500/10',  border: 'border-indigo-100 dark:border-indigo-500/20' },
  { value: '2M',   label: 'Hours Volunteered',     icon: Heart,  color: 'text-rose-500',    lightBg: 'bg-rose-50',    darkBg: 'dark:bg-rose-500/10',    border: 'border-rose-100 dark:border-rose-500/20' },
  { value: '85',   label: 'Active Projects',       icon: Sprout, color: 'text-emerald-500', lightBg: 'bg-emerald-50', darkBg: 'dark:bg-emerald-500/10', border: 'border-emerald-100 dark:border-emerald-500/20' },
];

const projects = [
  { title: 'Clean Water Initiative',   org: 'WaterAid Kenya',  tags: ['Environment', 'Health'],   color: 'from-cyan-500 to-blue-500' },
  { title: 'Digital Literacy for All', org: 'Tech4Good',       tags: ['Education', 'Tech'],       color: 'from-purple-500 to-indigo-500' },
  { title: 'Urban Reforestation',      org: 'Green Earth',     tags: ['Climate', 'Community'],    color: 'from-emerald-500 to-teal-500' },
  { title: 'Youth Mentorship',         org: 'Global Scholars', tags: ['Education', 'Mentorship'], color: 'from-amber-500 to-orange-500' },
];

const liveItems = [
  'Sarah completed 5hrs of tutoring 📚',
  'Green Earth reached 10k trees planted 🌳',
  'MIT joined the global network 🎓',
  'New hackathon announced in London 🇬🇧',
  'Tech4Good raised $5k for laptops 💻',
  'Alex unlocked the "Mentor" badge 🏅',
  'WaterAid launched new impact project 💧',
  'Oxford partners with 3 local NGOs 🤝',
];

export default function ShowcasePage() {
  const [hoveredStat, setHoveredStat] = useState<number | null>(null);
  const { isSignedIn } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isSignedIn) router.push('/student');
  }, [isSignedIn, router]);

  return (
    <div className="min-h-screen overflow-hidden font-sans" style={{ backgroundColor: 'var(--background)', color: 'var(--text-primary)' }}>

      {/* Gradient blobs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-15%] left-[-5%] w-[45%] h-[45%] rounded-full bg-indigo-400/[0.06] dark:bg-indigo-700/20 blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-5%] w-[45%] h-[45%] rounded-full bg-fuchsia-400/[0.06] dark:bg-fuchsia-700/15 blur-[120px]" />
        <div className="absolute top-[40%] left-[50%] w-[30%] h-[30%] rounded-full bg-cyan-400/[0.04] dark:bg-cyan-700/10 blur-[100px]" />
      </div>

      {/* ── Navbar ──────────────────────────────────────── */}
      <nav className="relative z-10 w-full px-6 py-5 flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <UniverseLogo size="md" animated withGlow showText />
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-all shadow-lg shadow-indigo-500/25"
          >
            Sign In <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────── */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-6 pt-16 pb-32">
        <div className="flex flex-col items-center text-center">

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 font-bold text-xs mb-8 border border-indigo-100 dark:border-indigo-500/20"
          >
            <Sparkles className="w-3.5 h-3.5" /> Shaping the Future Together
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl md:text-7xl font-black tracking-tight leading-[1.1] mb-6 max-w-4xl"
          >
            Education that creates{' '}
            <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              real-world impact.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg md:text-xl text-zinc-500 dark:text-zinc-400 max-w-2xl mb-10 leading-relaxed"
          >
            We connect students, mentors, and NGOs globally. Learn, collaborate,
            and solve the world's most pressing challenges.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-4 mb-20"
          >
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors shadow-xl shadow-indigo-500/30"
            >
              Get Started <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#about"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-zinc-100 dark:bg-white/[0.06] hover:bg-zinc-200 dark:hover:bg-white/[0.10] text-zinc-700 dark:text-zinc-200 font-bold text-sm transition-colors border border-zinc-200 dark:border-white/[0.08]"
            >
              Learn More
            </a>
          </motion.div>

          {/* ── Stats ─────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl mb-28"
          >
            {stats.map((stat, i) => (
              <div
                key={i}
                onMouseEnter={() => setHoveredStat(i)}
                onMouseLeave={() => setHoveredStat(null)}
                className={`relative p-6 rounded-3xl bg-white dark:bg-white/[0.03] border ${stat.border} shadow-sm dark:shadow-none overflow-hidden transition-all duration-300 hover:shadow-md dark:hover:bg-white/[0.06] hover:-translate-y-1 cursor-default`}
              >
                <div className={`w-10 h-10 rounded-2xl ${stat.lightBg} ${stat.darkBg} flex items-center justify-center mb-4 transition-transform duration-300 ${hoveredStat === i ? 'scale-110' : ''}`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div className="text-4xl font-black tracking-tight mb-1 text-zinc-900 dark:text-white">{stat.value}</div>
                <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* ── About ─────────────────────────────────────── */}
        <motion.div
          id="about"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="w-full mb-28 grid md:grid-cols-2 gap-16 items-center"
        >
          <div>
            <h2 className="text-3xl md:text-4xl font-black mb-6 tracking-tight">
              Empowering the next generation of{' '}
              <span className="text-indigo-600 dark:text-indigo-400">changemakers.</span>
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 mb-8 text-lg leading-relaxed">
              UniVerse Impact bridges the gap between academic learning and real-world social impact.
              We provide a platform where students can apply their skills to solve genuine challenges
              faced by NGOs and communities globally.
            </p>
            <ul className="space-y-5">
              {[
                { title: 'For Students',       desc: 'Gain real-world experience, earn verified certificates, and build a portfolio of impactful work.' },
                { title: 'For Universities',   desc: 'Track student engagement, manage volunteering hours, and foster a culture of social responsibility.' },
                { title: 'For Organizations', desc: 'Access a global pool of motivated talent ready to help scale your impact initiatives.' },
              ].map((item, i) => (
                <li key={i} className="flex gap-3">
                  <CheckCircle className="w-5 h-5 text-indigo-500 dark:text-indigo-400 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="font-bold text-zinc-900 dark:text-white mb-1">{item.title}</h4>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Steps card */}
          <div className="relative hidden md:block">
            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-100 via-purple-50 to-emerald-100 dark:from-indigo-900/20 dark:via-purple-900/10 dark:to-emerald-900/20 rounded-[2.5rem] blur-2xl opacity-60" />
            <div className="relative bg-white dark:bg-white/[0.03] rounded-[2.5rem] p-8 border border-zinc-100 dark:border-white/[0.06] shadow-xl dark:shadow-none">
              <div className="flex flex-col gap-5">
                {[
                  { num: '1', title: 'Connect',    sub: 'Join as a student, university, or NGO.',    lb: 'bg-indigo-50',  db: 'dark:bg-indigo-500/15', lt: 'text-indigo-600',  dt: 'dark:text-indigo-400', ml: '' },
                  { num: '2', title: 'Collaborate', sub: 'Form teams and tackle live projects.',      lb: 'bg-fuchsia-50', db: 'dark:bg-fuchsia-500/15', lt: 'text-fuchsia-600', dt: 'dark:text-fuchsia-400', ml: 'ml-8' },
                  { num: '3', title: 'Impact',      sub: 'Deliver solutions and track global change.', lb: 'bg-emerald-50', db: 'dark:bg-emerald-500/15', lt: 'text-emerald-600', dt: 'dark:text-emerald-400', ml: 'ml-16' },
                ].map((s) => (
                  <div key={s.num} className={`flex items-center gap-4 p-5 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-100 dark:border-white/[0.05] ${s.ml}`}>
                    <div className={`w-12 h-12 rounded-full ${s.lb} ${s.db} flex items-center justify-center ${s.lt} ${s.dt} font-black text-xl`}>{s.num}</div>
                    <div>
                      <div className="font-bold text-zinc-900 dark:text-white">{s.title}</div>
                      <div className="text-sm text-zinc-500 dark:text-zinc-400">{s.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Featured Projects + Live Feed ─────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-left"
        >
          {/* Projects */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-xl font-bold flex items-center gap-2 mb-5">
              <Sprout className="w-5 h-5 text-emerald-500" /> Featured Projects
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.map((proj, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.08 }}
                  className="p-5 rounded-2xl bg-white dark:bg-white/[0.03] border border-zinc-100 dark:border-white/[0.05] hover:border-indigo-200 dark:hover:border-indigo-500/30 hover:shadow-md dark:hover:bg-white/[0.05] transition-all duration-300 cursor-pointer group"
                >
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${proj.color} mb-4 opacity-80 group-hover:opacity-100 transition-opacity`} />
                  <h4 className="font-bold text-lg text-zinc-900 dark:text-white mb-1">{proj.title}</h4>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">{proj.org}</p>
                  <div className="flex gap-2">
                    {proj.tags.map(t => (
                      <span key={t} className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-400">
                        {t}
                      </span>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Live Feed */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold flex items-center gap-2 mb-5">
              <Globe2 className="w-5 h-5 text-indigo-500" /> Live Impact
            </h3>
            <div className="p-5 rounded-2xl bg-white dark:bg-white/[0.03] border border-zinc-100 dark:border-white/[0.05] shadow-sm dark:shadow-none flex flex-col gap-3 h-[360px] overflow-hidden relative">
              <div className="absolute top-0 inset-x-0 h-10 bg-gradient-to-b from-white dark:from-[#0d1117] to-transparent z-10" />
              <div className="absolute bottom-0 inset-x-0 h-20 bg-gradient-to-t from-white dark:from-[#0d1117] to-transparent z-10 flex items-end justify-center pb-4">
                <Link href="/login" className="px-4 py-2 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold text-xs hover:opacity-90 transition-opacity shadow-lg z-20 inline-flex items-center gap-1.5">
                  Join the Network <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="space-y-3 animate-marquee-y hover:[animation-play-state:paused]">
                {[...liveItems, ...liveItems].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 bg-zinc-50 dark:bg-white/[0.03] p-3 rounded-xl border border-zinc-100 dark:border-white/[0.05]">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shrink-0" />
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-zinc-100 dark:border-white/[0.06] px-6 py-8 max-w-7xl mx-auto flex items-center justify-between text-xs text-zinc-400 dark:text-zinc-600">
        <span>© 2026 UniVerse Impact Network</span>
        <span className="flex items-center gap-1">Made with <span className="text-red-500">❤️</span> by Aditya Bhatt</span>
      </footer>
    </div>
  );
}

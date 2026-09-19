'use client';

import { motion } from 'framer-motion';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { Globe2, Heart, Users, Sparkles, Sprout, ArrowRight, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

const stats = [
  { value: '50+',  label: 'Global NGO Partners',  icon: Globe2,  color: 'text-blue-500',    bg: 'bg-blue-50',    border: 'border-blue-100' },
  { value: '12K',  label: 'Students Engaged',      icon: Users,  color: 'text-indigo-500',  bg: 'bg-indigo-50',  border: 'border-indigo-100' },
  { value: '2M',   label: 'Hours Volunteered',     icon: Heart,  color: 'text-rose-500',    bg: 'bg-rose-50',    border: 'border-rose-100' },
  { value: '85',   label: 'Active Projects',       icon: Sprout, color: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-100' },
];

const projects = [
  { title: 'Clean Water Initiative',  org: 'WaterAid Kenya',   tags: ['Environment', 'Health'],      color: 'from-cyan-500 to-blue-500' },
  { title: 'Digital Literacy for All', org: 'Tech4Good',       tags: ['Education', 'Tech'],          color: 'from-purple-500 to-indigo-500' },
  { title: 'Urban Reforestation',     org: 'Green Earth',      tags: ['Climate', 'Community'],       color: 'from-emerald-500 to-teal-500' },
  { title: 'Youth Mentorship',        org: 'Global Scholars',  tags: ['Education', 'Mentorship'],    color: 'from-amber-500 to-orange-500' },
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
    <div className="min-h-screen bg-white text-zinc-900 overflow-hidden font-sans">

      {/* Gradient blobs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-15%] left-[-5%] w-[45%] h-[45%] rounded-full bg-indigo-400/8 blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-5%] w-[45%] h-[45%] rounded-full bg-fuchsia-400/8 blur-[120px]" />
        <div className="absolute top-[40%] left-[50%] w-[30%] h-[30%] rounded-full bg-cyan-400/5 blur-[100px]" />
      </div>

      {/* ── Navbar ──────────────────────────────────────── */}
      <nav className="relative z-10 w-full px-6 py-5 flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <UniverseLogo size="md" animated withGlow />
          <span className="font-bold text-lg tracking-tight ml-1">
            Uni<span className="bg-gradient-to-r from-indigo-600 to-amber-500 bg-clip-text text-transparent">Verse</span> Impact
          </span>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-700 transition-colors shadow-lg shadow-zinc-900/20"
        >
          Sign In <ArrowRight className="w-4 h-4" />
        </Link>
      </nav>

      {/* ── Hero ────────────────────────────────────────── */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-6 pt-16 pb-32">

        <div className="flex flex-col items-center text-center">

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 text-indigo-600 font-bold text-xs mb-8 border border-indigo-100"
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
            className="text-lg md:text-xl text-zinc-500 max-w-2xl mb-10 leading-relaxed"
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
            <Link
              href="#about"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-sm transition-colors"
            >
              Learn More
            </Link>
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
                className={`relative p-6 rounded-3xl bg-white border ${stat.border} shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md hover:-translate-y-1 cursor-default`}
              >
                <div className={`w-10 h-10 rounded-2xl ${stat.bg} flex items-center justify-center mb-4 transition-transform duration-300 ${hoveredStat === i ? 'scale-110' : ''}`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div className="text-4xl font-black tracking-tight mb-1 text-zinc-900">{stat.value}</div>
                <div className="text-sm font-medium text-zinc-500">{stat.label}</div>
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
              <span className="text-indigo-600">changemakers.</span>
            </h2>
            <p className="text-zinc-500 mb-8 text-lg leading-relaxed">
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
                  <CheckCircle className="w-5 h-5 text-indigo-500 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="font-bold text-zinc-900 mb-1">{item.title}</h4>
                    <p className="text-sm text-zinc-500 leading-relaxed">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Steps card */}
          <div className="relative hidden md:block">
            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-100 via-purple-50 to-emerald-100 rounded-[2.5rem] blur-2xl opacity-60" />
            <div className="relative bg-white rounded-[2.5rem] p-8 border border-zinc-100 shadow-xl">
              <div className="flex flex-col gap-5">
                {[
                  { num: '1', title: 'Connect',     sub: 'Join as a student, university, or NGO.',    bg: 'bg-indigo-50',  text: 'text-indigo-600',  ml: '' },
                  { num: '2', title: 'Collaborate',  sub: 'Form teams and tackle live projects.',       bg: 'bg-fuchsia-50', text: 'text-fuchsia-600', ml: 'ml-8' },
                  { num: '3', title: 'Impact',       sub: 'Deliver solutions and track global change.', bg: 'bg-emerald-50', text: 'text-emerald-600', ml: 'ml-16' },
                ].map((s) => (
                  <div key={s.num} className={`flex items-center gap-4 p-5 rounded-2xl bg-zinc-50 border border-zinc-100 ${s.ml}`}>
                    <div className={`w-12 h-12 rounded-full ${s.bg} flex items-center justify-center ${s.text} font-black text-xl`}>{s.num}</div>
                    <div>
                      <div className="font-bold text-zinc-900">{s.title}</div>
                      <div className="text-sm text-zinc-500">{s.sub}</div>
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
                  className="p-5 rounded-2xl bg-white border border-zinc-100 hover:border-indigo-200 hover:shadow-md transition-all duration-300 cursor-pointer group"
                >
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${proj.color} mb-4 opacity-80 group-hover:opacity-100 transition-opacity`} />
                  <h4 className="font-bold text-lg text-zinc-900 mb-1">{proj.title}</h4>
                  <p className="text-sm text-zinc-500 mb-4">{proj.org}</p>
                  <div className="flex gap-2">
                    {proj.tags.map(t => (
                      <span key={t} className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-600">
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
            <div className="p-5 rounded-2xl bg-white border border-zinc-100 shadow-sm flex flex-col gap-3 h-[360px] overflow-hidden relative">
              <div className="absolute top-0 inset-x-0 h-10 bg-gradient-to-b from-white to-transparent z-10" />
              <div className="absolute bottom-0 inset-x-0 h-20 bg-gradient-to-t from-white to-transparent z-10 flex items-end justify-center pb-4">
                <Link href="/login" className="px-4 py-2 rounded-full bg-zinc-900 text-white font-bold text-xs hover:bg-zinc-700 transition-colors shadow-lg z-20 inline-flex items-center gap-1.5">
                  Join the Network <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="space-y-3 animate-marquee-y hover:[animation-play-state:paused]">
                {[...liveItems, ...liveItems].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shrink-0" />
                    <span className="text-sm font-medium text-zinc-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-zinc-100 px-6 py-8 max-w-7xl mx-auto flex items-center justify-between text-xs text-zinc-400">
        <span>© 2026 UniVerse Impact Network</span>
        <span>UN Sustainable Development Partner</span>
      </footer>
    </div>
  );
}

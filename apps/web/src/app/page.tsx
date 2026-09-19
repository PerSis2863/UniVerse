'use client';

import { motion } from 'framer-motion';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { Globe2, ArrowRight, Heart, Users, Sparkles, Sprout } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const stats = [
  { value: '50+', label: 'Global NGO Partners', icon: Globe2, color: 'text-blue-500' },
  { value: '12K', label: 'Students Engaged', icon: Users, color: 'text-indigo-500' },
  { value: '2M', label: 'Hours Volunteered', icon: Heart, color: 'text-rose-500' },
  { value: '85', label: 'Active Projects', icon: Sprout, color: 'text-emerald-500' },
];

export default function ShowcasePage() {
  const [hoveredStat, setHoveredStat] = useState<number | null>(null);
  const { user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      const path = user.role === 'STUDENT' ? '/student' : user.role === 'TEACHER' ? '/teacher' : '/admin';
      router.push(path);
    }
  }, [user, router]);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0d1424] text-zinc-900 dark:text-white overflow-hidden font-sans selection:bg-indigo-500/30">
      
      {/* Dynamic Background Effects */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-fuchsia-500/10 blur-[120px]" />
      </div>

      {/* Navbar */}
      <nav className="relative z-10 w-full p-6 flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <UniverseLogo size="md" animated withGlow />
          <span className="font-bold text-lg tracking-tight ml-2">Uni<span className="bg-gradient-to-r from-indigo-500 to-amber-500 bg-clip-text text-transparent">Verse</span> Impact</span>
        </div>
        <Link href="/login" className="px-6 py-2.5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold text-sm hover:scale-105 transition-transform shadow-lg shadow-zinc-900/20 dark:shadow-white/10">
          Sign In
        </Link>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-6 pt-20 pb-32 flex flex-col items-center text-center">
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 text-indigo-500 font-bold text-xs mb-8 border border-indigo-500/20"
        >
          <Sparkles className="w-4 h-4" /> Shaping the Future Together
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-5xl md:text-7xl font-black tracking-tight leading-[1.1] mb-6 max-w-4xl"
        >
          Education that creates <br className="hidden md:block"/>
          <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            real-world impact.
          </span>
        </motion.h1>

        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-lg md:text-xl text-zinc-500 dark:text-zinc-400 max-w-2xl mb-12"
        >
          We connect students, mentors, and NGOs globally. Learn, collaborate, and solve the world's most pressing challenges.
        </motion.p>

        {/* Impact Stats Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-5xl mb-20"
        >
          {stats.map((stat, i) => (
            <div 
              key={i}
              onMouseEnter={() => setHoveredStat(i)}
              onMouseLeave={() => setHoveredStat(null)}
              className="relative p-6 rounded-3xl bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/[0.05] overflow-hidden group transition-all duration-500 hover:border-indigo-500/50 hover:bg-white dark:hover:bg-white/[0.05]"
            >
              <div className={cn(
                "absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500",
                stat.color.replace('text-', 'bg-')
              )} />
              
              <stat.icon className={cn(
                "w-8 h-8 mb-4 transition-transform duration-500",
                stat.color,
                hoveredStat === i ? "scale-110" : ""
              )} />
              
              <div className="text-4xl font-black tracking-tight mb-1">{stat.value}</div>
              <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{stat.label}</div>
            </div>
          ))}
        </motion.div>

        {/* Interactive Showcase Section */}
        <div className="w-full max-w-6xl mt-12 grid grid-cols-1 lg:grid-cols-3 gap-6 text-left">
          {/* Active Projects Column */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-xl font-bold px-2 flex items-center gap-2">
              <Sprout className="w-5 h-5 text-emerald-500" /> Featured Projects
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { title: 'Clean Water Initiative', org: 'WaterAid Kenya', tags: ['Environment', 'Health'], color: 'from-cyan-500 to-blue-500' },
                { title: 'Digital Literacy for All', org: 'Tech4Good', tags: ['Education', 'Tech'], color: 'from-purple-500 to-indigo-500' },
                { title: 'Urban Reforestation', org: 'Green Earth', tags: ['Climate', 'Community'], color: 'from-emerald-500 to-teal-500' },
                { title: 'Youth Mentorship', org: 'Global Scholars', tags: ['Education', 'Mentorship'], color: 'from-amber-500 to-orange-500' },
              ].map((proj, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + (i * 0.1) }}
                  className="p-5 rounded-2xl bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/[0.05] hover:bg-white dark:hover:bg-white/[0.05] transition-colors cursor-pointer group"
                >
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${proj.color} mb-4 opacity-80 group-hover:opacity-100 transition-opacity`} />
                  <h4 className="font-bold text-lg mb-1">{proj.title}</h4>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">{proj.org}</p>
                  <div className="flex gap-2">
                    {proj.tags.map(t => (
                      <span key={t} className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                        {t}
                      </span>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Live Activity Feed Column */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold px-2 flex items-center gap-2">
              <Globe2 className="w-5 h-5 text-indigo-500" /> Live Impact
            </h3>
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
              className="p-5 rounded-2xl bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/[0.05] flex flex-col gap-4 h-[350px] overflow-hidden relative"
            >
              {/* Fade out masks for scrolling effect */}
              <div className="absolute top-0 inset-x-0 h-10 bg-gradient-to-b from-zinc-50 dark:from-zinc-950 to-transparent z-10" />
              <div className="absolute bottom-0 inset-x-0 h-20 bg-gradient-to-t from-zinc-50 dark:from-zinc-950 to-transparent z-10 flex items-end justify-center pb-4">
                <Link href="/login" className="px-4 py-2 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold text-xs hover:scale-105 transition-transform shadow-lg shadow-zinc-900/20 dark:shadow-white/10 z-20">
                  Join the Network
                </Link>
              </div>

              {/* Ticker Items */}
              <div className="space-y-4 animate-marquee-y hover:[animation-play-state:paused]">
                {[
                  'Sarah completed 5hrs of tutoring',
                  'Green Earth reached 10k trees',
                  'MIT joined the global network',
                  'New hackathon announced in London',
                  'Tech4Good raised $5k for laptops',
                  'Alex unlocked the "Mentor" badge',
                  'Sarah completed 5hrs of tutoring',
                  'Green Earth reached 10k trees',
                  'MIT joined the global network',
                  'New hackathon announced in London',
                  'Tech4Good raised $5k for laptops',
                  'Alex unlocked the "Mentor" badge',
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white dark:bg-zinc-900/50 p-3 rounded-xl border border-zinc-100 dark:border-white/[0.05]">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{item}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>

      </main>
    </div>
  );
}

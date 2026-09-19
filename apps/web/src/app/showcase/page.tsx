'use client';

import { motion } from 'framer-motion';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { Globe2, ArrowRight, Heart, Users, Sparkles, Sprout } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const stats = [
  { value: '50+', label: 'Global NGO Partners', icon: Globe2, color: 'text-blue-500' },
  { value: '12K', label: 'Students Engaged', icon: Users, color: 'text-indigo-500' },
  { value: '2M', label: 'Hours Volunteered', icon: Heart, color: 'text-rose-500' },
  { value: '85', label: 'Active Projects', icon: Sprout, color: 'text-emerald-500' },
];

export default function ShowcasePage() {
  const [hoveredStat, setHoveredStat] = useState<number | null>(null);

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

        {/* Visual Showcase (Abstract) */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="w-full max-w-5xl aspect-video rounded-3xl overflow-hidden relative border border-zinc-200 dark:border-white/10 shadow-2xl bg-zinc-100 dark:bg-zinc-900/50 flex flex-col items-center justify-center p-8 text-center"
        >
          <Globe2 className="w-24 h-24 text-zinc-300 dark:text-zinc-700 mb-6 animate-pulse" />
          <h3 className="text-2xl font-bold mb-2">Join a Global Network</h3>
          <p className="text-zinc-500 dark:text-zinc-400 max-w-md">Discover projects, connect with mentors, and track your social impact through our unified portal.</p>
          
          <Link href="/login" className="mt-8 px-6 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold transition-colors flex items-center gap-2">
            Explore the Portal <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>

      </main>
    </div>
  );
}

'use client';

import { Topbar } from '@/components/layout/Topbar';
import { motion } from 'framer-motion';
import { Heart, Search, HelpCircle, CheckCircle2, Package, Coins, Users, HandHeart, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const needs = [
  {
    id: 1,
    title: 'Clean Water Project - Rural Kenya',
    org: 'Global Water Initiative',
    category: 'Funding',
    goal: '$5,000',
    raised: '$3,200',
    urgency: 'High',
    icon: Coins,
    color: 'emerald'
  },
  {
    id: 2,
    title: 'Code Bootcamp Mentors Needed',
    org: 'Tech4All',
    category: 'Volunteering',
    goal: '20 Mentors',
    raised: '12 Mentors',
    urgency: 'Medium',
    icon: Users,
    color: 'indigo'
  },
  {
    id: 3,
    title: 'Laptops for Local School',
    org: 'Education First',
    category: 'Equipment',
    goal: '50 Laptops',
    raised: '15 Laptops',
    urgency: 'High',
    icon: Package,
    color: 'amber'
  }
];

export default function NeedsSupportBoardPage() {
  return (
    <div className="min-h-screen">
      <Topbar 
        title="Needs & Support Board" 
        subtitle="Discover opportunities to help global projects with your skills, time, or resources." 
      />

      <main className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        
        {/* Header CTA */}
        <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-transparent border border-indigo-500/20 rounded-2xl p-6 md:p-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
            <Heart className="w-48 h-48 text-indigo-500" />
          </div>
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-500 font-bold text-xs mb-4 border border-indigo-500/20">
              <Sparkles className="w-3.5 h-3.5" /> Make a Difference Today
            </div>
            <h2 className="text-3xl font-black text-zinc-900 dark:text-white mb-2">
              Your Contribution Matters
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6 text-lg">
              Every small action ripples outwards. Whether it's donating old tech, offering a few hours of mentorship, or funding a campaign, you have the power to create impact.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => toast.success('Donation flow opened')}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2"
              >
                <HandHeart className="w-5 h-5" />
                Support a Cause
              </button>
              <button className="bg-white/5 hover:bg-white/10 text-zinc-900 dark:text-white px-6 py-2.5 rounded-xl font-bold transition-all border border-zinc-200 dark:border-white/10 backdrop-blur-md">
                Learn More
              </button>
            </div>
          </div>
        </div>

        {/* Needs Board */}
        <div className="card">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
            <div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Active Requests</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Filter by category to find where you can help best.</p>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input 
                  type="text" 
                  placeholder="Search projects..." 
                  className="pl-9 pr-4 py-2 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm w-full md:w-64"
                />
              </div>
              <button className="btn-secondary text-sm hidden md:flex">Filters</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {needs.map((need, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                key={need.id}
                className="p-5 rounded-xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] hover:shadow-lg transition-all group flex flex-col h-full relative overflow-hidden"
              >
                {need.urgency === 'High' && (
                  <div className="absolute top-0 right-0 w-16 h-16 overflow-hidden rounded-tr-xl">
                    <div className="absolute top-[10px] -right-[14px] w-[60px] transform rotate-45 bg-rose-500 text-white text-[10px] font-bold py-0.5 text-center shadow-sm">
                      URGENT
                    </div>
                  </div>
                )}
                
                <div className="flex items-start gap-4 mb-4">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 border",
                    need.color === 'emerald' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                    need.color === 'indigo' ? "bg-indigo-500/10 text-indigo-500 border-indigo-500/20" :
                    "bg-amber-500/10 text-amber-500 border-amber-500/20"
                  )}>
                    <need.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-500 dark:text-zinc-400 mb-1 block">
                      {need.category}
                    </span>
                    <h4 className="font-bold text-zinc-900 dark:text-white leading-tight group-hover:text-indigo-400 transition-colors">
                      {need.title}
                    </h4>
                  </div>
                </div>
                
                <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-6 flex-grow">
                  Requested by <strong className="text-zinc-900 dark:text-zinc-300">{need.org}</strong>
                </div>
                
                <div className="mt-auto">
                  <div className="flex items-center justify-between text-sm mb-2 font-medium">
                    <span className="text-zinc-900 dark:text-white">{need.raised}</span>
                    <span className="text-zinc-500 dark:text-zinc-500">of {need.goal}</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-zinc-100 dark:bg-white/5 overflow-hidden mb-4">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-1000",
                        need.color === 'emerald' ? "bg-emerald-500" :
                        need.color === 'indigo' ? "bg-indigo-500" :
                        "bg-amber-500"
                      )}
                      style={{ width: `${Math.random() * 40 + 30}%` }}
                    />
                  </div>
                  
                  <button 
                    onClick={() => toast.success('Pledge initiated')}
                    className="w-full py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 dark:hover:bg-white/10 dark:hover:text-white transition-all text-sm font-bold flex items-center justify-center gap-2"
                  >
                    Contribute <CheckCircle2 className="w-4 h-4 opacity-50" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

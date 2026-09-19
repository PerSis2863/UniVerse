'use client';

import { Topbar } from '@/components/layout/Topbar';
import { motion } from 'framer-motion';
import { Users, Mail, CheckCircle2, Shield, HeartHandshake, Briefcase, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const volunteers = [
  {
    id: 1,
    name: 'Dr. Sarah Jenkins',
    role: 'Senior Data Scientist',
    company: 'TechForGood NGO',
    skills: ['AI/ML', 'Python', 'Ethics'],
    status: 'Available',
    hoursCommitted: 45,
    avatar: 'SJ'
  },
  {
    id: 2,
    name: 'Michael Chang',
    role: 'Legal Advisor',
    company: 'Chang & Partners',
    skills: ['Contract Law', 'Startup Advice', 'IP'],
    status: 'In Project',
    hoursCommitted: 12,
    avatar: 'MC'
  },
  {
    id: 3,
    name: 'Elena Rodriguez',
    role: 'Product Designer',
    company: 'Creative Solutions',
    skills: ['UX/UI', 'Figma', 'User Research'],
    status: 'Available',
    hoursCommitted: 80,
    avatar: 'ER'
  }
];

export default function MentorshipPage() {
  return (
    <div className="min-h-screen">
      <Topbar 
        title="Volunteer & Mentor Portal" 
        subtitle="Connect with industry experts willing to help your students." 
      />

      <main className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        
        {/* Header Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="kpi-card group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-zinc-500 dark:text-zinc-400 font-medium">Active Mentors</h3>
            </div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-white">124</div>
            <div className="text-xs text-emerald-500 mt-2 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> +12 this month
            </div>
          </div>
          
          <div className="kpi-card group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                <HeartHandshake className="w-5 h-5" />
              </div>
              <h3 className="text-zinc-500 dark:text-zinc-400 font-medium">Hours Volunteered</h3>
            </div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-white">2,450</div>
            <div className="text-xs text-amber-500 mt-2 flex items-center gap-1">
              Across all global projects
            </div>
          </div>

          <div className="kpi-card group gradient-border">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="text-zinc-500 dark:text-zinc-400 font-medium">Verified Partners</h3>
            </div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-white">45</div>
            <div className="text-xs text-zinc-500 mt-2 flex items-center gap-1">
              NGOs and Corporates
            </div>
          </div>
        </div>

        {/* Mentors List */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Available Mentors</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Industry professionals ready to collaborate.</p>
            </div>
            <button className="btn-secondary text-sm">Filter by Skill</button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {volunteers.map((vol, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                key={vol.id} 
                className="p-5 rounded-xl border border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-white/[0.02] hover:bg-zinc-100 dark:hover:bg-white/[0.04] transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                      {vol.avatar}
                    </div>
                    <div>
                      <h4 className="font-bold text-zinc-900 dark:text-white text-base group-hover:text-indigo-400 transition-colors">{vol.name}</h4>
                      <div className="text-sm text-zinc-500 dark:text-zinc-400 flex items-center gap-2 mt-0.5">
                        <Briefcase className="w-3.5 h-3.5" />
                        {vol.role} @ {vol.company}
                      </div>
                    </div>
                  </div>
                  <span className={cn(
                    "text-xs px-2.5 py-1 rounded-full font-medium border",
                    vol.status === 'Available' 
                      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                  )}>
                    {vol.status}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {vol.skills.map(skill => (
                    <span key={skill} className="text-[10px] px-2 py-1 rounded-md bg-zinc-200 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 border border-zinc-300 dark:border-white/10">
                      {skill}
                    </span>
                  ))}
                </div>

                <div className="mt-5 pt-4 border-t border-zinc-200 dark:border-white/[0.06] flex items-center justify-between">
                  <div className="text-xs text-zinc-500 dark:text-zinc-500">
                    <strong className="text-zinc-900 dark:text-white">{vol.hoursCommitted}h</strong> volunteered
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => toast.success(`Email drafted to ${vol.name}`)}
                      className="p-2 rounded-lg bg-zinc-200 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:text-indigo-500 dark:hover:text-white hover:bg-zinc-300 dark:hover:bg-white/10 transition-colors">
                      <Mail className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => toast.success(`Requested match with ${vol.name}`)}
                      className="px-4 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500 text-indigo-500 hover:text-white text-xs font-bold transition-all flex items-center gap-1">
                      Request Match <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

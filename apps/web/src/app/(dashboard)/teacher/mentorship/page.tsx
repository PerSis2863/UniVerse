'use client';

import { Topbar } from '@/components/layout/Topbar';
import { motion } from 'framer-motion';
import { Users, Mail, CheckCircle2, Shield, HeartHandshake, Briefcase, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import Image from 'next/image';

type Mentor = {
  id: string;
  company: string;
  jobTitle: string;
  skills: string[];
  hoursCommitted: number;
  isAvailable: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    avatar: string;
  }
};

export default function MentorshipPage() {
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMentors();
  }, []);

  const fetchMentors = async () => {
    try {
      const res = await api.get('/mentorship/mentors');
      setMentors(res.data);
    } catch (error) {
      toast.error('Failed to load mentors');
    } finally {
      setLoading(false);
    }
  };

  const requestMatch = async (mentorId: string) => {
    try {
      await api.post(`/mentorship/mentors/${mentorId}/book`, {
        date: new Date().toISOString(),
        time: '10:00 AM',
        topic: 'Initial Discussion'
      });
      toast.success('Match request sent!');
    } catch (error) {
      toast.error('Failed to send request');
    }
  };

  const totalHours = mentors.reduce((acc, m) => acc + m.hoursCommitted, 0);

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
            <div className="text-3xl font-bold text-zinc-900 dark:text-white">{mentors.length}</div>
            <div className="text-xs text-emerald-500 mt-2 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Updated live
            </div>
          </div>
          
          <div className="kpi-card group">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                <HeartHandshake className="w-5 h-5" />
              </div>
              <h3 className="text-zinc-500 dark:text-zinc-400 font-medium">Hours Volunteered</h3>
            </div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-white">{totalHours}</div>
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

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : mentors.length === 0 ? (
            <div className="text-center py-10 text-zinc-500">No mentors available at the moment.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {mentors.map((mentor, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  key={mentor.id} 
                  className="p-5 rounded-xl border border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-white/[0.02] hover:bg-zinc-100 dark:hover:bg-white/[0.04] transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 relative rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white font-bold text-lg shadow-lg overflow-hidden">
                        {mentor.user.avatar ? <Image src={mentor.user.avatar} alt={mentor.user.name} fill className="object-cover" /> : mentor.user.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-zinc-900 dark:text-white text-base group-hover:text-indigo-400 transition-colors">{mentor.user.name}</h4>
                        <div className="text-sm text-zinc-500 dark:text-zinc-400 flex items-center gap-2 mt-0.5">
                          <Briefcase className="w-3.5 h-3.5" />
                          {mentor.jobTitle} @ {mentor.company}
                        </div>
                      </div>
                    </div>
                    <span className={cn(
                      "text-xs px-2.5 py-1 rounded-full font-medium border",
                      mentor.isAvailable 
                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                    )}>
                      {mentor.isAvailable ? 'Available' : 'Busy'}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {mentor.skills.map(skill => (
                      <span key={skill} className="text-[10px] px-2 py-1 rounded-md bg-zinc-200 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 border border-zinc-300 dark:border-white/10">
                        {skill}
                      </span>
                    ))}
                  </div>

                  <div className="mt-5 pt-4 border-t border-zinc-200 dark:border-white/[0.06] flex items-center justify-between">
                    <div className="text-xs text-zinc-500 dark:text-zinc-500">
                      <strong className="text-zinc-900 dark:text-white">{mentor.hoursCommitted}h</strong> volunteered
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          toast.success(`Email drafted to ${mentor.user.name}`);
                          window.location.href = `mailto:${mentor.user.email}`;
                        }}
                        className="p-2 rounded-lg bg-zinc-200 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:text-indigo-500 dark:hover:text-white hover:bg-zinc-300 dark:hover:bg-white/10 transition-colors">
                        <Mail className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => requestMatch(mentor.id)}
                        disabled={!mentor.isAvailable}
                        className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1", 
                          mentor.isAvailable ? "bg-indigo-500/10 hover:bg-indigo-500 text-indigo-500 hover:text-white" : "bg-zinc-200 dark:bg-white/5 text-zinc-400 cursor-not-allowed"
                        )}>
                        Request Match <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

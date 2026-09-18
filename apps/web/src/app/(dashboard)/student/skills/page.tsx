'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Target, Award, CheckCircle2, ChevronRight, BookOpen, Code, Terminal, Monitor, Layout, Database, MessageSquare, Users, Brain, Clock } from 'lucide-react';
import { toast } from 'sonner';

const TECHNICAL_SKILLS = [
  { name: 'JavaScript / TypeScript', level: 85, icon: Code },
  { name: 'React & Next.js', level: 90, icon: Layout },
  { name: 'Database Design', level: 70, icon: Database },
  { name: 'System Architecture', level: 45, icon: Monitor },
  { name: 'Python', level: 75, icon: Terminal },
];

const SOFT_SKILLS = [
  { name: 'Communication', level: 80, icon: MessageSquare },
  { name: 'Team Collaboration', level: 95, icon: Users },
  { name: 'Problem Solving', level: 85, icon: Brain },
  { name: 'Time Management', level: 60, icon: Clock },
];

const ACHIEVEMENTS = [
  { title: 'Dean\'s List', date: 'Fall 2025', icon: Award, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  { title: 'Hackathon Winner', date: 'Spring 2026', icon: Target, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  { title: '100% Attendance', date: 'CS101', icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
];

export default function StudentSkills() {
  const getLevelColor = (level: number) => {
    if (level >= 90) return 'bg-emerald-500';
    if (level >= 75) return 'bg-indigo-500';
    if (level >= 60) return 'bg-blue-500';
    return 'bg-amber-500';
  };

  const getLevelLabel = (level: number) => {
    if (level >= 90) return 'Expert';
    if (level >= 75) return 'Advanced';
    if (level >= 60) return 'Intermediate';
    return 'Beginner';
  };

  return (
    <>
      <Topbar title="My Skills" subtitle="Professional and academic skill tracking" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-8">
          
          {/* Header Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <div className="text-3xl font-bold text-white">12</div>
                <div className="text-sm text-zinc-400">Skills Tracked</div>
              </div>
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <div className="text-3xl font-bold text-white">Lvl 4</div>
                <div className="text-sm text-zinc-400">Advanced Learner</div>
              </div>
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-white mb-1">Update Skills</div>
                <div className="text-sm text-zinc-400">Take an assessment</div>
              </div>
              <button onClick={() => toast.success('Launching assessment...')} className="p-3 bg-white text-black hover:bg-zinc-200 rounded-xl transition-colors">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Technical Skills */}
            <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6 md:p-8">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold text-white">Technical Skills</h3>
                <button onClick={() => toast.success('Opening catalog')} className="text-sm font-medium text-indigo-400 hover:text-indigo-300">View Catalog</button>
              </div>
              
              <div className="space-y-6">
                {TECHNICAL_SKILLS.map((skill, i) => (
                  <div key={i} className="group cursor-pointer" onClick={() => toast.success(`Viewing details for ${skill.name}`)}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <skill.icon className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
                        <span className="text-sm font-semibold text-zinc-200">{skill.name}</span>
                      </div>
                      <div className="text-xs font-medium text-zinc-400">
                        {getLevelLabel(skill.level)} • {skill.level}%
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-800/50 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${getLevelColor(skill.level)}`}
                        style={{ width: `${skill.level}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Soft Skills & Achievements */}
            <div className="space-y-8">
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6 md:p-8">
                <h3 className="text-xl font-bold text-white mb-8">Soft Skills</h3>
                
                <div className="space-y-6">
                  {SOFT_SKILLS.map((skill, i) => (
                    <div key={i} className="group cursor-pointer" onClick={() => toast.success(`Viewing details for ${skill.name}`)}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <skill.icon className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
                          <span className="text-sm font-semibold text-zinc-200">{skill.name}</span>
                        </div>
                        <div className="text-xs font-medium text-zinc-400">
                          {getLevelLabel(skill.level)} • {skill.level}%
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-800/50 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ${getLevelColor(skill.level)}`}
                          style={{ width: `${skill.level}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center justify-between">
                  Achievements
                  <button onClick={() => toast.success('Viewing all achievements')} className="text-sm font-medium text-indigo-400 hover:text-indigo-300">View All</button>
                </h3>
                <div className="grid gap-4">
                  {ACHIEVEMENTS.map((item, i) => (
                    <div key={i} className="flex items-center gap-4 bg-zinc-900/80 p-3 rounded-xl border border-zinc-800/50">
                      <div className={`w-12 h-12 rounded-xl ${item.bg} flex items-center justify-center flex-shrink-0 border border-white/5`}>
                        <item.icon className={`w-6 h-6 ${item.color}`} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white mb-0.5">{item.title}</h4>
                        <div className="text-xs font-medium text-zinc-500">{item.date}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}

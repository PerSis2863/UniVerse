'use client';
import { confirmDialog } from '@/components/ui/Dialogs';
import { useState } from 'react';
import { api } from '@/lib/api';
import Link from '@/components/ui/Link';
import { Topbar } from '@/components/layout/Topbar';
import { Target, Award, CheckCircle2, ChevronRight, BookOpen, Code, Terminal, Monitor, Layout, Database, MessageSquare, Users, Brain, Clock } from 'lucide-react';
import { toast } from 'sonner';

import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';

// Default icons based on name/category
const getSkillIcon = (name: string, category: string) => {
  if (name.toLowerCase().includes('react') || name.toLowerCase().includes('next')) return Layout;
  if (name.toLowerCase().includes('java') || name.toLowerCase().includes('python') || name.toLowerCase().includes('code')) return Code;
  if (name.toLowerCase().includes('database') || name.toLowerCase().includes('sql')) return Database;
  if (name.toLowerCase().includes('system') || name.toLowerCase().includes('architecture')) return Monitor;
  if (name.toLowerCase().includes('communication')) return MessageSquare;
  if (name.toLowerCase().includes('team') || name.toLowerCase().includes('collaborat')) return Users;
  if (name.toLowerCase().includes('time')) return Clock;
  if (category?.toLowerCase().includes('soft')) return Brain;
  return Terminal;
};

const getLevelValue = (level: string) => {
  if (level === 'EXPERT') return 95;
  if (level === 'ADVANCED') return 80;
  if (level === 'INTERMEDIATE') return 60;
  return 30; // BEGINNER
};

export default function StudentSkills() {
  // Real achievements: issued credentials and SDG badges from accepted NGO projects.
  const { data: credentials } = useSWR<any[]>('/impact/blockchain-credentials', fetcher);
  const { data: impactStats } = useSWR<any>('/impact/dashboard/stats', fetcher);
  const achievements = (Array.isArray(credentials) ? credentials : [])
    .filter((c) => c.status === 'ISSUED')
    .map((c) => ({ title: c.title, date: [c.organization, c.issuedAt && new Date(c.issuedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })].filter(Boolean).join(' · '), icon: Award, color: 'text-yellow-500', bg: 'bg-yellow-500/10' }));
  const impactBadges = (impactStats?.sdgBadges ?? []).map((b: any) => ({ title: `SDG ${b.num}`, date: b.partner, icon: Target, color: 'text-emerald-500', bg: 'bg-emerald-500/10' }));
  const { data: mySkills, isLoading, mutate: refreshSkills } = useSWR('/skills/my', fetcher);
  const level = impactStats?.levelInfo?.current;
  const [editor, setEditor] = useState<{ id?: string; name: string; category: string; level: string } | null>(null);
  const [savingSkill, setSavingSkill] = useState(false);
  const saveSkill = async () => {
    if (!editor?.name.trim()) return;
    setSavingSkill(true);
    try {
      await api.post('/skills', { name: editor.name.trim(), category: editor.category, level: editor.level });
      toast.success(editor.id ? 'Skill updated' : 'Skill added');
      setEditor(null);
      refreshSkills();
    } catch { toast.error('Could not save the skill.'); } finally { setSavingSkill(false); }
  };
  const deleteSkill = async () => {
    if (!editor?.id || !(await confirmDialog({ title: `Remove ${editor.name}?`, message: 'It will disappear from your profile.', confirmLabel: 'Remove', destructive: true }))) return;
    try { await api.delete(`/skills/${editor.id}`); toast.success('Skill removed'); setEditor(null); refreshSkills(); } catch { toast.error('Could not remove the skill.'); }
  };
  const openSkill = (skill: any) => setEditor({ id: skill.id, name: skill.name, category: skill.category || 'Technical', level: skill.level || 'BEGINNER' });

  const technicalSkills = (mySkills || []).filter((s: any) => s.category?.toLowerCase() === 'technical' || !s.category?.toLowerCase().includes('soft'));
  const softSkills = (mySkills || []).filter((s: any) => s.category?.toLowerCase() === 'soft skill' || s.category?.toLowerCase().includes('soft'));

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
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <div className="text-3xl font-bold text-zinc-900 dark:text-white">{mySkills?.length || 0}</div>
                <div className="text-sm text-zinc-600 dark:text-zinc-400">Skills Tracked</div>
              </div>
            </div>
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <div className="text-3xl font-bold text-zinc-900 dark:text-white">Lvl {level?.level ?? 1}</div>
                <div className="text-sm text-zinc-600 dark:text-zinc-400">{level?.title ?? 'Changemaker Seed'}</div>
              </div>
            </div>
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-zinc-900 dark:text-white mb-1">Add a skill</div>
                <div className="text-sm text-zinc-600 dark:text-zinc-400">Used for AI project matching</div>
              </div>
              <button onClick={() => setEditor({ name: '', category: 'Technical', level: 'BEGINNER' })} aria-label="Add a skill" className="p-3 bg-white text-black hover:bg-zinc-200 rounded-xl transition-colors">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Technical Skills */}
            <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 md:p-8">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Technical Skills</h3>
                <button onClick={() => window.open('/assets/dummy.pdf', '_blank')} className="text-sm font-medium text-indigo-400 hover:text-indigo-300">View Catalog</button>
              </div>
              
              <div className="space-y-6">
                {isLoading ? (
                  <div className="text-center py-8 text-zinc-500">Loading skills...</div>
                ) : technicalSkills.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500">No technical skills added yet.</div>
                ) : technicalSkills.map((skill: any, i: number) => {
                  const Icon = getSkillIcon(skill.name, skill.category);
                  const levelVal = getLevelValue(skill.level);
                  return (
                  <div key={i} className="group cursor-pointer" onClick={() => openSkill(skill)}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Icon className="w-5 h-5 text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:text-white transition-colors" />
                        <span className="text-sm font-semibold text-zinc-200">{skill.name}</span>
                      </div>
                      <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        {getLevelLabel(levelVal)} • {levelVal}%
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800/50 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${getLevelColor(levelVal)}`}
                        style={{ width: `${levelVal}%` }}
                      ></div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>

            {/* Soft Skills & Achievements */}
            <div className="space-y-8">
              <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 md:p-8">
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-8">Soft Skills</h3>
                
                <div className="space-y-6">
                  {isLoading ? (
                    <div className="text-center py-8 text-zinc-500">Loading soft skills...</div>
                  ) : softSkills.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500">No soft skills added yet.</div>
                  ) : softSkills.map((skill: any, i: number) => {
                    const Icon = getSkillIcon(skill.name, skill.category);
                    const levelVal = getLevelValue(skill.level);
                    return (
                    <div key={i} className="group cursor-pointer" onClick={() => openSkill(skill)}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <Icon className="w-5 h-5 text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:text-white transition-colors" />
                          <span className="text-sm font-semibold text-zinc-200">{skill.name}</span>
                        </div>
                        <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                          {getLevelLabel(levelVal)} • {levelVal}%
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800/50 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ${getLevelColor(levelVal)}`}
                          style={{ width: `${levelVal}%` }}
                        ></div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4 flex items-center justify-between">
                  Achievements
                  <Link href="/student/credentials" className="text-sm font-medium text-indigo-400 hover:text-indigo-300">View all</Link>
                </h3>
                <div className="grid gap-4">
                  {achievements.length === 0 && <p className="text-sm text-zinc-500">Verified credentials you earn appear here. <Link href="/student/credentials" className="text-indigo-500 font-semibold">Request one</Link></p>}
                  {achievements.map((item: any, i: number) => (
                    <div key={i} className="flex items-center gap-4 bg-white dark:bg-zinc-900/80 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/50">
                      <div className={`w-12 h-12 rounded-xl ${item.bg} flex items-center justify-center flex-shrink-0 border border-white/5`}>
                        <item.icon className={`w-6 h-6 ${item.color}`} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white mb-0.5">{item.title}</h4>
                        <div className="text-xs font-medium text-zinc-500 dark:text-zinc-500">{item.date}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4 flex items-center justify-between">
                  Social Impact Badges
                  <Link href="/student/impact/dashboard" className="text-sm font-medium text-indigo-400 hover:text-indigo-300">View all</Link>
                </h3>
                <div className="grid gap-4">
                  {impactBadges.length === 0 && <p className="text-sm text-zinc-500">Complete an NGO project linked to a UN SDG to earn your first badge.</p>}
                  {impactBadges.map((item: any, i: number) => (
                    <div key={i} className="flex items-center gap-4 bg-white dark:bg-zinc-900/80 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/50">
                      <div className={`w-12 h-12 rounded-xl ${item.bg} flex items-center justify-center flex-shrink-0 border border-white/5`}>
                        <item.icon className={`w-6 h-6 ${item.color}`} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white mb-0.5">{item.title}</h4>
                        <div className="text-xs font-medium text-zinc-500 dark:text-zinc-500">{item.date}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
      {editor && (
        <div className="backdrop-in fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={(e) => e.target === e.currentTarget && setEditor(null)}>
          <div className="sheet-in w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#11152a] border border-zinc-200 dark:border-white/10 p-6 shadow-2xl space-y-3">
            <h3 className="text-lg font-black text-zinc-900 dark:text-white">{editor.id ? 'Edit skill' : 'Add a skill'}</h3>
            <input autoFocus disabled={!!editor.id} value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} maxLength={60} placeholder="e.g. Python, Public speaking"
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white outline-none disabled:opacity-60" />
            <div className="grid grid-cols-2 gap-3">
              <select value={editor.category} onChange={(e) => setEditor({ ...editor, category: e.target.value })} className="px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white">
                <option>Technical</option><option>Soft skill</option>
              </select>
              <select value={editor.level} onChange={(e) => setEditor({ ...editor, level: e.target.value })} className="px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white">
                {['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'].map((l) => <option key={l} value={l}>{l.charAt(0) + l.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              {editor.id && <button onClick={deleteSkill} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-rose-500 hover:bg-rose-500/10">Remove</button>}
              <button onClick={() => setEditor(null)} className="ml-auto px-4 py-2.5 rounded-xl text-sm font-semibold text-zinc-600 dark:text-zinc-300">Cancel</button>
              <button onClick={saveSkill} disabled={savingSkill || !editor.name.trim()} className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50">{savingSkill ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

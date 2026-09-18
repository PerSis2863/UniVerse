'use client';
import { Topbar } from '@/components/layout/Topbar';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { useAuthStore } from '@/store/auth';
import { Users, BookOpen, FileText, TrendingUp, CheckCircle2, Clock, BarChart3 } from 'lucide-react';

const recentStudents = [
  { name: 'Aditya Bhatt', course: 'Data Structures', score: 94, status: 'excellent' },
  { name: 'Priya Sharma', course: 'Algorithms', score: 87, status: 'good' },
  { name: 'Rahul Kumar', course: 'Database', score: 72, status: 'needs-help' },
  { name: 'Sneha Patel', course: 'OS', score: 91, status: 'excellent' },
];

const statusColors = {
  excellent: 'badge-green',
  good: 'badge-blue',
  'needs-help': 'badge-amber',
};

const myCourses = [
  { name: 'Data Structures', code: 'CS301', students: 45, completion: 68, color: '#6366f1' },
  { name: 'Algorithms', code: 'CS302', students: 38, completion: 52, color: '#06b6d4' },
  { name: 'Database Management', code: 'CS401', students: 52, completion: 80, color: '#10b981' },
];

export default function TeacherDashboard() {
  const { user } = useAuthStore();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <Topbar title="Teacher Dashboard" subtitle={`${greeting}, ${user?.name?.split(' ')[0] ?? 'Professor'}! 👋`} action={{ label: 'New Course', onClick: () => {} }} />
      <div className="flex-1 p-8 space-y-8">

        {/* KPIs */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard title="Total Students" value="135" icon={Users} change={8} color="indigo" />
          <KpiCard title="Active Courses" value="3" icon={BookOpen} change={0} color="cyan" />
          <KpiCard title="Pending Grades" value="12" icon={FileText} change={-25} color="amber" />
          <KpiCard title="Avg. Class Score" value="84.2%" icon={BarChart3} change={3} color="green" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* My Courses */}
          <div className="xl:col-span-2 card">
            <h2 className="font-bold text-white mb-5">My Courses</h2>
            <div className="space-y-4">
              {myCourses.map((c, i) => (
                <div key={i} className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.05] transition-all cursor-pointer">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                        style={{ background: `${c.color}20` }}>
                        📚
                      </div>
                      <div>
                        <div className="font-semibold text-white text-sm">{c.name}</div>
                        <div className="text-xs text-zinc-500">{c.code} • {c.students} students</div>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-white">{c.completion}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${c.completion}%`, background: `linear-gradient(90deg, ${c.color}, ${c.color}aa)` }} />
                  </div>
                  <div className="flex gap-3 mt-3">
                    <button className="btn-ghost text-xs py-1">Manage</button>
                    <button className="btn-ghost text-xs py-1">Attendance</button>
                    <button className="btn-ghost text-xs py-1">Grades</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Students needing attention */}
          <div className="card">
            <h2 className="font-bold text-white mb-5">Student Performance</h2>
            <div className="space-y-3">
              {recentStudents.map((s, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-white/[0.04] last:border-0">
                  <div className="w-8 h-8 rounded-full bg-indigo-600/30 flex items-center justify-center text-xs font-bold text-indigo-300 flex-shrink-0">
                    {s.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{s.name}</div>
                    <div className="text-xs text-zinc-500 truncate">{s.course}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-bold text-white">{s.score}%</span>
                    <span className={`badge text-[10px] px-2 py-0.5 ${statusColors[s.status as keyof typeof statusColors]}`}>
                      {s.status.replace('-', ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <h2 className="font-bold text-white mb-5">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: CheckCircle2, label: 'Mark Attendance', color: 'green' },
              { icon: FileText, label: 'Upload Material', color: 'indigo' },
              { icon: TrendingUp, label: 'Post Grades', color: 'cyan' },
              { icon: Clock, label: 'Create Quiz', color: 'amber' },
            ].map(a => (
              <button key={a.label} className="glass glass-hover rounded-xl p-4 flex flex-col items-center gap-2 group">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center
                  ${a.color === 'green' ? 'bg-green-900/30 text-green-400' :
                    a.color === 'indigo' ? 'bg-indigo-600/20 text-indigo-400' :
                    a.color === 'cyan' ? 'bg-cyan-600/20 text-cyan-400' : 'bg-amber-900/30 text-amber-400'}`}>
                  <a.icon className="w-5 h-5" />
                </div>
                <span className="text-xs text-zinc-400 group-hover:text-white text-center">{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

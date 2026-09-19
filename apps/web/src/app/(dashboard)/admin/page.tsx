'use client';
import { Topbar } from '@/components/layout/Topbar';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { Users, BookOpen, DollarSign, Activity, TrendingUp, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const recentPayments = [
  { name: 'Aditya Bhatt', type: 'Tuition Fee', amount: 2500, status: 'completed' },
  { name: 'Priya Sharma', type: 'Exam Fee', amount: 150, status: 'pending' },
  { name: 'Rahul Kumar', type: 'Library Fee', amount: 50, status: 'completed' },
  { name: 'Sneha Patel', type: 'Activity Fee', amount: 200, status: 'failed' },
];

const statusIcon = {
  completed: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  pending: <Clock className="w-4 h-4 text-amber-400" />,
  failed: <XCircle className="w-4 h-4 text-rose-400" />,
};

const departments = [
  { name: 'Computer Science', students: 420, teachers: 28, color: '#6366f1' },
  { name: 'Mathematics', students: 310, teachers: 22, color: '#06b6d4' },
  { name: 'Physics', students: 280, teachers: 18, color: '#10b981' },
  { name: 'Electronics', students: 365, teachers: 24, color: '#f59e0b' },
];

import { useState } from 'react';
import { toast } from 'sonner';

export default function AdminDashboard() {
  const [pendingUsers, setPendingUsers] = useState([
    { id: 1, name: 'Dr. Kavya Reddy', role: 'Teacher', dept: 'Computer Science', applied: '2 hours ago' },
    { id: 2, name: 'Mohammed Ali', role: 'Teacher', dept: 'Mathematics', applied: '5 hours ago' },
    { id: 3, name: 'Lisa Chen', role: 'Admin', dept: 'Administration', applied: '1 day ago' },
  ]);

  const handleApprove = (id: number, name: string) => {
    setPendingUsers(prev => prev.filter(u => u.id !== id));
    toast.success(`${name} approved successfully`);
  };

  const handleReject = (id: number, name: string) => {
    setPendingUsers(prev => prev.filter(u => u.id !== id));
    toast.error(`${name}'s application rejected`);
  };

  const handleSendAnnouncement = () => {
    toast.info('Opening announcement composer...');
  };

  return (
    <>
      <Topbar title="Admin Overview" subtitle="System health and key metrics" action={{ label: 'Send Announcement', onClick: handleSendAnnouncement }} />
      <div className="flex-1 p-8 space-y-8">

        {/* KPIs */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard title="Total Students" value="1,375" icon={Users} change={12} color="indigo" />
          <KpiCard title="Active Courses" value="48" icon={BookOpen} change={4} color="cyan" />
          <KpiCard title="Revenue (Month)" value={formatCurrency(87500)} icon={DollarSign} change={8} color="green" />
          <KpiCard title="System Uptime" value="99.9%" icon={Activity} change={0} color="amber" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Departments */}
          <div className="xl:col-span-2 card">
            <h2 className="font-bold text-zinc-900 dark:text-white mb-5">Departments</h2>
            <div className="space-y-4">
              {departments.map((d, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-2 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium text-zinc-900 dark:text-white">{d.name}</span>
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">{d.students} students</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="h-full rounded-full" style={{
                        width: `${(d.students / 420) * 100}%`,
                        background: `${d.color}`,
                        opacity: 0.7,
                      }} />
                    </div>
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-500 w-20 text-right">{d.teachers} teachers</div>
                </div>
              ))}
            </div>

            {/* Revenue chart placeholder */}
            <div className="mt-6 p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Revenue Overview</h3>
                <span className="badge-green">+8% this month</span>
              </div>
              {/* Simple bar chart */}
              <div className="flex items-end gap-2 h-24">
                {[65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 88, 72].map((v, i) => (
                  <div key={i} className="flex-1 rounded-t-md transition-all"
                    style={{
                      height: `${v}%`,
                      background: i === 11
                        ? 'linear-gradient(180deg, #6366f1, #06b6d4)'
                        : 'rgba(99,102,241,0.25)',
                    }} />
                ))}
              </div>
              <div className="flex justify-between mt-2">
                {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map(m => (
                  <span key={m} className="text-[9px] text-zinc-600">{m}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Payments */}
          <div className="card">
            <h2 className="font-bold text-zinc-900 dark:text-white mb-5">Recent Payments</h2>
            <div className="space-y-3">
              {recentPayments.map((p, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-white/[0.04] last:border-0">
                  <div className="w-8 h-8 rounded-full bg-indigo-600/30 flex items-center justify-center text-xs font-bold text-indigo-300 flex-shrink-0">
                    {p.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">{p.name}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-500">{p.type}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-bold text-zinc-900 dark:text-white">{formatCurrency(p.amount)}</span>
                    {statusIcon[p.status as keyof typeof statusIcon]}
                  </div>
                </div>
              ))}
            </div>
            <button 
              onClick={() => toast.info('Loading all payments...')}
              className="w-full mt-4 btn-secondary text-sm py-2">
              View all payments
            </button>
          </div>
        </div>

        {/* Pending Approvals */}
        <div className="card">
          <h2 className="font-bold text-zinc-900 dark:text-white mb-5">Pending User Approvals</h2>
          <div className="space-y-2">
            {pendingUsers.length === 0 ? (
              <div className="text-sm text-zinc-500 dark:text-zinc-500 py-4 text-center">No pending approvals.</div>
            ) : (
              pendingUsers.map((u, i) => (
                <div key={u.id} className="flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.08] transition-colors">
                  <div className="w-9 h-9 rounded-full bg-indigo-600/30 flex items-center justify-center text-xs font-bold text-indigo-300 flex-shrink-0">
                    {u.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-zinc-900 dark:text-white">{u.name}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-500">{u.role} • {u.dept} • {u.applied}</div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleApprove(u.id, u.name)}
                      className="px-3 py-1.5 rounded-lg bg-green-900/30 text-green-400 border border-green-700/30 text-xs font-semibold hover:bg-green-900/50 transition-colors">
                      Approve
                    </button>
                    <button 
                      onClick={() => handleReject(u.id, u.name)}
                      className="px-3 py-1.5 rounded-lg bg-rose-900/30 text-rose-400 border border-rose-700/30 text-xs font-semibold hover:bg-rose-900/50 transition-colors">
                      Reject
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </>
  );
}

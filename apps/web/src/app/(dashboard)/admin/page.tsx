'use client';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LoadError } from '@/components/ui/LoadError';
import { useRouter } from 'next/navigation';
import { AccountSetupCard } from '@/components/dashboard/AccountSetupCard';
import { Topbar } from '@/components/layout/Topbar';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { Users, BookOpen, DollarSign, GraduationCap, ArrowRight, CheckCircle2, XCircle, Clock } from 'lucide-react';
import Link from '@/components/ui/Link';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { useLanguageStore } from '@/store/language';
import useSWR from 'swr';
import { fetcher, api } from '@/lib/fetcher';

const statusIcon = {
  completed: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  pending: <Clock className="w-4 h-4 text-amber-400" />,
  failed: <XCircle className="w-4 h-4 text-rose-400" />,
};


interface PendingUser { id: string; name: string; role: string; dept?: string | null; applied: string }
interface Department { name: string; color?: string; students: number; teachers: number }
interface AdminOverview {
  totalStudents?: number; totalTeachers?: number; totalCourses?: number; revenue?: number;
  pendingUsers?: PendingUser[]; departments?: Department[];
  recentPayments?: { id?: string; name: string; type: string; amount: number; status: string }[];
}

export default function AdminDashboard() {
  const router = useRouter();
  const { t } = useLanguageStore();
  const { data, error, mutate } = useSWR<AdminOverview>('/dashboard/admin', fetcher);
  
  const pendingUsers = data?.pendingUsers ?? [];

  const departments = data?.departments || [];
  const recentPayments = data?.recentPayments || [];

  const setStatus = async (id: string, name: string, status: 'ACTIVE' | 'SUSPENDED') => {
    // Gone from the list straight away; back if saving fails.
    void mutate((cur) => cur && { ...cur, pendingUsers: (cur.pendingUsers ?? []).filter((u) => u.id !== id) }, { revalidate: false });
    try {
      await api.patch(`/users/${id}/status`, { status });
      if (status === 'ACTIVE') toast.success(`${name} approved`);
      else toast(`${name}'s application rejected`);
      mutate();
    } catch {
      void mutate();
      toast.error(`Couldn't update ${name}. Please try again.`);
    }
  };
  const handleApprove = (id: string, name: string) => setStatus(id, name, 'ACTIVE');
  const handleReject = (id: string, name: string) => setStatus(id, name, 'SUSPENDED');
  const maxDeptStudents = Math.max(1, ...departments.map((d) => d.students || 0));

  const handleSendAnnouncement = () => router.push('/admin/announcements');

  if (!data) {
    return (
      <>
        <Topbar title={t('admin.title')} subtitle={t('admin.subtitle')} action={{ label: t('admin.send_announcement'), onClick: handleSendAnnouncement }} />
        <div className="flex-1 p-8">{error ? <LoadError onRetry={() => mutate()} message="Couldn’t load the dashboard." /> : <ContentSkeleton variant="dashboard" />}</div>
      </>
    );
  }

  return (
    <>
      <Topbar title={t('admin.title')} subtitle={t('admin.subtitle')} action={{ label: t('admin.send_announcement'), onClick: handleSendAnnouncement }} />
      <div className="flex-1 p-8 space-y-8">

        {/* KPIs */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard title={t('admin.total_students')} value={data?.totalStudents || 0} icon={Users} color="indigo" />
          <KpiCard title="Teachers" value={data?.totalTeachers || 0} icon={GraduationCap} color="amber" />
          <KpiCard title={t('admin.active_courses')} value={data?.totalCourses || 0} icon={BookOpen} color="cyan" />
          <KpiCard title={t('admin.revenue')} value={formatCurrency(data?.revenue || 0)} icon={DollarSign} color="green" />
        </div>
        {/* Below the main figures, so it never pushes them down when it appears. */}
        <AccountSetupCard />

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Departments */}
          <div className="xl:col-span-2 card">
            <h2 className="font-bold text-zinc-900 dark:text-white mb-5">{t('admin.departments')}</h2>
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
                        width: `${(d.students / maxDeptStudents) * 100}%`,
                        background: `${d.color}`,
                        opacity: 0.7,
                      }} />
                    </div>
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-500 w-20 text-right">{d.teachers} teachers</div>
                </div>
              ))}
            </div>

            <Link href="/admin/finances" className="mt-6 flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-indigo-500/30 transition-colors">
              <span className="text-sm font-semibold text-zinc-900 dark:text-white">{t('admin.revenue_overview')}</span>
              <span className="text-xs font-semibold text-indigo-500 inline-flex items-center gap-1">View finances <ArrowRight className="w-3.5 h-3.5" /></span>
            </Link>
          </div>

          {/* Recent Payments */}
          <div className="card">
            <h2 className="font-bold text-zinc-900 dark:text-white mb-5">{t('admin.recent_payments')}</h2>
            <div className="space-y-3">
              {recentPayments.map((p, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-white/[0.04] last:border-0">
                  <div className="w-8 h-8 rounded-full bg-indigo-600/30 flex items-center justify-center text-xs font-bold text-indigo-700 dark:text-indigo-300 flex-shrink-0">
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
              onClick={() => router.push('/admin/finances')}
              className="w-full mt-4 btn-secondary text-sm py-2">
              {t('admin.view_all_payments')}
            </button>
          </div>
        </div>

        {/* Pending Approvals */}
        <div className="card">
          <h2 className="font-bold text-zinc-900 dark:text-white mb-5">{t('admin.pending_approvals')}</h2>
          <div className="space-y-2">
            {pendingUsers.length === 0 ? (
              <div className="text-sm text-zinc-500 dark:text-zinc-500 py-4 text-center">No pending approvals.</div>
            ) : (
              pendingUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.08] transition-colors">
                  <div className="w-9 h-9 rounded-full bg-indigo-600/30 flex items-center justify-center text-xs font-bold text-indigo-700 dark:text-indigo-300 flex-shrink-0">
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
                      {t('admin.approve')}
                    </button>
                    <button 
                      onClick={() => handleReject(u.id, u.name)}
                      className="px-3 py-1.5 rounded-lg bg-rose-900/30 text-rose-400 border border-rose-700/30 text-xs font-semibold hover:bg-rose-900/50 transition-colors">
                      {t('admin.reject')}
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

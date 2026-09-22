"use client";

import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { Topbar } from '@/components/layout/Topbar';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { ClipboardList, AlertCircle, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AttendancePage() {
  const [selectedCourse, setSelectedCourse] = useState('All Courses');
  const { data, isLoading, error } = useSWR('/attendance/student', fetcher);

  if (isLoading) {
    return (
      <>
        <Topbar title="Attendance" subtitle="Track your class presence and absences." />
        <div className="flex-1 p-8 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Topbar title="Attendance" subtitle="Track your class presence and absences." />
        <div className="flex-1 p-8 text-center text-rose-500">
          Failed to load attendance records.
        </div>
      </>
    );
  }

  const records = data?.records || [];
  const summary = data?.summary || [];

  const totalClasses = summary.reduce((acc: number, item: any) => acc + item._count.status, 0);
  const totalPresent = summary.filter((i: any) => i.status === 'PRESENT').reduce((acc: number, item: any) => acc + item._count.status, 0);
  const totalAbsences = summary.filter((i: any) => i.status === 'ABSENT').reduce((acc: number, item: any) => acc + item._count.status, 0);
  const totalExcused = summary.filter((i: any) => i.status === 'EXCUSED').reduce((acc: number, item: any) => acc + item._count.status, 0);
  const attendancePercentage = totalClasses === 0 ? 100 : Math.round((totalPresent / totalClasses) * 1000) / 10;

  const attendanceData = records.map((r: any) => ({
    course: r.course?.name || 'Unknown Course',
    date: new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: new Date(r.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    status: r.status === 'PRESENT' ? 'Present' : r.status === 'ABSENT' ? 'Absent' : 'Excused',
  }));

  const filteredData = selectedCourse === 'All Courses' ? attendanceData : attendanceData.filter((r: any) => r.course === selectedCourse);

  const uniqueCourses = Array.from(new Set(attendanceData.map((r: any) => r.course))) as string[];

  return (
    <>
      <Topbar title="Attendance" subtitle="Track your class presence and absences." />
      <div className="flex-1 p-8 space-y-8">
        
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard title="Overall Attendance" value={`${attendancePercentage}%`} icon={ClipboardList} change={0} color="indigo" />
          <KpiCard title="Total Absences" value={totalAbsences.toString()} icon={AlertCircle} change={0} color="rose" />
          <KpiCard title="Excused Leaves" value={totalExcused.toString()} icon={Clock} change={0} color="amber" />
        </div>

        {/* Detailed List */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-bold text-zinc-900 dark:text-white">Recent Classes</h2>
            <select 
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="bg-zinc-100 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/[0.06] rounded-xl px-3 py-1.5 text-sm outline-none focus:border-indigo-500/50"
            >
              <option value="All Courses">All Courses</option>
              {uniqueCourses.map((course: string, i: number) => (
                <option key={i} value={course}>{course}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-white/[0.06] text-sm text-zinc-500 dark:text-zinc-400">
                  <th className="pb-3 font-medium px-4">Course</th>
                  <th className="pb-3 font-medium px-4">Date & Time</th>
                  <th className="pb-3 font-medium px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-zinc-500">
                      No attendance records found.
                    </td>
                  </tr>
                )}
                {filteredData.map((record: any, i: number) => (
                  <motion.tr 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    key={i} 
                    className="border-b border-zinc-100 dark:border-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-4 px-4 font-medium text-zinc-900 dark:text-white text-sm">
                      {record.course}
                    </td>
                    <td className="py-4 px-4 text-sm text-zinc-600 dark:text-zinc-400">
                      <div>{record.date}</div>
                      <div className="text-xs opacity-70 mt-0.5">{record.time}</div>
                    </td>
                    <td className="py-4 px-4">
                      {record.status === 'Present' && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Present
                        </div>
                      )}
                      {record.status === 'Absent' && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-bold border border-rose-500/20">
                          <XCircle className="w-3.5 h-3.5" /> Absent
                        </div>
                      )}
                      {record.status === 'Excused' && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold border border-amber-500/20">
                          <Clock className="w-3.5 h-3.5" /> Excused
                        </div>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </>
  );
}

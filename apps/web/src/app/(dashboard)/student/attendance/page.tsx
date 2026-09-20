'use client';
import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { ClipboardList, AlertCircle, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { motion } from 'framer-motion';

const attendanceData = [
  { course: 'Data Structures & Algorithms', date: 'Sept 19, 2026', status: 'Present', time: '9:00 AM' },
  { course: 'Operating Systems', date: 'Sept 18, 2026', status: 'Present', time: '11:00 AM' },
  { course: 'Database Management', date: 'Sept 17, 2026', status: 'Absent', time: '2:00 PM' },
  { course: 'Computer Networks', date: 'Sept 16, 2026', status: 'Excused', time: '10:00 AM' },
  { course: 'Software Engineering', date: 'Sept 15, 2026', status: 'Present', time: '1:00 PM' },
  { course: 'Data Structures & Algorithms', date: 'Sept 14, 2026', status: 'Present', time: '9:00 AM' },
];

export default function AttendancePage() {
  const [selectedCourse, setSelectedCourse] = useState('All Courses');
  const filteredData = selectedCourse === 'All Courses' ? attendanceData : attendanceData.filter(r => r.course === selectedCourse);

  return (
    <>
      <Topbar title="Attendance" subtitle="Track your class presence and absences." />
      <div className="flex-1 p-8 space-y-8">
        
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard title="Overall Attendance" value="91.2%" icon={ClipboardList} change={2.4} color="indigo" />
          <KpiCard title="Total Absences" value="3" icon={AlertCircle} change={-1} color="rose" />
          <KpiCard title="Excused Leaves" value="1" icon={Clock} change={0} color="amber" />
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
              <option value="Data Structures & Algorithms">Data Structures & Algorithms</option>
              <option value="Operating Systems">Operating Systems</option>
              <option value="Database Management">Database Management</option>
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
                {filteredData.map((record, i) => (
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

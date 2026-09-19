'use client';
import { Topbar } from '@/components/layout/Topbar';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { TrendingUp, BookOpen, Award, ArrowUpRight, ArrowDownRight, FileBadge } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const gradesData = [
  { course: 'Data Structures & Algorithms', code: 'CS301', credits: 4, grade: 'A', percentage: 94, status: 'Passed' },
  { course: 'Operating Systems', code: 'CS302', credits: 4, grade: 'B+', percentage: 88, status: 'Passed' },
  { course: 'Database Management', code: 'CS303', credits: 3, grade: 'A-', percentage: 91, status: 'Passed' },
  { course: 'Computer Networks', code: 'CS304', credits: 3, grade: 'A', percentage: 96, status: 'Passed' },
  { course: 'Software Engineering', code: 'CS305', credits: 4, grade: 'B', percentage: 84, status: 'Passed' },
];

export default function GradesPage() {
  return (
    <>
      <Topbar title="My Grades" subtitle="Academic performance and transcript overview." />
      <div className="flex-1 p-8 space-y-8 overflow-y-auto">
        
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard title="Cumulative GPA" value="3.84" icon={TrendingUp} change={0.12} color="indigo" />
          <KpiCard title="Credits Earned" value="84" icon={Award} change={14} color="emerald" />
          <KpiCard title="Current Semester GPA" value="3.91" icon={BookOpen} change={0.2} color="fuchsia" />
        </div>

        {/* Detailed List */}
        <div className="card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h2 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <FileBadge className="w-5 h-5 text-indigo-500" /> Academic Transcript
            </h2>
            <div className="flex gap-2">
              <select className="bg-zinc-100 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/[0.06] rounded-xl px-3 py-1.5 text-sm outline-none focus:border-indigo-500/50 font-medium">
                <option>Fall 2026</option>
                <option>Spring 2026</option>
                <option>Fall 2025</option>
                <option>Spring 2025</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-white/[0.06] text-sm text-zinc-500 dark:text-zinc-400">
                  <th className="pb-3 font-medium px-4">Course</th>
                  <th className="pb-3 font-medium px-4 text-center">Credits</th>
                  <th className="pb-3 font-medium px-4 text-center">Score</th>
                  <th className="pb-3 font-medium px-4 text-center">Grade</th>
                </tr>
              </thead>
              <tbody>
                {gradesData.map((record, i) => (
                  <motion.tr 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    key={i} 
                    className="border-b border-zinc-100 dark:border-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors group"
                  >
                    <td className="py-4 px-4">
                      <div className="font-bold text-zinc-900 dark:text-white text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {record.course}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono">{record.code}</div>
                    </td>
                    <td className="py-4 px-4 text-sm text-center text-zinc-600 dark:text-zinc-300 font-medium">
                      {record.credits}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <div className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                        {record.percentage}%
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <div className={cn(
                        "inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-black border",
                        record.grade.startsWith('A') ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
                        record.grade.startsWith('B') ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" :
                        "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20"
                      )}>
                        {record.grade}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-6 flex justify-end">
            <button className="btn-secondary text-xs py-2 flex items-center gap-2">
              <FileBadge className="w-4 h-4" /> Request Official Transcript
            </button>
          </div>
        </div>

      </div>
    </>
  );
}

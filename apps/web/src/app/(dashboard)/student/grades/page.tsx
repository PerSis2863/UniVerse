'use client';
import { Topbar } from '@/components/layout/Topbar';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { TrendingUp, BookOpen, Award, FileBadge, Download, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { toast } from 'sonner';

const allGrades: Record<string, { course: string; code: string; credits: number; grade: string; percentage: number }[]> = {
  'Fall 2026': [
    { course: 'Data Structures & Algorithms', code: 'CS301', credits: 4, grade: 'A', percentage: 94 },
    { course: 'Operating Systems', code: 'CS302', credits: 4, grade: 'B+', percentage: 88 },
    { course: 'Database Management', code: 'CS303', credits: 3, grade: 'A-', percentage: 91 },
    { course: 'Computer Networks', code: 'CS304', credits: 3, grade: 'A', percentage: 96 },
    { course: 'Software Engineering', code: 'CS305', credits: 4, grade: 'B', percentage: 84 },
  ],
  'Spring 2026': [
    { course: 'Introduction to AI', code: 'AI201', credits: 4, grade: 'A+', percentage: 98 },
    { course: 'Web Development', code: 'WEB301', credits: 3, grade: 'A', percentage: 93 },
    { course: 'Linear Algebra', code: 'MATH201', credits: 3, grade: 'B+', percentage: 89 },
  ],
  'Fall 2025': [
    { course: 'Programming Fundamentals', code: 'CS101', credits: 4, grade: 'A', percentage: 95 },
    { course: 'Discrete Math', code: 'MATH101', credits: 3, grade: 'A-', percentage: 90 },
    { course: 'Physics I', code: 'PHY101', credits: 4, grade: 'B+', percentage: 87 },
  ],
};

export default function GradesPage() {
  const [semester, setSemester] = useState('Fall 2026');
  const [showModal, setShowModal] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [transcriptType, setTranscriptType] = useState('full');

  const gradesData = allGrades[semester] ?? [];
  const avg = gradesData.length ? gradesData.reduce((a, r) => a + r.percentage, 0) / gradesData.length : 0;
  const semGPA = ((avg / 100) * 4).toFixed(2);

  const handleDownload = async () => {
    setDownloading(true);
    await new Promise(r => setTimeout(r, 1500));
    setDownloading(false);
    setShowModal(false);
    toast.success('Transcript downloaded!', { description: 'Check your Downloads folder.' });
  };

  const handleRequestOfficial = () => {
    toast.success('Request submitted!', {
      description: 'Official transcript request sent to Registrar. Expected: 3-5 business days.',
    });
  };

  return (
    <>
      <Topbar
        title="My Grades"
        subtitle="Academic performance and transcript overview."
        rightNode={
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" /> Download Transcript
          </button>
        }
      />
      <div className="flex-1 p-4 sm:p-8 space-y-8 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard title="Cumulative GPA" value="3.84" icon={TrendingUp} change={0.12} color="indigo" />
          <KpiCard title="Credits Earned" value="84" icon={Award} change={14} color="emerald" />
          <KpiCard title="Semester GPA" value={semGPA} icon={BookOpen} change={0.2} color="fuchsia" />
        </div>

        <div className="card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h2 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <FileBadge className="w-5 h-5 text-indigo-500" /> Academic Transcript
            </h2>
            <select
              value={semester}
              onChange={e => setSemester(e.target.value)}
              className="bg-zinc-100 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/[0.06] rounded-xl px-3 py-1.5 text-sm outline-none focus:border-indigo-500/50 font-medium text-zinc-900 dark:text-white"
            >
              {Object.keys(allGrades).map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-white/[0.06] text-sm text-zinc-500 dark:text-zinc-400">
                  <th className="pb-3 font-medium px-4">Course</th>
                  <th className="pb-3 font-medium px-4 text-center hidden sm:table-cell">Credits</th>
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
                    key={`${semester}-${i}`}
                    className="border-b border-zinc-100 dark:border-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors group cursor-pointer"
                    onClick={() => toast.info(`${record.course} — ${record.percentage}% (${record.grade})`)}
                  >
                    <td className="py-4 px-4">
                      <div className="font-bold text-zinc-900 dark:text-white text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{record.course}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono">{record.code}</div>
                    </td>
                    <td className="py-4 px-4 text-sm text-center text-zinc-600 dark:text-zinc-300 font-medium hidden sm:table-cell">{record.credits}</td>
                    <td className="py-4 px-4 text-center">
                      <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{record.percentage}%</div>
                      <div className="w-16 h-1 rounded-full bg-zinc-200 dark:bg-zinc-700 mx-auto mt-1 overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${record.percentage}%` }} />
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

          <div className="mt-6 flex flex-col sm:flex-row justify-end gap-2">
            <button onClick={handleRequestOfficial} className="btn-secondary text-xs py-2 flex items-center justify-center gap-2">
              <FileBadge className="w-4 h-4" /> Request Official Transcript
            </button>
            <button onClick={() => setShowModal(true)} className="btn-primary text-xs py-2 flex items-center justify-center gap-2">
              <Download className="w-4 h-4" /> Download PDF
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-zinc-900 dark:text-white text-lg">Download Transcript</h3>
                <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">Select which transcript to download.</p>
              <div className="space-y-3 mb-6">
                {[
                  { id: 'full', label: 'Full Academic Record', desc: 'All semesters + cumulative GPA' },
                  { id: 'semester', label: `${semester} Only`, desc: 'Current selected semester' },
                  { id: 'summary', label: 'GPA Summary', desc: 'One-page GPA history overview' },
                ].map(opt => (
                  <label key={opt.id} className={cn(
                    "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                    transcriptType === opt.id ? "border-indigo-500 bg-indigo-500/5" : "border-zinc-200 dark:border-zinc-700 hover:border-indigo-500/50"
                  )}>
                    <input type="radio" name="ttype" checked={transcriptType === opt.id} onChange={() => setTranscriptType(opt.id)} className="mt-0.5 accent-indigo-500" />
                    <div>
                      <div className="text-sm font-medium text-zinc-900 dark:text-white">{opt.label}</div>
                      <div className="text-xs text-zinc-500">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowModal(false)} className="flex-1 btn-secondary py-2.5 text-sm">Cancel</button>
                <button onClick={handleDownload} disabled={downloading} className="flex-1 btn-primary py-2.5 text-sm flex items-center justify-center gap-2">
                  {downloading ? (
                    <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> Downloading...</>
                  ) : (
                    <><Download className="w-4 h-4" /> Download PDF</>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

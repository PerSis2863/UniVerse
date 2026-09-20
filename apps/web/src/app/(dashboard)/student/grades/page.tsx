'use client';
import { Topbar } from '@/components/layout/Topbar';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { TrendingUp, BookOpen, Award, FileBadge, Download, X, TrendingDown, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef } from 'react';
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

// Historical GPA data for sparkline
const gpaHistory = [
  { sem: 'Fall 2025', gpa: 3.72 },
  { sem: 'Spring 2026', gpa: 3.91 },
  { sem: 'Fall 2026', gpa: 3.84 },
];

// Animated SVG Sparkline
function GpaSparkline({ data }: { data: { sem: string; gpa: number }[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const width = 300;
  const height = 80;
  const pad = 20;
  const minGpa = Math.min(...data.map(d => d.gpa)) - 0.1;
  const maxGpa = Math.max(...data.map(d => d.gpa)) + 0.1;
  const xStep = (width - pad * 2) / (data.length - 1);
  const yScale = (gpa: number) => height - pad - ((gpa - minGpa) / (maxGpa - minGpa)) * (height - pad * 2);

  const points = data.map((d, i) => ({ x: pad + i * xStep, y: yScale(d.gpa) }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  return (
    <div className="relative">
      <svg ref={svgRef} width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        <defs>
          <linearGradient id="gpaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
          <clipPath id="sparkClip">
            <motion.rect
              initial={{ width: 0 }}
              animate={{ width: animated ? width : 0 }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              x="0" y="0" height={height}
            />
          </clipPath>
        </defs>

        {/* Area fill */}
        <path d={areaD} fill="url(#gpaGradient)" clipPath="url(#sparkClip)" />

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke="#6366f1"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          clipPath="url(#sparkClip)"
        />

        {/* Data points + labels */}
        {points.map((p, i) => (
          <g key={i}>
            <motion.circle
              initial={{ r: 0, opacity: 0 }}
              animate={{ r: 4, opacity: 1 }}
              transition={{ delay: 0.9 + i * 0.1 }}
              cx={p.x} cy={p.y}
              fill="white" stroke="#6366f1" strokeWidth="2"
            />
            <motion.text
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.0 + i * 0.1 }}
              x={p.x} y={p.y - 12}
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              fill="#6366f1"
            >
              {data[i].gpa.toFixed(2)}
            </motion.text>
            <motion.text
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1 + i * 0.1 }}
              x={p.x} y={height - 2}
              textAnchor="middle"
              fontSize="8"
              fill="#71717a"
            >
              {data[i].sem.split(' ')[0].slice(0, 3)} {data[i].sem.split(' ')[1]}
            </motion.text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// Grade distribution donut
function GradeDonut({ grades }: { grades: { grade: string; percentage: number }[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const counts = { A: 0, B: 0, C: 0 };
  grades.forEach(g => {
    if (g.grade.startsWith('A')) counts.A++;
    else if (g.grade.startsWith('B')) counts.B++;
    else counts.C++;
  });
  const total = grades.length;
  const slices = [
    { label: 'A grades', count: counts.A, color: '#10b981', pct: (counts.A / total) * 100 },
    { label: 'B grades', count: counts.B, color: '#6366f1', pct: (counts.B / total) * 100 },
    { label: 'C grades', count: counts.C, color: '#f59e0b', pct: (counts.C / total) * 100 },
  ].filter(s => s.count > 0);

  const r = 40;
  const cx = 60, cy = 60;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-6">
      <div className="relative flex-shrink-0">
        <svg width="120" height="120" viewBox="0 0 120 120">
          {slices.map((slice, i) => {
            const dashArray = (slice.pct / 100) * circumference;
            const dashOffset = -offset * circumference / 100;
            offset += slice.pct;
            return (
              <motion.circle
                key={i}
                cx={cx} cy={cy} r={r}
                fill="none"
                stroke={slice.color}
                strokeWidth={hovered === slice.label ? 10 : 8}
                strokeDasharray={`${dashArray} ${circumference}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                initial={{ strokeDasharray: `0 ${circumference}` }}
                animate={{ strokeDasharray: `${dashArray} ${circumference}` }}
                transition={{ duration: 1, delay: 0.3 + i * 0.2, ease: 'easeOut' }}
                onMouseEnter={() => setHovered(slice.label)}
                onMouseLeave={() => setHovered(null)}
                className="cursor-pointer transition-all"
                style={{ transformOrigin: `${cx}px ${cy}px`, transform: 'rotate(-90deg)' }}
              />
            );
          })}
          <text x={cx} y={cy - 5} textAnchor="middle" fontSize="16" fontWeight="800" fill="currentColor" className="fill-zinc-900 dark:fill-white">
            {((counts.A / total) * 100).toFixed(0)}%
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" fontSize="8" className="fill-zinc-500">
            A grades
          </text>
        </svg>
      </div>
      <div className="space-y-2 flex-1">
        {slices.map(slice => (
          <div key={slice.label} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: slice.color }} />
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{slice.label}</span>
            </div>
            <span className="text-xs font-bold" style={{ color: slice.color }}>{slice.count} course{slice.count !== 1 ? 's' : ''}</span>
          </div>
        ))}
        <div className="pt-1 border-t border-zinc-200 dark:border-zinc-800">
          <div className="text-xs text-zinc-500">Total: {total} courses</div>
        </div>
      </div>
    </div>
  );
}

export default function GradesPage() {
  const [semester, setSemester] = useState('Fall 2026');
  const [showModal, setShowModal] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [transcriptType, setTranscriptType] = useState('full');

  const gradesData = allGrades[semester] ?? [];
  const avg = gradesData.length ? gradesData.reduce((a, r) => a + r.percentage, 0) / gradesData.length : 0;
  const semGPA = ((avg / 100) * 4).toFixed(2);

  const prevSems = Object.keys(allGrades);
  const prevIdx = prevSems.indexOf(semester);
  const prevData = prevIdx < prevSems.length - 1 ? allGrades[prevSems[prevIdx + 1]] : null;
  const prevAvg = prevData ? prevData.reduce((a, r) => a + r.percentage, 0) / prevData.length : avg;
  const trend = avg - prevAvg;

  const handleDownload = async () => {
    setDownloading(true);
    await new Promise(r => setTimeout(r, 1500));
    
    const pdfBase64 = 'JVBERi0xLjAKMSAwIG9iaiA8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PiBlbmRvYmogMiAwIG9iaiA8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PiBlbmRvYmogMyAwIG9iaiA8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDU5NSA4NDJdL1BhcmVudCAyIDAgUi9SZXNvdXJjZXM8PC9Gb250PDwvRjEgNCAwIFI+Pj4+L0NvbnRlbnRzIDUgMCBSPj4gZW5kb2JqIDQgMCBvYmogPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4gZW5kb2JqIDUgMCBvYmogPDwvTGVuZ3RoIDUyPj5zdHJlYW0KQlQKL0YxIDI0IFRmCjEwMCA3MDAgVGQKKE9mZmljaWFsIFRyYW5zY3JpcHQpIFRqCkVUCmVuZHN0cmVhbSBlbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4gCjAwMDAwMDAwNjAgMDAwMDAgbiAKMDAwMDAwMDExNyAwMDAwMCBuIAowMDAwMDAwMjIwIDAwMDAwIG4gCjAwMDAwMDAzMDggMDAwMDAgbiAKdHJhaWxlcjw8L1NpemUgNi9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjQxMQolJUVPRgo=';
    const byteCharacters = atob(pdfBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], {type: 'application/pdf'});
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `Aditya_Bhatt_Transcript_${transcriptType}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setDownloading(false);
    setShowModal(false);
    toast.success('Transcript downloaded!', { description: 'Check your Downloads folder.' });
  };

  const handleRequestOfficial = () => {
    toast.success('Request sent to Admin!', {
      description: 'The admin team has been notified and will provide your official transcript shortly.',
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

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard title="Cumulative GPA" value="3.84" icon={TrendingUp} change={0.12} color="indigo" />
          <KpiCard title="Credits Earned" value="84" icon={Award} change={14} color="emerald" />
          <KpiCard title="Semester GPA" value={semGPA} icon={BookOpen} change={0.2} color="fuchsia" />
        </div>

        {/* Performance Insight Banner */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "rounded-2xl border p-5 flex items-start gap-4",
            trend >= 0
              ? "bg-emerald-500/5 border-emerald-500/20 dark:bg-emerald-500/10"
              : "bg-amber-500/5 border-amber-500/20 dark:bg-amber-500/10"
          )}
        >
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
            trend >= 0 ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
          )}>
            {trend >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-bold text-zinc-900 dark:text-white">AI Performance Insight</span>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {trend >= 0
                ? `Your average improved by ${Math.abs(trend).toFixed(1)}% compared to last semester. You're in the top 15% of your cohort! 🚀 Keep it up.`
                : `Your average dipped by ${Math.abs(trend).toFixed(1)}% this semester. Focus on ${gradesData.sort((a,b) => a.percentage - b.percentage)[0]?.course ?? 'your weakest subject'} to boost your GPA.`
              }
            </p>
          </div>
        </motion.div>

        {/* Analytics Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* GPA Trend Chart */}
          <div className="card">
            <h3 className="font-bold text-zinc-900 dark:text-white mb-1 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-500" /> GPA Trend
            </h3>
            <p className="text-xs text-zinc-500 mb-4">Your cumulative GPA over semesters</p>
            <GpaSparkline data={gpaHistory} />
          </div>

          {/* Grade Distribution Donut */}
          <div className="card">
            <h3 className="font-bold text-zinc-900 dark:text-white mb-1 flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-500" /> Grade Distribution
            </h3>
            <p className="text-xs text-zinc-500 mb-4">Breakdown for {semester}</p>
            <GradeDonut grades={gradesData} />
          </div>
        </div>

        {/* Transcript Table */}
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
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${record.percentage}%` }}
                          transition={{ delay: i * 0.05 + 0.2, duration: 0.6 }}
                          className="h-full rounded-full bg-indigo-500"
                        />
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

          <div className="mt-6 flex justify-end items-center gap-3">
            <button onClick={handleRequestOfficial} className="btn-secondary text-sm h-10 px-4 flex items-center justify-center gap-2">
              <FileBadge className="w-4 h-4" /> Request Official Transcript
            </button>
            <button onClick={() => setShowModal(true)} className="btn-primary text-sm h-10 px-4 flex items-center justify-center gap-2">
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


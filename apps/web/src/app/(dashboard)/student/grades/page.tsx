'use client';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { Topbar } from '@/components/layout/Topbar';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { GraduationCap, TrendingUp, BookOpen, Award, FileBadge, Download, X, TrendingDown, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { authedJson } from '@/lib/authed-fetch';
import { api as nestApi } from '@/lib/fetcher';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';

// GPA per term (Jan–Jun = Spring, Jul–Dec = Fall), from real grades on a 4.0 scale.
function gpaByTerm(grades: { score: number; maxScore: number; gradedAt?: string; createdAt?: string }[]) {
  const terms = new Map<string, { key: string; sum: number; n: number }>();
  for (const g of grades) {
    const d = new Date(g.gradedAt ?? g.createdAt ?? Date.now());
    const spring = d.getMonth() < 6;
    const label = `${spring ? 'Spring' : 'Fall'} ${d.getFullYear()}`;
    const key = `${d.getFullYear()}-${spring ? 0 : 1}`;
    const pct = g.maxScore > 0 ? (g.score / g.maxScore) * 100 : 0;
    const t = terms.get(label) ?? { key, sum: 0, n: 0 };
    t.sum += pct; t.n += 1;
    terms.set(label, t);
  }
  return [...terms.entries()]
    .sort((a, b) => a[1].key.localeCompare(b[1].key))
    .map(([sem, t]) => ({ sem, gpa: Math.min(4, Math.round(((t.sum / t.n) / 25) * 100) / 100) }));
}

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
  const counts = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  grades.forEach(g => {
    if (g.grade.startsWith('A')) counts.A++;
    else if (g.grade.startsWith('B')) counts.B++;
    else if (g.grade.startsWith('C')) counts.C++;
    else if (g.grade.startsWith('D')) counts.D++;
    else counts.F++;
  });
  const total = grades.length;
  if (total === 0) return <div className="text-zinc-500 text-sm py-4">No grades available.</div>;

  const slices = [
    { label: 'A grades', count: counts.A, color: '#10b981', pct: (counts.A / total) * 100 },
    { label: 'B grades', count: counts.B, color: '#6366f1', pct: (counts.B / total) * 100 },
    { label: 'C grades', count: counts.C, color: '#f59e0b', pct: (counts.C / total) * 100 },
    { label: 'D/F grades', count: counts.D + counts.F, color: '#ef4444', pct: ((counts.D + counts.F) / total) * 100 },
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

function getLetter(percentage: number) {
  if (percentage >= 97) return 'A+';
  if (percentage >= 93) return 'A';
  if (percentage >= 90) return 'A-';
  if (percentage >= 87) return 'B+';
  if (percentage >= 83) return 'B';
  if (percentage >= 80) return 'B-';
  if (percentage >= 77) return 'C+';
  if (percentage >= 73) return 'C';
  if (percentage >= 70) return 'C-';
  if (percentage >= 67) return 'D+';
  if (percentage >= 65) return 'D';
  return 'F';
}

export default function GradesPage() {
  const [semester, setSemester] = useState('All Grades');
  const [showModal, setShowModal] = useState(false);
  const [transcriptType, setTranscriptType] = useState('full');

  const { data, isLoading, error } = useSWR('/grades/student', fetcher);
  const { data: me } = useSWR<{ name: string; email: string }>('/api/me', authedJson, { revalidateIfStale: false }); // name/email only
  const router = useRouter();
  const [requesting, setRequesting] = useState(false);

  if (isLoading) {
    return (
      <>
        <Topbar title="My Grades" subtitle="Academic performance and transcript overview." />
        <div className="flex-1 p-8 flex items-center justify-center">
          <ContentSkeleton variant="table" />
        </div>
      </>
    );
  }



  // Group by Course or Date, but since we don't have semester, we'll just show all.
  const apiGrades = data?.grades || [];
  const gpaHistory = gpaByTerm(apiGrades);

  if (!error && apiGrades.length === 0) {
    return (
      <>
        <Topbar title="My Grades" subtitle="Academic performance and transcript overview." />
        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          <FeatureGuide
            icon={GraduationCap}
            title="Your grades will appear here"
            description="As teachers grade your assignments and quizzes, you'll see each result, your average per course, your GPA trend across terms and a downloadable transcript."
            steps={['Submit assignments and take quizzes', 'Teachers grade your work', 'Track your GPA and download your transcript here']}
            example={<div><ExampleRow title="Assignment 2 · Operating Systems" meta="Graded 2 days ago" right="91% · A" /><ExampleRow title="Midterm · Sustainable Development" meta="Graded last week" right="74% · C" accent="from-amber-500 to-orange-500" /></div>}
            action={{ label: 'Go to my courses', href: '/student/courses' }}
          />
        </div>
      </>
    );
  }
  
  const mappedGrades = apiGrades.map((g: any) => {
    const percentage = g.maxScore > 0 ? (g.score / g.maxScore) * 100 : 0;
    return {
      courseId: g.course?.id || g.courseId,
      course: g.course?.name || 'Unknown',
      code: g.course?.code || '---',
      credits: g.course?.credits || 3,
      assignment: g.assignmentName,
      grade: getLetter(percentage),
      percentage: Math.round(percentage)
    };
  });

  const allGradesData: Record<string, typeof mappedGrades> = {
    'All Grades': mappedGrades,
  };

  const gradesData = allGradesData[semester] ?? [];
  const avg = gradesData.length ? gradesData.reduce((a: number, r: any) => a + r.percentage, 0) / gradesData.length : 0;
  const semGPA = ((avg / 100) * 4).toFixed(2);

  // Per-course averages drive the insight and the transcript summary.
  type CourseAvg = { course: string; code: string; credits: number; sum: number; n: number };
  const courseMap = new Map<string, CourseAvg>();
  for (const r of gradesData as any[]) {
    const cur = courseMap.get(r.code + r.course) ?? { course: r.course, code: r.code, credits: r.credits, sum: 0, n: 0 };
    cur.sum += r.percentage;
    cur.n += 1;
    courseMap.set(r.code + r.course, cur);
  }
  const byCourse = [...courseMap.values()].map((c) => ({ ...c, avg: Math.round(c.sum / c.n) })).sort((a, b) => a.avg - b.avg);
  const weakest = byCourse.length > 1 ? byCourse[0] : null;
  const trend = avg >= 70 ? 1 : -1;

  const handleDownload = () => {
    const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const rows = transcriptType === 'summary'
      ? byCourse.slice().sort((a, b) => a.code.localeCompare(b.code)).map((c) => `<tr><td>${esc(c.code)}</td><td>${esc(c.course)}</td><td>${c.credits}</td><td>${c.n}</td><td>${c.avg}%</td><td>${getLetter(c.avg)}</td></tr>`).join('')
      : gradesData.map((r: any) => `<tr><td>${esc(r.code)}</td><td>${esc(r.course)}</td><td>${esc(r.assignment)}</td><td>${r.percentage}%</td><td>${esc(r.grade)}</td></tr>`).join('');
    const head = transcriptType === 'summary'
      ? '<tr><th>Code</th><th>Course</th><th>Credits</th><th>Graded items</th><th>Average</th><th>Grade</th></tr>'
      : '<tr><th>Code</th><th>Course</th><th>Assessment</th><th>Score</th><th>Grade</th></tr>';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Transcript - ${esc(me?.name)}</title><style>
      body{font:14px/1.5 system-ui,sans-serif;color:#111;margin:40px}h1{margin:0 0 4px;font-size:22px}p{margin:0;color:#555}
      table{width:100%;border-collapse:collapse;margin-top:24px}th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd}th{background:#f4f4f6;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
      .sum{margin-top:20px;display:flex;gap:32px}.sum b{display:block;font-size:20px}.note{margin-top:32px;font-size:12px;color:#777}
    </style></head><body>
      <h1>Academic transcript (unofficial)</h1><p>${esc(me?.name)} · ${esc(me?.email)}</p><p>Generated ${new Date().toLocaleDateString(undefined, { dateStyle: 'long' })} from UniVerse</p>
      <div class="sum"><div>Average<b>${Math.round(avg)}%</b></div><div>GPA (4.0 scale)<b>${semGPA}</b></div><div>Graded items<b>${gradesData.length}</b></div></div>
      <table><thead>${head}</thead><tbody>${rows}</tbody></table>
      <p class="note">This is an unofficial record generated from grades entered in UniVerse. Request an official transcript from your campus administration.</p>
      <script>window.onload=()=>setTimeout(()=>window.print(),200)</script></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const w = window.open(url, '_blank');
    if (!w) toast.error('Allow pop-ups to open your transcript.');
    else toast.success('Transcript opened', { description: 'Choose “Save as PDF” in the print dialog.' });
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setShowModal(false);
  };

  const handleRequestOfficial = async () => {
    setRequesting(true);
    try {
      await nestApi.post('/tickets', {
        subject: 'Official transcript request',
        category: 'Academic',
        description: `${me?.name ?? 'A student'} (${me?.email ?? ''}) is requesting an official transcript. Current record: ${gradesData.length} graded items, average ${Math.round(avg)}%.`,
      });
      toast.success('Request sent to your campus admin', { description: 'Track it under Support.' });
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Could not send the request. Please try again.');
    } finally {
      setRequesting(false);
    }
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
          <KpiCard title="Cumulative GPA" value={semGPA} icon={TrendingUp} change={0} color="indigo" />
          <KpiCard title="Credits Earned" value={byCourse.reduce((acc, c) => acc + (c.credits || 0), 0).toString()} icon={Award} change={0} color="emerald" />
          <KpiCard title="Average Score" value={`${Math.round(avg)}%`} icon={BookOpen} change={0} color="fuchsia" />
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
              <span className="text-sm font-bold text-zinc-900 dark:text-white">Performance insight</span>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {gradesData.length === 0 ? "No grades available yet to analyze." :
               `Your overall average is ${Math.round(avg)}%${avg >= 70 ? ' — solid work.' : ' — there’s room to improve.'}` +
               (weakest ? ` Your lowest course average is ${weakest.course} (${weakest.avg}%); that's where extra effort will lift your GPA most.` : '')
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
            {gpaHistory.length >= 2 ? <GpaSparkline data={gpaHistory} /> : (
              <p className="text-sm text-zinc-500 py-6">Your trend appears once you have grades from at least two terms{gpaHistory[0] ? ` (so far: ${gpaHistory[0].sem}, GPA ${gpaHistory[0].gpa.toFixed(2)})` : ''}.</p>
            )}
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
              {Object.keys(allGradesData).map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-white/[0.06] text-sm text-zinc-500 dark:text-zinc-400">
                  <th className="pb-3 font-medium px-4">Course / Assignment</th>
                  <th className="pb-3 font-medium px-4 text-center hidden sm:table-cell">Credits</th>
                  <th className="pb-3 font-medium px-4 text-center">Score</th>
                  <th className="pb-3 font-medium px-4 text-center">Grade</th>
                </tr>
              </thead>
              <tbody>
                {gradesData.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-zinc-500">
                      No grades found.
                    </td>
                  </tr>
                )}
                {gradesData.map((record: any, i: number) => (
                  <motion.tr
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i, 6) * 0.03 }}
                    key={`${semester}-${i}`}
                    className="border-b border-zinc-100 dark:border-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors group cursor-pointer"
                    onClick={() => record.courseId && router.push(`/student/blackboard?course=${record.courseId}&tab=grades`)}
                    title="Open this course's grades and feedback"
                  >
                    <td className="py-4 px-4">
                      <div className="font-bold text-zinc-900 dark:text-white text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{record.course}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono">{record.code} • {record.assignment}</div>
                    </td>
                    <td className="py-4 px-4 text-sm text-center text-zinc-600 dark:text-zinc-300 font-medium hidden sm:table-cell">{record.credits}</td>
                    <td className="py-4 px-4 text-center">
                      <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{record.percentage}%</div>
                      <div className="w-16 h-1 rounded-full bg-zinc-200 dark:bg-zinc-700 mx-auto mt-1 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${record.percentage}%` }}
                          transition={{ delay: Math.min(i, 6) * 0.03 + 0.2, duration: 0.6 }}
                          className="h-full rounded-full bg-indigo-500"
                        />
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <div className={cn(
                        "inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-black border",
                        record.grade.startsWith('A') ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
                        record.grade.startsWith('B') ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" :
                        record.grade.startsWith('C') ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" :
                        "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
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
            <button onClick={handleRequestOfficial} disabled={requesting} className="btn-secondary text-sm h-10 px-4 flex items-center justify-center gap-2">
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
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">Opens a printable transcript — choose “Save as PDF” to keep a copy.</p>
              <div className="space-y-3 mb-6">
                {[
                  { id: 'full', label: 'Full record', desc: 'Every graded item with its score and letter grade' },
                  { id: 'summary', label: 'Course summary', desc: 'One line per course with its average' },
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
                <button onClick={handleDownload} className="flex-1 btn-primary py-2.5 text-sm flex items-center justify-center gap-2">
                  <Download className="w-4 h-4" /> Open transcript
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}


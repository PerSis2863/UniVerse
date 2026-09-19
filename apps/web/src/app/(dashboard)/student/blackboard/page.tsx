'use client';
import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import {
  BookOpen, FileText, Search, MessageSquare, Bell, Calendar,
  Download, ExternalLink, Pin, Star, Clock, Users, ChevronRight,
  Upload, Video, Activity, Briefcase, Target, Plus, X, Send,
  CheckCircle2, AlertCircle, BarChart3, Layers, Award, Bookmark, UploadCloud
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ─── Mock Data ────────────────────────────────────────────────────────────────

const COURSES = [
  { code: 'CS301', name: 'Data Structures & Algorithms', instructor: 'Prof. Mehta', color: '#6366f1', students: 45 },
  { code: 'CS302', name: 'Operating Systems', instructor: 'Prof. Patel', color: '#a855f7', students: 52 },
  { code: 'CS303', name: 'Database Management', instructor: 'Prof. Joshi', color: '#10b981', students: 38 },
  { code: 'CS304', name: 'Computer Networks', instructor: 'Dr. Sharma', color: '#3b82f6', students: 41 },
];

const BLACKBOARD_DATA: Record<string, {
  announcements: any[], resources: any[], research: any[],
  assignments: any[], discussion: any[], activity: any[], quizResults: any[], goals: any[]
}> = {
  CS301: {
    announcements: [
      { id: 1, pinned: true, title: 'Midterm Exam Details', body: 'The midterm will cover chapters 1–8. Open book, 90 minutes. Room: Main Hall A.', author: 'Prof. Mehta', time: '2 hours ago', priority: 'high' },
      { id: 2, pinned: false, title: 'Office Hours This Week', body: 'Office hours moved to Wednesday 3–5 PM due to faculty meeting. Room 302.', author: 'Prof. Mehta', time: '1 day ago', priority: 'normal' },
      { id: 3, pinned: false, title: 'Assignment 3 Posted', body: 'Graph traversal assignment is now live. Due date: Oct 5. Submit via Blackboard.', author: 'Prof. Mehta', time: '3 days ago', priority: 'normal' },
    ],
    resources: [
      { id: 1, week: 'Week 1', title: 'Arrays & Linked Lists — Lecture Slides', type: 'PDF', size: '2.4 MB', icon: FileText, color: '#6366f1', pinned: true },
      { id: 2, week: 'Week 2', title: 'Sorting Algorithms — Video Lecture', type: 'Video', size: '240 MB', icon: Video, color: '#ec4899', pinned: false },
      { id: 3, week: 'Week 3', title: 'Trees & Graphs — Reference Sheet', type: 'PDF', size: '1.1 MB', icon: FileText, color: '#6366f1', pinned: false },
      { id: 4, week: 'Week 4', title: 'Dynamic Programming — Practice Set', type: 'DOCX', size: '0.8 MB', icon: FileText, color: '#10b981', pinned: false },
      { id: 5, week: 'Week 5', title: 'Hash Tables — Lecture Recording', type: 'Video', size: '320 MB', icon: Video, color: '#ec4899', pinned: false },
    ],
    research: [
      { id: 1, title: 'Skip Lists: A Probabilistic Alternative to Balanced Trees', authors: 'William Pugh', journal: 'Communications of the ACM', year: 1990, url: '#', tags: ['Data Structures', 'Probabilistic'] },
      { id: 2, title: 'An Introduction to the Analysis of Algorithms', authors: 'Sedgewick & Flajolet', journal: 'Addison-Wesley', year: 2013, url: '#', tags: ['Algorithms', 'Analysis'] },
      { id: 3, title: 'Cache-Oblivious Algorithms', authors: 'Frigo et al.', journal: 'FOCS 1999', year: 1999, url: '#', tags: ['Cache', 'Memory'] },
    ],
    assignments: [
      { id: 1, title: 'Assignment 3: Graph Traversal', due: 'Oct 5, 2026', status: 'pending', score: null, maxScore: 100, description: 'Implement BFS and DFS on a weighted graph.' },
      { id: 2, title: 'Assignment 2: Sorting Challenge', due: 'Sept 20, 2026', status: 'submitted', score: 91, maxScore: 100, description: 'Compare performance of QuickSort, MergeSort, HeapSort.' },
      { id: 3, title: 'Assignment 1: Array Problems', due: 'Sept 10, 2026', status: 'graded', score: 94, maxScore: 100, description: 'Solve 10 classic array manipulation problems.' },
    ],
    discussion: [
      { id: 1, title: 'Confused about Dijkstra vs Bellman-Ford', author: 'Ravi M.', replies: 6, time: '30 mins ago', resolved: false },
      { id: 2, title: 'What is the best way to visualize a trie?', author: 'Priya S.', replies: 4, time: '2 hours ago', resolved: true },
      { id: 3, title: 'Help with Assignment 3 — Edge Cases', author: 'Aditya B.', replies: 2, time: '1 day ago', resolved: false },
    ],
    activity: [
      { user: 'Prof. Mehta', action: 'posted an announcement', item: 'Midterm Exam Details', time: '2h ago', icon: Bell },
      { user: 'Ravi M.', action: 'started a discussion', item: 'Dijkstra vs Bellman-Ford', time: '2h ago', icon: MessageSquare },
      { user: 'Prof. Mehta', action: 'uploaded a resource', item: 'Hash Tables — Lecture Recording', time: '4h ago', icon: Upload },
      { user: 'Priya S.', action: 'submitted', item: 'Assignment 2: Sorting Challenge', time: '1d ago', icon: CheckCircle2 },
    ],
    quizResults: [
      { id: 1, title: 'Graph Algorithms Quiz', date: 'Sept 15, 2026', score: 92, maxScore: 100, questions: 30, timeTaken: '38 mins' },
      { id: 2, title: 'Sorting Algorithms Quiz', date: 'Sept 8, 2026', score: 88, maxScore: 100, questions: 25, timeTaken: '42 mins' },
    ],
    goals: [
      { id: 1, title: 'Complete all Week 1–5 resources', progress: 80, due: 'Sept 25' },
      { id: 2, title: 'Score 90%+ on midterm', progress: 0, due: 'Oct 10' },
      { id: 3, title: 'Participate in 3 discussions', progress: 67, due: 'Oct 1' },
    ],
  },
};
// fill other courses with same data for now
['CS302', 'CS303', 'CS304'].forEach(c => {
  (BLACKBOARD_DATA as any)[c] = { ...BLACKBOARD_DATA.CS301 };
});

const TABS = [
  { id: 'board', label: 'Board', icon: Pin },
  { id: 'resources', label: 'Resources', icon: FileText },
  { id: 'research', label: 'Research', icon: BookOpen },
  { id: 'assignments', label: 'Assignments', icon: CheckCircle2 },
  { id: 'quizzes', label: 'Quiz Results', icon: Star },
  { id: 'discussion', label: 'Discussion', icon: MessageSquare },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'messages', label: 'Messages', icon: Send },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'tools', label: 'Tools', icon: Briefcase },
];

const calendarEvents = [
  { date: 'Oct 5', title: 'Assignment 3 Due', type: 'assignment', color: 'bg-amber-500' },
  { date: 'Oct 10', title: 'Midterm Exam', type: 'exam', color: 'bg-rose-500' },
  { date: 'Oct 15', title: 'Office Hours', type: 'office', color: 'bg-indigo-500' },
  { date: 'Oct 22', title: 'Pop Quiz', type: 'quiz', color: 'bg-purple-500' },
  { date: 'Nov 1', title: 'Assignment 4 Due', type: 'assignment', color: 'bg-amber-500' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function BlackboardPage() {
  const [selectedCourse, setSelectedCourse] = useState(COURSES[0]);
  const [activeTab, setActiveTab] = useState('board');
  const [messageText, setMessageText] = useState('');
  const [newDiscTitle, setNewDiscTitle] = useState('');
  const [showNewDisc, setShowNewDisc] = useState(false);
  const [submissionModal, setSubmissionModal] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [renderTrigger, setRenderTrigger] = useState(0);

  const data = BLACKBOARD_DATA[selectedCourse.code];

  const handleSendMessage = () => {
    if (!messageText.trim()) return;
    toast.success('Message sent to Prof. ' + selectedCourse.instructor.split(' ')[1]);
    setMessageText('');
  };

  return (
    <>
      <Topbar title="Blackboard" subtitle="Course resources, research, assignments & more." />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Course Selector */}
        <div className="border-b border-zinc-200 dark:border-white/[0.06] bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl px-4 sm:px-8 py-3 flex gap-2 overflow-x-auto scrollbar-none">
          {COURSES.map(c => (
            <button
              key={c.code}
              onClick={() => setSelectedCourse(c)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all border',
                selectedCourse.code === c.code
                  ? 'text-white shadow-lg border-transparent'
                  : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700'
              )}
              style={selectedCourse.code === c.code ? { background: c.color, boxShadow: `0 4px 14px ${c.color}40` } : {}}
            >
              <span className="font-bold">{c.code}</span>
              <span className="hidden sm:inline opacity-75">{c.name.split(' ').slice(0, 2).join(' ')}</span>
            </button>
          ))}
        </div>

        {/* Course Header */}
        <div className="px-4 sm:px-8 py-4 border-b border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900/40 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold" style={{ background: selectedCourse.color }}>
              {selectedCourse.code.slice(-2)}
            </div>
            <div>
              <h2 className="font-bold text-zinc-900 dark:text-white">{selectedCourse.name}</h2>
              <p className="text-xs text-zinc-500">{selectedCourse.instructor} · {selectedCourse.students} Students</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary text-xs py-2 flex items-center gap-1.5" onClick={() => toast.info('Opening grade report...')}>
              <BarChart3 className="w-3.5 h-3.5" /> My Grade
            </button>
            <button className="btn-primary text-xs py-2 flex items-center gap-1.5" onClick={() => toast.success('Sending message...')}>
              <Send className="w-3.5 h-3.5" /> Contact Instructor
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto scrollbar-none border-b border-zinc-200 dark:border-white/[0.06] bg-white/80 dark:bg-zinc-900/60 px-4 sm:px-8">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-3.5 text-xs font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors',
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                )}
              >
                <Icon className="w-3.5 h-3.5" /> {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-zinc-50 dark:bg-zinc-950/40">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>

              {/* ── BOARD ────────────────────── */}
              {activeTab === 'board' && (
                <div className="max-w-3xl mx-auto space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Bell className="w-4 h-4 text-indigo-500" /> Announcements</h3>
                  </div>
                  {data.announcements.map((a, i) => (
                    <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                      className={cn('bg-white dark:bg-zinc-900 border rounded-2xl p-5 shadow-sm', a.priority === 'high' ? 'border-rose-500/30' : 'border-zinc-200 dark:border-zinc-800')}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          {a.pinned && <Pin className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />}
                          {a.priority === 'high' && <span className="text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-full border border-rose-500/20">IMPORTANT</span>}
                          <h4 className="font-bold text-zinc-900 dark:text-white">{a.title}</h4>
                        </div>
                        <span className="text-xs text-zinc-400 whitespace-nowrap">{a.time}</span>
                      </div>
                      <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed mb-3">{a.body}</p>
                      <div className="text-xs text-zinc-400">Posted by <span className="text-indigo-500 font-medium">{a.author}</span></div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* ── RESOURCES ─────────────────── */}
              {activeTab === 'resources' && (
                <div className="max-w-3xl mx-auto space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-500" /> Course Materials</h3>
                    <span className="text-xs text-zinc-400">{data.resources.length} files</span>
                  </div>
                  {data.resources.map((r, i) => {
                    const Icon = r.icon;
                    return (
                      <motion.div key={r.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center gap-4 hover:border-indigo-500/40 hover:shadow-sm transition-all cursor-pointer group"
                        onClick={() => toast.success(`Downloading ${r.title}...`)}>
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${r.color}20` }}>
                          <Icon className="w-5 h-5" style={{ color: r.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-zinc-900 dark:text-white text-sm truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{r.title}</p>
                            {r.pinned && <Pin className="w-3 h-3 text-indigo-500 flex-shrink-0" />}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-zinc-400">{r.week}</span>
                            <span className="text-zinc-300 dark:text-zinc-600">·</span>
                            <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500">{r.type}</span>
                            <span className="text-xs text-zinc-400">{r.size}</span>
                          </div>
                        </div>
                        <Download className="w-4 h-4 text-zinc-400 group-hover:text-indigo-500 transition-colors flex-shrink-0" />
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {/* ── RESEARCH ──────────────────── */}
              {activeTab === 'research' && (
                <div className="max-w-3xl mx-auto space-y-4">
                  <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><BookOpen className="w-4 h-4 text-indigo-500" /> Research Papers & References</h3>
                  {data.research.map((r, i) => (
                    <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 hover:border-indigo-500/40 transition-all cursor-pointer group"
                      onClick={() => toast.info(`Opening: ${r.title}`)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <h4 className="font-bold text-zinc-900 dark:text-white text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mb-1">{r.title}</h4>
                          <p className="text-xs text-zinc-500 mb-2">{r.authors} · {r.journal} ({r.year})</p>
                          <div className="flex flex-wrap gap-1.5">
                            {r.tags.map((tag: string) => (
                              <span key={tag} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">{tag}</span>
                            ))}
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-zinc-400 group-hover:text-indigo-500 transition-colors flex-shrink-0 mt-0.5" />
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* ── ASSIGNMENTS ───────────────── */}
              {activeTab === 'assignments' && (
                <div className="max-w-3xl mx-auto space-y-4">
                  <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-indigo-500" /> Assignments</h3>
                  {data.assignments.map((a, i) => (
                    <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h4 className="font-bold text-zinc-900 dark:text-white">{a.title}</h4>
                        <span className={cn('text-[10px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap',
                          a.status === 'graded' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                          a.status === 'submitted' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                          'bg-amber-500/10 text-amber-500 border-amber-500/20'
                        )}>
                          {a.status === 'graded' ? `✓ ${a.score}/${a.maxScore}` : a.status === 'submitted' ? 'Submitted' : 'Pending'}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">{a.description}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                          <Clock className="w-3.5 h-3.5" /> Due: {a.due}
                        </div>
                        {a.status === 'pending' && (
                          <button className="btn-primary text-xs py-1.5 px-4" onClick={() => setSubmissionModal(a)}>
                            Submit
                          </button>
                        )}
                        {a.status === 'submitted' && (
                          <button className="btn-secondary text-xs py-1.5 px-4 opacity-50 cursor-not-allowed">
                            Submitted
                          </button>
                        )}
                        {a.status === 'graded' && (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(a.score / a.maxScore) * 100}%` }} />
                            </div>
                            <span className="text-xs font-bold text-emerald-500">{Math.round((a.score / a.maxScore) * 100)}%</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* ── QUIZ RESULTS ──────────────── */}
              {activeTab === 'quizzes' && (
                <div className="max-w-3xl mx-auto space-y-4">
                  <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Star className="w-4 h-4 text-indigo-500" /> Quiz Results</h3>
                  {data.quizResults.map((q, i) => (
                    <motion.div key={q.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 flex items-center gap-5">
                      <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-xl font-black text-emerald-500">{q.score}</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-zinc-900 dark:text-white text-sm mb-0.5">{q.title}</h4>
                        <div className="flex items-center gap-3 text-xs text-zinc-400">
                          <span>{q.date}</span>
                          <span>·</span>
                          <span>{q.questions} questions</span>
                          <span>·</span>
                          <span>{q.timeTaken}</span>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${q.score}%` }} />
                        </div>
                      </div>
                      <button className="btn-secondary text-xs py-1.5 px-3" onClick={() => toast.info('Reviewing quiz...')}>Review</button>
                    </motion.div>
                  ))}
                  <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl p-5 text-center">
                    <Award className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
                    <p className="font-bold text-zinc-900 dark:text-white mb-1">Average Score: 90%</p>
                    <p className="text-xs text-zinc-500">You're in the top 15% of this course!</p>
                  </div>
                </div>
              )}

              {/* ── DISCUSSION ────────────────── */}
              {activeTab === 'discussion' && (
                <div className="max-w-3xl mx-auto space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><MessageSquare className="w-4 h-4 text-indigo-500" /> Discussion Board</h3>
                    <button className="btn-primary text-xs py-2 px-3 flex items-center gap-1.5" onClick={() => setShowNewDisc(true)}>
                      <Plus className="w-3.5 h-3.5" /> New Topic
                    </button>
                  </div>
                  {showNewDisc && (
                    <div className="bg-white dark:bg-zinc-900 border border-indigo-500/30 rounded-2xl p-4">
                      <input value={newDiscTitle} onChange={e => setNewDiscTitle(e.target.value)} placeholder="What's your question or topic?" className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500 mb-3 placeholder:text-zinc-400" />
                      <div className="flex gap-2">
                        <button onClick={() => setShowNewDisc(false)} className="btn-secondary py-2 text-sm flex-1">Cancel</button>
                        <button onClick={() => { setShowNewDisc(false); toast.success('Discussion topic posted!'); setNewDiscTitle(''); }} className="btn-primary py-2 text-sm flex-1">Post</button>
                      </div>
                    </div>
                  )}
                  {data.discussion.map((d, i) => (
                    <motion.div key={d.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 hover:border-indigo-500/30 transition-all cursor-pointer group"
                      onClick={() => toast.info(`Opening: ${d.title}`)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {d.resolved && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                            <h4 className="font-bold text-zinc-900 dark:text-white text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{d.title}</h4>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-zinc-400">
                            <span>by {d.author}</span>
                            <span>·</span>
                            <span>{d.replies} replies</span>
                            <span>·</span>
                            <span>{d.time}</span>
                          </div>
                        </div>
                        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap',
                          d.resolved ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700'
                        )}>
                          {d.resolved ? 'Resolved' : 'Open'}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* ── ACTIVITY STREAM ───────────── */}
              {activeTab === 'activity' && (
                <div className="max-w-3xl mx-auto space-y-3">
                  <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Activity className="w-4 h-4 text-indigo-500" /> Activity Stream</h3>
                  {data.activity.map((a, i) => {
                    const Icon = a.icon;
                    return (
                      <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}
                        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-4 h-4 text-indigo-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-zinc-900 dark:text-white">{a.user}</span>
                          <span className="text-sm text-zinc-500"> {a.action} </span>
                          <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400 truncate">{a.item}</span>
                        </div>
                        <span className="text-xs text-zinc-400 whitespace-nowrap">{a.time}</span>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {/* ── MESSAGES ──────────────────── */}
              {activeTab === 'messages' && (
                <div className="max-w-2xl mx-auto h-[500px] flex flex-col">
                  <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-4"><Send className="w-4 h-4 text-indigo-500" /> Message Instructor</h3>
                  <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3 bg-zinc-50 dark:bg-zinc-800/50">
                      <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-sm font-bold text-indigo-500">
                        {selectedCourse.instructor.split(' ').map((w: string) => w[0]).join('')}
                      </div>
                      <div>
                        <p className="font-bold text-zinc-900 dark:text-white text-sm">{selectedCourse.instructor}</p>
                        <p className="text-xs text-emerald-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> Online</p>
                      </div>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto space-y-4">
                      {[
                        { from: 'instructor', text: 'Hello! Feel free to ask me any questions about the course material.', time: '2 days ago', read: true },
                        { from: 'me', text: 'Thank you Professor! I had a question about the midterm scope.', time: '2 days ago', read: true },
                        { from: 'instructor', text: 'Sure! The midterm covers chapters 1–8. Focus on time complexity and graph traversal.', time: '2 days ago', read: true },
                        { from: 'me', text: 'Professor, can you clarify the midterm scope for dynamic programming?', time: '15m ago', read: false }
                      ].map((m, i) => (
                        <div key={i} className={cn('flex', m.from === 'me' ? 'justify-end' : 'justify-start')}>
                          <div className={cn('max-w-[70%] px-4 py-2.5 rounded-2xl text-sm', m.from === 'me' ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-bl-sm')}>
                            <p>{m.text}</p>
                            <div className={cn('text-[10px] mt-1.5 flex items-center gap-1 justify-end', m.from === 'me' ? 'text-white/70' : 'text-zinc-400')}>
                              <span>{m.time}</span>
                              {m.from === 'me' && (
                                <div className="flex">
                                  <CheckCircle2 className="w-3 h-3 text-white/50" />
                                  {m.read && <CheckCircle2 className="w-3 h-3 text-white -ml-1.5" />}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex gap-2">
                      <input value={messageText} onChange={e => setMessageText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                        placeholder={`Message ${selectedCourse.instructor}...`}
                        className="flex-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500 placeholder:text-zinc-400" />
                      <button onClick={handleSendMessage} className="btn-primary p-2.5 aspect-square flex items-center justify-center">
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── CALENDAR ──────────────────── */}
              {activeTab === 'calendar' && (
                <div className="max-w-3xl mx-auto space-y-4">
                  <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Calendar className="w-4 h-4 text-indigo-500" /> Course Calendar</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {calendarEvents.map((e, i) => (
                      <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center gap-4 hover:border-indigo-500/30 transition-all cursor-pointer">
                        <div className={`w-10 h-10 rounded-xl ${e.color} flex items-center justify-center flex-shrink-0`}>
                          <Calendar className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="font-bold text-zinc-900 dark:text-white text-sm">{e.title}</p>
                          <p className="text-xs text-zinc-400">{e.date}</p>
                        </div>
                        <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 capitalize">{e.type}</span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── TOOLS ─────────────────────── */}
              {activeTab === 'tools' && (
                <div className="max-w-3xl mx-auto">
                  <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-4"><Briefcase className="w-4 h-4 text-indigo-500" /> Tools & Portfolio</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { icon: Bookmark, title: 'My Portfolio', desc: 'Showcase your projects and achievements', color: '#6366f1', action: 'Open Portfolio' },
                      { icon: Target, title: 'Goal Performance', desc: 'Track your academic and personal goals', color: '#10b981', action: 'View Goals' },
                      { icon: Layers, title: 'Content Collection', desc: 'Saved articles, resources, and bookmarks', color: '#a855f7', action: 'Browse Collection' },
                      { icon: Award, title: 'Certifications', desc: 'View and download your course certificates', color: '#f59e0b', action: 'View Certificates' },
                      { icon: Users, title: 'Application Auth', desc: 'Manage authorized apps and integrations', color: '#3b82f6', action: 'Manage Apps' },
                      { icon: BarChart3, title: 'Progress Analytics', desc: 'Detailed breakdown of your learning journey', color: '#ec4899', action: 'View Analytics' },
                    ].map((tool, i) => {
                      const Icon = tool.icon;
                      return (
                        <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 hover:border-indigo-500/30 hover:shadow-sm transition-all cursor-pointer group"
                          onClick={() => toast.info(`Opening ${tool.title}...`)}>
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${tool.color}18` }}>
                              <Icon className="w-5 h-5" style={{ color: tool.color }} />
                            </div>
                            <h4 className="font-bold text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{tool.title}</h4>
                          </div>
                          <p className="text-xs text-zinc-500 mb-3">{tool.desc}</p>
                          <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                            {tool.action} <ChevronRight className="w-3.5 h-3.5" />
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Goals section */}
                  <div className="mt-6">
                    <h4 className="font-bold text-zinc-900 dark:text-white mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-emerald-500" /> Active Goals</h4>
                    <div className="space-y-3">
                      {data.goals.map((g, i) => (
                        <div key={g.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-zinc-900 dark:text-white">{g.title}</span>
                            <span className="text-xs text-zinc-400">Due {g.due}</span>
                          </div>
                          <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${g.progress}%` }} transition={{ duration: 0.8, delay: i * 0.1 }}
                              className="h-full rounded-full bg-emerald-500" />
                          </div>
                          <div className="text-xs text-zinc-400 mt-1 text-right">{g.progress}% complete</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      {/* Submission Modal */}
      <AnimatePresence>
        {submissionModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm"
              onClick={() => !isSubmitting && setSubmissionModal(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-lg bg-white dark:bg-[#09090b] rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 z-[70] overflow-hidden flex flex-col"
            >
              <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-zinc-900 dark:text-white">Submit Assignment</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">{submissionModal.title}</p>
                </div>
                <button onClick={() => !isSubmitting && setSubmissionModal(null)} className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-2xl p-8 flex flex-col items-center justify-center text-center bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer group">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">Click to upload or drag and drop</p>
                  <p className="text-xs text-zinc-500">PDF, DOCX, ZIP up to 50MB</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">Additional Comments (Optional)</label>
                  <textarea 
                    rows={3} 
                    placeholder="Any notes for the instructor..."
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500 placeholder:text-zinc-500 resize-none"
                  />
                </div>
              </div>

              <div className="p-5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex justify-end gap-3">
                <button 
                  onClick={() => setSubmissionModal(null)} 
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    setIsSubmitting(true);
                    setTimeout(() => {
                      const course = BLACKBOARD_DATA[selectedCourse.code];
                      const asmt = course.assignments.find(a => a.id === submissionModal.id);
                      if (asmt) {
                        asmt.status = 'submitted';
                      }
                      setRenderTrigger(r => r + 1);
                      setIsSubmitting(false);
                      setSubmissionModal(null);
                      toast.success('Assignment submitted successfully!');
                    }, 1500);
                  }} 
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 transition-all flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Submitting...</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4" /> Submit Assignment</>
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

'use client';
import { useState, useOptimistic, useEffect } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import {
  BookOpen, FileText, Search, MessageSquare, Bell, Calendar,
  Download, ExternalLink, Pin, Star, Clock, Users, ChevronRight,
  Upload, Video, Activity, Briefcase, Target, Plus, X, Send,
  CheckCircle2, AlertCircle, BarChart3, Layers, Award, Bookmark, UploadCloud, PenTool
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';

const CollaborationWhiteboard = dynamic(
  () => import('@/components/dashboard/CollaborationWhiteboard').then(mod => mod.CollaborationWhiteboard),
  { ssr: false, loading: () => <div className="h-[600px] w-full bg-zinc-100 dark:bg-zinc-900 animate-pulse rounded-2xl flex items-center justify-center text-zinc-500">Loading Whiteboard...</div> }
);

// ─── Mock Data ────────────────────────────────────────────────────────────────

// Mock data removed in favor of real API calls

const TABS = [
  { id: 'board', label: 'Board', icon: Pin },
  { id: 'resources', label: 'Resources', icon: FileText },
  { id: 'research', label: 'Research', icon: BookOpen },
  { id: 'assignments', label: 'Assignments', icon: CheckCircle2 },
  { id: 'quizzes', label: 'Quiz Results', icon: Star },
  { id: 'discussion', label: 'Discussion', icon: MessageSquare },
  { id: 'whiteboard', label: 'Whiteboard', icon: PenTool },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'messages', label: 'Messages', icon: Send },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'tools', label: 'Tools', icon: Briefcase },
];



// ─── Component ────────────────────────────────────────────────────────────────

export function StudentBlackboardClient({ initialCourse }: { initialCourse: any }) {
  const { data: enrollments, isLoading: isCoursesLoading } = useSWR('/courses/my', fetcher, { fallbackData: [] });
  
  const hasRealCourses = enrollments && enrollments.length > 0;
  const courses = hasRealCourses 
    ? enrollments.map((e: any) => e.course) 
    : [
        { id: 'c1', code: 'CS 301', name: 'Data Structures and Algorithms', color: '#6366f1', teacher: { name: 'Dr. Smith' }, _count: { enrollments: 42 }, instructor: 'Dr. Smith' },
        { id: 'c2', code: 'PHY 101', name: 'Physics I', color: '#10b981', teacher: { name: 'Prof. Johnson' }, _count: { enrollments: 120 }, instructor: 'Prof. Johnson' }
      ];
  
  const [selectedCourse, setSelectedCourse] = useState(initialCourse || null);
  
  useEffect(() => {
    if (!selectedCourse && courses.length > 0) {
      setSelectedCourse(courses[0]);
    }
  }, [courses, selectedCourse]);

  const [activeTab, setActiveTab] = useState('board');
  const [messageText, setMessageText] = useState('');
  const [newDiscTitle, setNewDiscTitle] = useState('');
  const [showNewDisc, setShowNewDisc] = useState(false);
  const [submissionModal, setSubmissionModal] = useState<any>(null);
  const [quizReviewModal, setQuizReviewModal] = useState<any>(null);
  const [discussionModal, setDiscussionModal] = useState<any>(null);
  const [toolModal, setToolModal] = useState<any>(null);
  const [selectedInstructor, setSelectedInstructor] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [renderTrigger, setRenderTrigger] = useState(0);

  const { data: blackboardData, isLoading: isDataLoading } = useSWR(
    selectedCourse && hasRealCourses ? `/blackboard/${selectedCourse.id}` : null,
    fetcher
  );

  const data = blackboardData ? {
    announcements: blackboardData.announcements.map((a: any) => ({
      id: a.id,
      pinned: false,
      title: a.title,
      body: a.content,
      author: a.author?.name || 'Instructor',
      time: new Date(a.createdAt).toLocaleDateString(),
      priority: 'normal'
    })),
    resources: blackboardData.resources.map((r: any) => ({
      id: r.id,
      week: 'General',
      title: r.title,
      type: r.type || 'File',
      size: 'Unknown',
      icon: FileText,
      color: '#6366f1',
      pinned: false
    })),
    research: [],
    assignments: blackboardData.assignments.map((a: any) => ({
      id: a.id,
      title: a.title,
      due: a.dueDate ? new Date(a.dueDate).toLocaleDateString() : 'No Due Date',
      status: 'pending',
      score: null,
      maxScore: a.totalMarks || 100,
      description: a.description || 'No description provided.'
    })),
    discussion: [],
    activity: [],
    quizResults: blackboardData.quizResults.map((q: any) => ({
      id: q.id,
      title: q.quiz.title,
      date: new Date(q.createdAt).toLocaleDateString(),
      score: q.score,
      maxScore: q.quiz.totalMarks || 100,
      questions: q.answers?.length || 0,
      timeTaken: 'N/A'
    })),
    goals: [],
    calendarEvents: blackboardData.calendarEvents.map((c: any) => ({
      date: new Date(c.startTime).toLocaleDateString(),
      title: c.title,
      type: 'event',
      color: 'bg-indigo-500'
    }))
  } : {
    announcements: [
      { id: '1', pinned: true, title: 'Welcome to ' + (selectedCourse?.code || 'Course'), body: 'Please review the syllabus and join the first lecture.', author: selectedCourse?.teacher?.name || 'Instructor', time: 'Today', priority: 'high' }
    ],
    resources: [
      { id: '1', week: 'Week 1', title: 'Syllabus.pdf', type: 'PDF', size: '2.4 MB', icon: FileText, color: '#ef4444', pinned: true }
    ],
    research: [],
    assignments: [
      { id: '1', title: 'Programming Assignment 1', due: 'Next Friday', status: 'pending', score: null, maxScore: 100, description: 'Implement a binary search tree.' }
    ],
    discussion: [
      { id: '1', title: 'Question about Assignment 1', author: 'Alice', replies: 3, time: '2h ago', resolved: false }
    ],
    activity: [
      { user: selectedCourse?.teacher?.name || 'Instructor', action: 'posted a new announcement in', item: selectedCourse?.code || 'Course', time: '2h ago', icon: Bell }
    ],
    quizResults: [],
    goals: [],
    calendarEvents: []
  };

  const [optimisticAssignments, addOptimisticAssignment] = useOptimistic(
    data.assignments,
    (state: any[], updatedAssignment: any) => {
      return state.map(a => a.id === updatedAssignment.id ? { ...a, ...updatedAssignment } : a);
    }
  );

  const handleSendMessage = () => {
    if (!messageText.trim()) return;
    toast.success('Message sent to ' + (selectedCourse?.teacher?.name || 'Instructor'));
    setMessageText('');
  };

  if (isCoursesLoading) return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!selectedCourse) return <div className="p-8">No courses available.</div>;

  return (
    <>
      <Topbar title="Blackboard" subtitle="Course resources, research, assignments & more." />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Course Selector */}
        <div className="border-b border-zinc-200 dark:border-white/[0.06] bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl px-4 sm:px-8 py-3 flex gap-2 overflow-x-auto scrollbar-none">
          {courses.map((c: any) => (
            <button
              key={c.id}
              onClick={() => setSelectedCourse(c)}
              className={cn(
                'relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all border',
                selectedCourse.id === c.id
                  ? 'text-white shadow-lg border-transparent'
                  : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700'
              )}
            >
              {selectedCourse.id === c.id && (
                <motion.div
                  layoutId="activeCourseStudent"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: c.color || '#6366f1', boxShadow: `0 4px 14px ${c.color || '#6366f1'}40` }}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10 font-bold">{c.code}</span>
              <span className="relative z-10 hidden sm:inline opacity-75">{c.name?.split(' ').slice(0, 2).join(' ')}</span>
            </button>
          ))}
        </div>

        {/* Course Header */}
        <div className="px-4 sm:px-8 py-4 border-b border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900/40 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold" style={{ background: selectedCourse.color || '#6366f1' }}>
              {selectedCourse.code?.slice(-2)}
            </div>
            <div>
              <h2 className="font-bold text-zinc-900 dark:text-white">{selectedCourse.name}</h2>
              <p className="text-xs text-zinc-500">{selectedCourse.teacher?.name || 'Unknown Instructor'} · {selectedCourse._count?.enrollments || 0} Students</p>
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
          <div key={activeTab} className="h-full">

              {/* ── BOARD ────────────────────── */}
              {activeTab === 'board' && (
                <div className="max-w-3xl mx-auto space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Bell className="w-4 h-4 text-indigo-500" /> Announcements</h3>
                  </div>
                  {data.announcements.map((a, i) => (
                    <motion.div key={a.id} 
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
                      <motion.div key={r.id} 
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
                    <motion.div key={r.id} 
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
                  {optimisticAssignments.map((a: any, i: number) => (
                    <motion.div key={a.id} 
                      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h4 className="font-bold text-zinc-900 dark:text-white">{a.title}</h4>
                        <span className={cn('text-[10px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap',
                          a.status === 'graded' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                          a.status === 'submitted' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                          a.status === 'submitted_late' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                          'bg-amber-500/10 text-amber-500 border-amber-500/20'
                        )}>
                          {a.status === 'graded' ? `✓ ${a.score}/${a.maxScore}` : a.status === 'submitted' ? 'Submitted' : a.status === 'submitted_late' ? 'Late Submission' : 'Pending'}
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
                        {(a.status === 'submitted' || a.status === 'submitted_late') && (
                          <button className="btn-secondary text-xs py-1.5 px-4 opacity-50 cursor-not-allowed">
                            {a.status === 'submitted_late' ? 'Submitted Late' : 'Submitted'}
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
                    <motion.div key={q.id} 
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
                      <button className="btn-secondary text-xs py-1.5 px-3" onClick={() => setQuizReviewModal(q)}>Review</button>
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
                    <motion.div key={d.id} 
                      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 hover:border-indigo-500/30 transition-all cursor-pointer group"
                      onClick={() => setDiscussionModal(d)}>
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

              {/* ── WHITEBOARD ────────────────────── */}
              {activeTab === 'whiteboard' && (
                <div className="max-w-6xl mx-auto space-y-4 h-[650px]">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><PenTool className="w-4 h-4 text-indigo-500" /> Collaborative Whiteboard</h3>
                    <p className="text-xs text-zinc-500">Connected: 3 Members</p>
                  </div>
                  <CollaborationWhiteboard />
                </div>
              )}

              {/* ── ACTIVITY STREAM ───────────── */}
              {activeTab === 'activity' && (
                <div className="max-w-3xl mx-auto space-y-3">
                  <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Activity className="w-4 h-4 text-indigo-500" /> Activity Stream</h3>
                  {data.activity.map((a, i) => {
                    const Icon = a.icon;
                    return (
                      <motion.div key={i} 
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
                <div className="max-w-4xl mx-auto h-[600px] flex flex-col">
                  <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-4"><Send className="w-4 h-4 text-indigo-500" /> Course Messages</h3>
                  <div className="flex-1 flex bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
                    {/* Contacts Sidebar */}
                    <div className="w-1/3 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/30 flex flex-col">
                      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
                        <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Instructors & TAs</h4>
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        {[
                          { name: selectedCourse.instructor, role: 'Course Instructor', status: 'online', initials: selectedCourse.instructor.split(' ').map((w: string) => w[0]).join('') },
                          { name: 'Alice Chen', role: 'Teaching Assistant', status: 'offline', initials: 'AC' },
                          { name: 'Dr. Robert Smith', role: 'Department Head', status: 'offline', initials: 'RS' }
                        ].map((contact, i) => (
                          <div 
                            key={i} 
                            onClick={() => setSelectedInstructor(contact)}
                            className={cn('p-4 flex items-center gap-3 cursor-pointer transition-colors border-l-2', 
                              (!selectedInstructor && i === 0) || selectedInstructor?.name === contact.name ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800')}
                          >
                            <div className="relative">
                              <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-sm font-bold text-indigo-600 dark:text-indigo-400">
                                {contact.initials}
                              </div>
                              {contact.status === 'online' && <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-zinc-900 rounded-full" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{contact.name}</p>
                              <p className="text-xs text-zinc-500 truncate">{contact.role}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Chat Area */}
                    <div className="flex-1 flex flex-col">
                      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-white dark:bg-zinc-900">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-400">
                            {selectedInstructor ? selectedInstructor.initials : selectedCourse.instructor.split(' ').map((w: string) => w[0]).join('')}
                          </div>
                          <div>
                            <p className="font-bold text-zinc-900 dark:text-white text-sm">{selectedInstructor ? selectedInstructor.name : selectedCourse.instructor}</p>
                            <p className="text-xs text-zinc-500">{selectedInstructor ? selectedInstructor.role : 'Course Instructor'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-zinc-50/50 dark:bg-zinc-900/50">
                        {[
                          { from: 'instructor', text: 'Hello! Feel free to ask me any questions about the course material.', time: '2 days ago', read: true },
                          { from: 'me', text: 'Thank you! I had a question about the midterm scope.', time: '2 days ago', read: true },
                          { from: 'instructor', text: 'Sure! The midterm covers chapters 1–8. Focus on time complexity and graph traversal.', time: '2 days ago', read: true },
                          { from: 'me', text: 'Can you clarify the midterm scope for dynamic programming?', time: '15m ago', read: false }
                        ].map((m, i) => (
                          <div key={i} className={cn('flex', m.from === 'me' ? 'justify-end' : 'justify-start')}>
                            <div className={cn('max-w-[70%] px-4 py-2.5 rounded-2xl text-sm shadow-sm border', m.from === 'me' ? 'bg-indigo-600 border-indigo-600 text-white rounded-tr-sm' : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-tl-sm')}>
                              <p>{m.text}</p>
                              <div className={cn('text-[10px] mt-1 flex items-center gap-1 justify-end', m.from === 'me' ? 'text-white/70' : 'text-zinc-400')}>
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
                      <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex gap-2">
                        <input value={messageText} onChange={e => setMessageText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                          placeholder={`Message ${selectedInstructor ? selectedInstructor.name : selectedCourse.instructor}...`}
                          className="flex-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500 placeholder:text-zinc-400" />
                        <button onClick={handleSendMessage} className="btn-primary p-2.5 aspect-square flex items-center justify-center">
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── CALENDAR ──────────────────── */}
              {activeTab === 'calendar' && (
                <div className="max-w-3xl mx-auto space-y-4">
                  <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Calendar className="w-4 h-4 text-indigo-500" /> Course Calendar</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {data.calendarEvents.map((e, i) => (
                      <motion.div key={i} 
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
                        <motion.div key={i} 
                          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 hover:border-indigo-500/30 hover:shadow-sm transition-all cursor-pointer group"
                          onClick={() => setToolModal(tool)}>
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
                            <motion.div 
                              className="h-full rounded-full bg-emerald-500" />
                          </div>
                          <div className="text-xs text-zinc-400 mt-1 text-right">{g.progress}% complete</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

            </div>
        </div>
      </div>
      {/* Submission Modal */}
      <AnimatePresence>
        {submissionModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
              className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm"
              onClick={() => !isSubmitting && setSubmissionModal(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} 
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
                  onClick={async () => {
                    const asmtId = submissionModal.id;
                    const dueDate = new Date(submissionModal.due);
                    const now = new Date();
                    const isLate = dueDate < now;
                    const newStatus = isLate ? 'submitted_late' : 'submitted';

                    setSubmissionModal(null);
                    addOptimisticAssignment({ id: asmtId, status: newStatus });
                    toast.success(isLate ? 'Assignment submitted late!' : 'Assignment submitted successfully!');
                    
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    
                    const course = BLACKBOARD_DATA[selectedCourse.code];
                    const asmt = course.assignments.find(a => a.id === asmtId);
                    if (asmt) {
                      asmt.status = newStatus;
                    }
                    setRenderTrigger(r => r + 1);
                  }} 
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 transition-all flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" /> Submit Assignment
                </button>
              </div>
            </motion.div>
          </>
        )}
        {quizReviewModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm" onClick={() => setQuizReviewModal(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-2xl bg-white dark:bg-[#09090b] rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 z-[70] overflow-hidden flex flex-col max-h-[80vh]">
              <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-zinc-900 dark:text-white">Quiz Review</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">{quizReviewModal.title} - Score: {quizReviewModal.score}/{quizReviewModal.maxScore}</p>
                </div>
                <button onClick={() => setQuizReviewModal(null)} className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto space-y-6">
                {[1, 2, 3].map((num) => (
                  <div key={num} className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
                    <p className="font-semibold text-zinc-900 dark:text-white mb-4">Question {num}: What is the time complexity of a binary search?</p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        <span className="text-sm font-medium text-zinc-900 dark:text-white">O(log n) (Your Answer)</span>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 opacity-60">
                        <div className="w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-600" />
                        <span className="text-sm text-zinc-900 dark:text-white">O(n)</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}

        {discussionModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm" onClick={() => setDiscussionModal(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-2xl bg-white dark:bg-[#09090b] rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 z-[70] overflow-hidden flex flex-col max-h-[80vh]">
              <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-zinc-900 dark:text-white">{discussionModal.title}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">Posted by {discussionModal.author} · {discussionModal.time}</p>
                </div>
                <button onClick={() => setDiscussionModal(null)} className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto space-y-4">
                <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-700 dark:text-zinc-300">
                  Can someone explain the edge cases for Assignment 3? I am getting a segmentation fault on test case 4.
                </div>
                <div className="space-y-4 pl-4 border-l-2 border-zinc-200 dark:border-zinc-800">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-500 shrink-0">TA</div>
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3 rounded-xl text-sm flex-1">
                      <p className="font-bold mb-1">Teaching Assistant <span className="text-xs font-normal text-zinc-400">1 hr ago</span></p>
                      <p className="text-zinc-700 dark:text-zinc-300">Make sure you are handling the case where the graph is disconnected!</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex gap-2">
                <input placeholder="Type a reply..." className="flex-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500" />
                <button className="btn-primary p-2.5 aspect-square"><Send className="w-4 h-4" /></button>
              </div>
            </motion.div>
          </>
        )}

        {toolModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm" onClick={() => setToolModal(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-2xl bg-white dark:bg-[#09090b] rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 z-[70] overflow-hidden flex flex-col min-h-[400px]">
              <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${toolModal.color}18` }}>
                    <toolModal.icon className="w-5 h-5" style={{ color: toolModal.color }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-900 dark:text-white">{toolModal.title}</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">{toolModal.desc}</p>
                  </div>
                </div>
                <button onClick={() => setToolModal(null)} className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
                  <toolModal.icon className="w-10 h-10 text-zinc-400" />
                </div>
                <h4 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">{toolModal.title} Interface</h4>
                <p className="text-sm text-zinc-500 max-w-sm">This is a simulated view for {toolModal.title}. Integration with external provider pending.</p>
                <button onClick={() => setToolModal(null)} className="mt-6 btn-primary">Close Tool</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

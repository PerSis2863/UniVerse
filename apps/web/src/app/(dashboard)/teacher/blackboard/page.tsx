'use client';
import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import {
  BookOpen, FileText, Plus, X, Upload, Pin, Bell, Users, Search,
  Trash2, Edit3, ChevronRight, Send, MessageSquare, Calendar, Star,
  BarChart3, CheckCircle2, Activity, Target, Video, Link as LinkIcon,
  ExternalLink, Download, Bookmark, Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const COURSES = [
  { code: 'CS301', name: 'Data Structures & Algorithms', students: 45, color: '#6366f1' },
  { code: 'CS302', name: 'Operating Systems', students: 52, color: '#a855f7' },
  { code: 'CS303', name: 'Database Management', students: 38, color: '#10b981' },
];

const TEACHER_TABS = [
  { id: 'board', label: 'Board', icon: Pin },
  { id: 'resources', label: 'Resources', icon: FileText },
  { id: 'research', label: 'Research', icon: BookOpen },
  { id: 'assignments', label: 'Assignments', icon: CheckCircle2 },
  { id: 'quizresults', label: 'Quiz Results', icon: Star },
  { id: 'discussion', label: 'Discussion', icon: MessageSquare },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'messages', label: 'Messages', icon: Send },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'tools', label: 'Tools', icon: Bookmark },
];

const MOCK_RESOURCES = [
  { id: 1, week: 'Week 1', title: 'Arrays & Linked Lists — Lecture Slides', type: 'PDF', size: '2.4 MB', pinned: true, downloads: 42 },
  { id: 2, week: 'Week 2', title: 'Sorting Algorithms — Video Lecture', type: 'Video', size: '240 MB', pinned: false, downloads: 38 },
  { id: 3, week: 'Week 3', title: 'Trees & Graphs — Reference Sheet', type: 'PDF', size: '1.1 MB', pinned: false, downloads: 29 },
];

const STUDENT_MSGS = [
  { id: 1, name: 'Aditya Bhatt', avatar: 'AB', text: 'Professor, can you clarify the midterm scope for dynamic programming?', time: '15m ago', unread: true },
  { id: 2, name: 'Priya Sharma', avatar: 'PS', text: 'Thank you for the notes! Very helpful.', time: '2h ago', unread: false },
  { id: 3, name: 'Rahul Kumar', avatar: 'RK', text: 'I had a question about the complexity of Dijkstra...', time: '4h ago', unread: true },
];

const QUIZ_RESULTS = [
  { name: 'Aditya Bhatt', score: 92, quiz: 'Graph Algorithms Quiz', date: 'Sept 15' },
  { name: 'Priya Sharma', score: 88, quiz: 'Graph Algorithms Quiz', date: 'Sept 15' },
  { name: 'Rahul Kumar', score: 76, quiz: 'Graph Algorithms Quiz', date: 'Sept 15' },
  { name: 'Sneha Patel', score: 95, quiz: 'Graph Algorithms Quiz', date: 'Sept 15' },
];

export default function TeacherBlackboardPage() {
  const [selectedCourse, setSelectedCourse] = useState(COURSES[0]);
  const [activeTab, setActiveTab] = useState('board');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadWeek, setUploadWeek] = useState('Week 1');
  const [uploadType, setUploadType] = useState('PDF');
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annPriority, setAnnPriority] = useState('normal');
  const [replyTo, setReplyTo] = useState<any>(null);
  const [replyText, setReplyText] = useState('');
  const [resources, setResources] = useState(MOCK_RESOURCES);
  const [announcements, setAnnouncements] = useState([
    { id: 1, pinned: true, title: 'Midterm Exam Details', body: 'The midterm will cover chapters 1–8. Open book, 90 minutes. Room: Main Hall A.', time: '2 hours ago', priority: 'high' },
    { id: 2, pinned: false, title: 'Office Hours This Week', body: 'Office hours moved to Wednesday 3–5 PM due to faculty meeting.', time: '1 day ago', priority: 'normal' },
  ]);

  const handlePostAnnouncement = () => {
    if (!annTitle) return toast.error('Please add a title');
    setAnnouncements(prev => [{ id: Date.now(), pinned: annPriority === 'high', title: annTitle, body: annBody, time: 'Just now', priority: annPriority }, ...prev]);
    setShowAnnouncementModal(false);
    setAnnTitle(''); setAnnBody('');
    toast.success('Announcement posted to all students!');
  };

  const handleUpload = () => {
    if (!uploadTitle) return toast.error('Please add a file title');
    setResources(prev => [...prev, { id: Date.now(), week: uploadWeek, title: uploadTitle, type: uploadType, size: '—', pinned: false, downloads: 0 }]);
    setShowUploadModal(false);
    setUploadTitle('');
    toast.success('Resource uploaded to Blackboard!');
  };

  return (
    <>
      <Topbar title="Blackboard" subtitle="Manage course resources, announcements & student interaction." />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Course Selector */}
        <div className="border-b border-zinc-200 dark:border-white/[0.06] bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl px-4 sm:px-8 py-3 flex gap-2 overflow-x-auto scrollbar-none">
          {COURSES.map(c => (
            <button key={c.code} onClick={() => setSelectedCourse(c)}
              className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all border',
                selectedCourse.code === c.code ? 'text-white shadow-lg border-transparent' : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400')}
              style={selectedCourse.code === c.code ? { background: c.color, boxShadow: `0 4px 14px ${c.color}40` } : {}}>
              <span className="font-bold">{c.code}</span>
              <span className="hidden sm:inline opacity-75">{c.name.split(' ').slice(0, 2).join(' ')}</span>
            </button>
          ))}
        </div>

        {/* Course Header + actions */}
        <div className="px-4 sm:px-8 py-4 border-b border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900/40 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold" style={{ background: selectedCourse.color }}>
              {selectedCourse.code.slice(-2)}
            </div>
            <div>
              <h2 className="font-bold text-zinc-900 dark:text-white">{selectedCourse.name}</h2>
              <p className="text-xs text-zinc-500">{selectedCourse.students} Students enrolled</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary text-xs py-2 flex items-center gap-1.5" onClick={() => setShowAnnouncementModal(true)}>
              <Bell className="w-3.5 h-3.5" /> Post Announcement
            </button>
            <button className="btn-primary text-xs py-2 flex items-center gap-1.5" onClick={() => setShowUploadModal(true)}>
              <Upload className="w-3.5 h-3.5" /> Upload Resource
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto scrollbar-none border-b border-zinc-200 dark:border-white/[0.06] bg-white/80 dark:bg-zinc-900/60 px-4 sm:px-8">
          {TEACHER_TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={cn('flex items-center gap-1.5 px-3 py-3.5 text-xs font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors',
                  activeTab === tab.id ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white')}>
                <Icon className="w-3.5 h-3.5" /> {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-zinc-50 dark:bg-zinc-950/40">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>

              {/* BOARD */}
              {activeTab === 'board' && (
                <div className="max-w-3xl mx-auto space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Bell className="w-4 h-4 text-indigo-500" /> Announcements</h3>
                    <button onClick={() => setShowAnnouncementModal(true)} className="btn-primary text-xs py-2 px-3 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> New</button>
                  </div>
                  {announcements.map((a, i) => (
                    <motion.div key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                      className={cn('bg-white dark:bg-zinc-900 border rounded-2xl p-5', a.priority === 'high' ? 'border-rose-500/30' : 'border-zinc-200 dark:border-zinc-800')}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {a.pinned && <Pin className="w-3.5 h-3.5 text-rose-500" />}
                          {a.priority === 'high' && <span className="text-[10px] font-bold bg-rose-500/10 text-rose-500 px-2 py-0.5 rounded-full border border-rose-500/20">IMPORTANT</span>}
                          <h4 className="font-bold text-zinc-900 dark:text-white">{a.title}</h4>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-zinc-400 whitespace-nowrap">{a.time}</span>
                          <button className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors" onClick={() => { setAnnouncements(prev => prev.filter(x => x.id !== a.id)); toast.info('Announcement removed.'); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">{a.body}</p>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* RESOURCES */}
              {activeTab === 'resources' && (
                <div className="max-w-3xl mx-auto space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-500" /> Course Materials</h3>
                    <button onClick={() => setShowUploadModal(true)} className="btn-primary text-xs py-2 px-3 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Upload</button>
                  </div>
                  {resources.map((r, i) => (
                    <motion.div key={r.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center gap-4 hover:border-indigo-500/30 transition-all group">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-indigo-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-zinc-900 dark:text-white text-sm truncate">{r.title}</p>
                          {r.pinned && <Pin className="w-3 h-3 text-indigo-500 flex-shrink-0" />}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-zinc-400">
                          <span>{r.week}</span>
                          <span className="px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-medium">{r.type}</span>
                          <span>{r.size}</span>
                          <span className="flex items-center gap-0.5"><Download className="w-3 h-3" /> {r.downloads}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-indigo-500 transition-colors" onClick={() => toast.info(`Editing ${r.title}`)}>
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-rose-500 transition-colors" onClick={() => { setResources(prev => prev.filter(x => x.id !== r.id)); toast.info('Resource removed.'); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* QUIZ RESULTS */}
              {activeTab === 'quizresults' && (
                <div className="max-w-3xl mx-auto space-y-4">
                  <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Star className="w-4 h-4 text-indigo-500" /> Quiz Results Published to Students</h3>
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
                    <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                      <h4 className="font-bold text-zinc-900 dark:text-white">Graph Algorithms Quiz — Sept 15, 2026</h4>
                      <span className="text-xs bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">Published</span>
                    </div>
                    {QUIZ_RESULTS.map((r, i) => (
                      <div key={i} className="flex items-center gap-4 p-4 border-b border-zinc-100 dark:border-zinc-800/50 last:border-0">
                        <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-xs font-bold text-indigo-500">
                          {r.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-zinc-900 dark:text-white">{r.name}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="h-1.5 w-24 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${r.score}%` }} />
                          </div>
                          <span className={cn('text-sm font-bold', r.score >= 90 ? 'text-emerald-500' : r.score >= 75 ? 'text-blue-500' : 'text-amber-500')}>{r.score}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {[{ label: 'Average', value: '87.75%', color: 'text-indigo-500' }, { label: 'Highest', value: '95%', color: 'text-emerald-500' }, { label: 'Lowest', value: '76%', color: 'text-amber-500' }].map((s, i) => (
                      <div key={i} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 text-center">
                        <div className={cn('text-2xl font-black', s.color)}>{s.value}</div>
                        <div className="text-xs text-zinc-500 mt-1">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* MESSAGES */}
              {activeTab === 'messages' && (
                <div className="max-w-2xl mx-auto">
                  <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-4"><Send className="w-4 h-4 text-indigo-500" /> Student Messages</h3>
                  <div className="space-y-3">
                    {STUDENT_MSGS.map((m, i) => (
                      <div key={m.id} className={cn('bg-white dark:bg-zinc-900 border rounded-2xl p-4 cursor-pointer hover:border-indigo-500/30 transition-all', m.unread ? 'border-indigo-500/30' : 'border-zinc-200 dark:border-zinc-800')} onClick={() => setReplyTo(m)}>
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-full bg-indigo-500/10 flex items-center justify-center text-xs font-bold text-indigo-500 flex-shrink-0">{m.avatar}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className={cn('text-sm font-semibold text-zinc-900 dark:text-white', m.unread && 'text-indigo-600 dark:text-indigo-400')}>{m.name}</span>
                              <span className="text-xs text-zinc-400">{m.time}</span>
                            </div>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5 truncate">{m.text}</p>
                          </div>
                          {m.unread && <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />}
                        </div>
                        {replyTo?.id === m.id && (
                          <div className="mt-3 flex gap-2">
                            <input value={replyText} onChange={e => setReplyText(e.target.value)} placeholder={`Reply to ${m.name}...`}
                              className="flex-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500 text-zinc-900 dark:text-white placeholder:text-zinc-400" />
                            <button onClick={(e) => { e.stopPropagation(); toast.success(`Reply sent to ${m.name}!`); setReplyTo(null); setReplyText(''); }} className="btn-primary px-3 py-2 text-sm flex items-center gap-1.5">
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ACTIVITY */}
              {activeTab === 'activity' && (
                <div className="max-w-3xl mx-auto space-y-3">
                  <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Activity className="w-4 h-4 text-indigo-500" /> Course Activity Stream</h3>
                  {[
                    { icon: Bell, text: 'You posted: "Midterm Exam Details"', time: '2h ago' },
                    { icon: Star, text: 'Quiz results published for "Graph Algorithms"', time: '3h ago' },
                    { icon: Upload, text: 'You uploaded "Hash Tables — Lecture Recording"', time: '4h ago' },
                    { icon: MessageSquare, text: 'New discussion: "Dijkstra vs Bellman-Ford" by Ravi M.', time: '5h ago' },
                    { icon: CheckCircle2, text: 'Priya Sharma submitted Assignment 2', time: '1d ago' },
                  ].map((a, i) => {
                    const Icon = a.icon;
                    return (
                      <div key={i} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0"><Icon className="w-4 h-4 text-indigo-500" /></div>
                        <span className="text-sm text-zinc-700 dark:text-zinc-300 flex-1">{a.text}</span>
                        <span className="text-xs text-zinc-400 whitespace-nowrap">{a.time}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* CALENDAR */}
              {activeTab === 'calendar' && (
                <div className="max-w-3xl mx-auto space-y-4">
                  <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Calendar className="w-4 h-4 text-indigo-500" /> Course Calendar</h3>
                  {[
                    { date: 'Oct 5', title: 'Assignment 3 Due', type: 'assignment', color: 'bg-amber-500' },
                    { date: 'Oct 10', title: 'Midterm Exam', type: 'exam', color: 'bg-rose-500' },
                    { date: 'Oct 15', title: 'Office Hours', type: 'office', color: 'bg-indigo-500' },
                    { date: 'Oct 22', title: 'Pop Quiz', type: 'quiz', color: 'bg-purple-500' },
                  ].map((e, i) => (
                    <div key={i} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center gap-4 hover:border-indigo-500/30 transition-all">
                      <div className={`w-10 h-10 rounded-xl ${e.color} flex items-center justify-center flex-shrink-0`}><Calendar className="w-5 h-5 text-white" /></div>
                      <div className="flex-1">
                        <p className="font-bold text-zinc-900 dark:text-white text-sm">{e.title}</p>
                        <p className="text-xs text-zinc-400">{e.date}</p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 capitalize">{e.type}</span>
                      <button className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-rose-500 transition-colors" onClick={() => toast.info('Edit event...')}><Edit3 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}

              {/* TOOLS */}
              {activeTab === 'tools' && (
                <div className="max-w-3xl mx-auto">
                  <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-4"><Bookmark className="w-4 h-4 text-indigo-500" /> Instructor Tools</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { icon: BarChart3, title: 'Grade Analytics', desc: 'View grade distributions and class performance trends', color: '#6366f1' },
                      { icon: Users, title: 'Roster Management', desc: 'Manage enrolled students, add/remove', color: '#a855f7' },
                      { icon: Target, title: 'Learning Outcomes', desc: 'Track and update course objectives', color: '#10b981' },
                      { icon: Award, title: 'Certificate Generator', desc: 'Issue completion certificates to students', color: '#f59e0b' },
                      { icon: LinkIcon, title: 'Content Collection', desc: 'Organize and curate course content', color: '#3b82f6' },
                      { icon: Video, title: 'Recorded Lectures', desc: 'Manage and publish recorded sessions', color: '#ec4899' },
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
                          <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">Open <ChevronRight className="w-3.5 h-3.5" /></div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* RESEARCH, ASSIGNMENTS, DISCUSSION tabs - same as student view */}
              {['research', 'assignments', 'discussion'].includes(activeTab) && (
                <div className="max-w-3xl mx-auto flex items-center justify-center h-48 text-zinc-400 flex-col gap-3">
                  <BookOpen className="w-10 h-10 opacity-30" />
                  <p className="text-sm">Content for this section matches the student view.</p>
                  <button className="btn-primary text-xs py-2 px-4" onClick={() => toast.info('Loading content...')}>Load Content</button>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Upload Resource Modal */}
      <AnimatePresence>
        {showUploadModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowUploadModal(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-zinc-900 dark:text-white text-lg flex items-center gap-2"><Upload className="w-5 h-5 text-indigo-500" /> Upload Resource</h3>
                <button onClick={() => setShowUploadModal(false)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Title / Description</label>
                  <input value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} placeholder="e.g. Week 6 — Binary Search Trees" className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500 placeholder:text-zinc-400" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Week</label>
                    <select value={uploadWeek} onChange={e => setUploadWeek(e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500">
                      {Array.from({ length: 8 }, (_, i) => `Week ${i + 1}`).map(w => <option key={w}>{w}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Type</label>
                    <select value={uploadType} onChange={e => setUploadType(e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500">
                      {['PDF', 'Video', 'DOCX', 'Slides', 'Link'].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-500/50 transition-colors" onClick={() => toast.info('File picker opening...')}>
                  <Upload className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500">Click to select file or drag & drop</p>
                  <p className="text-xs text-zinc-400 mt-1">PDF, Video, DOCX, Slides, Link</p>
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={() => setShowUploadModal(false)} className="flex-1 btn-secondary py-2.5 text-sm">Cancel</button>
                <button onClick={handleUpload} className="flex-1 btn-primary py-2.5 text-sm flex items-center justify-center gap-2"><Upload className="w-4 h-4" /> Upload</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Announcement Modal */}
      <AnimatePresence>
        {showAnnouncementModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowAnnouncementModal(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-zinc-900 dark:text-white text-lg flex items-center gap-2"><Bell className="w-5 h-5 text-indigo-500" /> New Announcement</h3>
                <button onClick={() => setShowAnnouncementModal(false)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Title</label>
                  <input value={annTitle} onChange={e => setAnnTitle(e.target.value)} placeholder="e.g. Exam Tomorrow — Important Update" className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500 placeholder:text-zinc-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Message</label>
                  <textarea value={annBody} onChange={e => setAnnBody(e.target.value)} placeholder="Write your announcement..." rows={4} className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500 resize-none placeholder:text-zinc-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Priority</label>
                  <div className="flex gap-2">
                    {[{ id: 'normal', label: 'Normal' }, { id: 'high', label: 'Important' }].map(p => (
                      <button key={p.id} onClick={() => setAnnPriority(p.id)} className={cn('flex-1 py-2 rounded-xl text-sm font-medium border transition-colors', annPriority === p.id ? (p.id === 'high' ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400') : 'border-zinc-200 dark:border-zinc-700 text-zinc-500')}>{p.label}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={() => setShowAnnouncementModal(false)} className="flex-1 btn-secondary py-2.5 text-sm">Cancel</button>
                <button onClick={handlePostAnnouncement} className="flex-1 btn-primary py-2.5 text-sm flex items-center justify-center gap-2"><Bell className="w-4 h-4" /> Post to All Students</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

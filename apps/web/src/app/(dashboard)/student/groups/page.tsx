'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Users, MessageSquare, FileText, Search, Plus, MoreHorizontal, Hash, BookOpen, Star, X, ChevronRight, Upload, Video, Calendar, Send, Mic, MicOff, VideoOff, PhoneOff, Paperclip, Download, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { toast } from 'sonner';

const groups = [
  { id: 1, name: 'OS Study Group', type: 'Study', members: 12, latestActivity: 'Alex shared Chapter_4_Notes.pdf', time: '10m ago', unread: 3, color: 'from-blue-500 to-indigo-600', initials: 'OS', completion: 68, avatars: ['AK','BL','CR','DM'] },
  { id: 2, name: 'Web App Hackathon', type: 'Project', members: 4, latestActivity: 'Sarah pushed to main branch', time: '1h ago', unread: 0, color: 'from-fuchsia-500 to-pink-600', initials: 'WH', completion: 42, avatars: ['SK','JP','RM','TN'] },
  { id: 3, name: 'Clean Water Initiative', type: 'Impact', members: 28, latestActivity: 'Dr. Evans: Meeting at 5PM today', time: '2h ago', unread: 12, color: 'from-emerald-500 to-teal-600', initials: 'CW', completion: 81, avatars: ['DE','LF','GM','HO'] },
  { id: 4, name: 'AI Research Collective', type: 'Research', members: 9, latestActivity: 'New paper shared: LLM Reasoning', time: '4h ago', unread: 2, color: 'from-amber-500 to-orange-600', initials: 'AI', completion: 55, avatars: ['PA','QB','RC','SD'] },
];

const feed = [
  { id: 1, user: 'Alex Chen', initials: 'AC', group: 'OS Study Group', groupColor: 'text-blue-400', action: 'shared a file', item: 'Chapter_4_Notes.pdf', itemType: 'file', time: '10 mins ago', color: 'bg-blue-500/10 text-blue-500' },
  { id: 2, user: 'Sarah Kim', initials: 'SK', group: 'Web App Hackathon', groupColor: 'text-fuchsia-400', action: 'commented', item: '"We should use Next.js for this."', itemType: 'comment', time: '1 hour ago', color: 'bg-fuchsia-500/10 text-fuchsia-500' },
  { id: 3, user: 'Dr. Evans', initials: 'DE', group: 'Clean Water Initiative', groupColor: 'text-emerald-400', action: 'scheduled an event', item: 'Weekly Sync — Monday 5:00 PM', itemType: 'event', time: '2 hours ago', color: 'bg-emerald-500/10 text-emerald-500' },
  { id: 4, user: 'Prof. Rao', initials: 'PR', group: 'AI Research Collective', groupColor: 'text-amber-400', action: 'shared a research paper', item: 'LLM Reasoning at Scale — Arxiv 2026', itemType: 'research', time: '4 hours ago', color: 'bg-amber-500/10 text-amber-500' },
  { id: 5, user: 'Rahul Kumar', initials: 'RK', group: 'OS Study Group', groupColor: 'text-blue-400', action: 'posted a quiz result', item: 'Memory Management Quiz — 91%', itemType: 'quiz', time: 'Yesterday', color: 'bg-indigo-500/10 text-indigo-500' },
];

const typeColors: Record<string, string> = {
  Study: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  Project: 'bg-fuchsia-500/10 text-fuchsia-500 border-fuchsia-500/20',
  Impact: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  Research: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
};

const itemIcons: Record<string, any> = {
  file: FileText, comment: MessageSquare, event: Calendar, research: BookOpen, quiz: Star
};

const TABS = ['All', 'Study', 'Project', 'Impact', 'Research'];

export default function GroupsPage() {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<typeof groups[0] | null>(null);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState('Study');
  
  // New Modals State
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { id: 1, user: 'Alex Chen', initials: 'AC', text: 'Hey guys, I uploaded the notes for Chapter 4.', time: '10:00 AM' },
    { id: 2, user: 'Sarah Kim', initials: 'SK', text: 'Thanks! I will review them tonight.', time: '10:05 AM' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [showMeeting, setShowMeeting] = useState(false);
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [showFilePreview, setShowFilePreview] = useState<{name: string, ext: string} | null>(null);

  const filtered = groups.filter(g =>
    (filter === 'All' || g.type === filter) &&
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <Topbar
        title="My Groups & Teams"
        subtitle="Collaborate on projects, study together, and join impact initiatives."
        action={{ label: 'New Group', onClick: () => setShowNewGroup(true) }}
      />

      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="flex flex-col xl:flex-row gap-6 max-w-7xl mx-auto">

          {/* Left — Groups */}
          <div className="flex-1 space-y-5">
            {/* Search + Filter */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search groups..."
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/[0.06] rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors text-zinc-900 dark:text-white placeholder:text-zinc-400"
                />
              </div>
              <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/[0.06] p-1 rounded-xl overflow-x-auto scrollbar-none">
                {TABS.map(t => (
                  <button key={t} onClick={() => setFilter(t)} className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${filter === t ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Group Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map((group, i) => (
                <motion.div
                  key={group.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  onClick={() => setSelectedGroup(group)}
                  className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/[0.06] rounded-2xl p-5 hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/5 transition-all cursor-pointer group"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${group.color} flex items-center justify-center text-white font-black text-base shadow-lg`}>
                        {group.initials}
                      </div>
                      <div>
                        <h3 className="font-bold text-zinc-900 dark:text-white text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{group.name}</h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border mt-1 inline-block ${typeColors[group.type]}`}>{group.type}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {group.unread > 0 && (
                        <span className="w-6 h-6 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center shadow-md shadow-indigo-500/30">
                          {group.unread}
                        </span>
                      )}
                      <button className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors opacity-0 group-hover:opacity-100" onClick={e => { e.stopPropagation(); toast.info('Group options'); }}>
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Members avatars */}
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex -space-x-2">
                      {group.avatars.map((a, idx) => (
                        <div key={idx} className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 border-2 border-white dark:border-zinc-900 flex items-center justify-center text-[9px] text-white font-bold">{a}</div>
                      ))}
                    </div>
                    <span className="text-xs text-zinc-500">{group.members} members</span>
                  </div>

                  {/* Progress */}
                  <div className="mb-3">
                    <div className="flex justify-between text-[10px] text-zinc-500 mb-1.5">
                      <span>Progress</span>
                      <span className="font-semibold">{group.completion}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }} animate={{ width: `${group.completion}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: i * 0.1 + 0.2 }}
                        className={`h-full rounded-full bg-gradient-to-r ${group.color}`}
                      />
                    </div>
                  </div>

                  {/* Latest Activity */}
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between border-t border-zinc-100 dark:border-white/[0.04] pt-3">
                    <span className="truncate pr-3">{group.latestActivity}</span>
                    <span className="whitespace-nowrap text-zinc-400">{group.time}</span>
                  </div>
                </motion.div>
              ))}

              {/* Create New Group */}
              <motion.button
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                onClick={() => setShowNewGroup(true)}
                className="bg-white dark:bg-zinc-900/50 border-2 border-dashed border-zinc-200 dark:border-white/[0.06] rounded-2xl p-5 h-full min-h-[200px] flex flex-col items-center justify-center hover:border-indigo-500/60 hover:bg-indigo-50/30 dark:hover:bg-indigo-500/5 transition-all cursor-pointer group"
              >
                <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-500/20 flex items-center justify-center mb-3 transition-colors">
                  <Plus className="w-6 h-6 text-zinc-400 group-hover:text-indigo-500 transition-colors" />
                </div>
                <p className="font-bold text-zinc-900 dark:text-white text-sm">Create New Group</p>
                <p className="text-xs text-zinc-400 mt-1">Study, project, or impact team</p>
              </motion.button>
            </div>
          </div>

          {/* Right — Activity Feed */}
          <div className="w-full xl:w-80 xl:flex-shrink-0">
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 text-sm">
                  <MessageSquare className="w-4 h-4 text-indigo-500" /> Activity Feed
                </h3>
                <button className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors" onClick={() => toast.info('Filter activity feed')}>
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {feed.map((item, i) => {
                  const Icon = itemIcons[item.itemType] || FileText;
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="flex gap-3 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors cursor-pointer group"
                      onClick={() => toast.info(`${item.user}: ${item.action} in ${item.group}`)}
                    >
                      {/* Avatar */}
                      <div className={`w-8 h-8 rounded-full ${item.color} flex items-center justify-center text-xs font-bold flex-shrink-0`}>
                        {item.initials}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-xs font-semibold text-zinc-900 dark:text-white">{item.user}</span>
                          <span className="text-[10px] text-zinc-400 whitespace-nowrap">{item.time}</span>
                        </div>
                        <p className="text-[11px] text-zinc-500 mb-1.5">
                          {item.action} in <span className={`font-semibold ${item.groupColor}`}>{item.group}</span>
                        </p>
                        <div className="flex items-center gap-1.5 bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/[0.04] rounded-lg px-2 py-1.5">
                          <Icon className={`w-3 h-3 ${item.color.split(' ')[1]} flex-shrink-0`} />
                          <span className="text-[11px] text-zinc-700 dark:text-zinc-300 font-medium truncate">{item.item}</span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <button className="w-full mt-4 text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center justify-center gap-1 py-2" onClick={() => setShowAllActivity(true)}>
                View all activity <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Group Detail Slide-over */}
      <AnimatePresence>
        {selectedGroup && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-40" onClick={() => setSelectedGroup(null)} />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-full sm:w-[420px] bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl z-50 overflow-y-auto"
            >
              <div className={`h-28 bg-gradient-to-br ${selectedGroup.color} relative flex items-end p-5`}>
                <button onClick={() => setSelectedGroup(null)} className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
                <div>
                  <span className="text-white/70 text-xs font-medium">{selectedGroup.type} Group</span>
                  <h2 className="text-xl font-black text-white">{selectedGroup.name}</h2>
                </div>
              </div>
              <div className="p-5 space-y-5">
                <div className="flex gap-2">
                  <button className="flex-1 btn-primary py-2 text-sm" onClick={() => setShowChat(true)}>
                    <MessageSquare className="w-4 h-4 inline mr-1" /> Chat
                  </button>
                  <button className="flex-1 btn-secondary py-2 text-sm" onClick={() => {
                    const newFile = { id: Date.now(), user: 'You', initials: 'ME', text: '', isFile: true, fileName: 'New_Upload.pdf', time: 'Just now' };
                    setChatMessages([...chatMessages, newFile]);
                    setShowChat(true);
                    toast.success('File shared in chat');
                  }}>
                    <Upload className="w-4 h-4 inline mr-1" /> Files
                  </button>
                  <button className="flex-1 btn-secondary py-2 text-sm" onClick={() => setShowMeeting(true)}>
                    <Video className="w-4 h-4 inline mr-1" /> Meet
                  </button>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Members ({selectedGroup.members})</h4>
                  <div className="space-y-2">
                    {selectedGroup.avatars.map((a, i) => (
                      <div key={i} className="flex items-center gap-3 p-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-xs text-white font-bold">{a}</div>
                        <div>
                          <div className="text-sm font-medium text-zinc-900 dark:text-white">Member {a}</div>
                          <div className="text-xs text-zinc-400">{i === 0 ? 'Admin' : 'Member'}</div>
                        </div>
                      </div>
                    ))}
                    {selectedGroup.members > 4 && (
                      <button className="text-xs text-indigo-500 pl-2 hover:underline" onClick={() => setShowAllMembers(true)}>
                        +{selectedGroup.members - 4} more members
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Progress</h4>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-zinc-600 dark:text-zinc-400">Overall completion</span>
                    <span className="font-bold text-zinc-900 dark:text-white">{selectedGroup.completion}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div className={`h-full rounded-full bg-gradient-to-r ${selectedGroup.color}`} style={{ width: `${selectedGroup.completion}%` }} />
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Shared Resources</h4>
                  {['Study_Guide_Week3.pdf', 'Project_Architecture.fig', 'Research_Notes.docx'].map((f, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer transition-colors border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700" onClick={() => setShowFilePreview({ name: f, ext: f.split('.').pop() || '' })}>
                      <FileText className="w-4 h-4 text-indigo-400" />
                      <span className="text-sm text-zinc-700 dark:text-zinc-300 flex-1">{f}</span>
                      <ChevronRight className="w-4 h-4 text-zinc-400" />
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* New Group Modal */}
      <AnimatePresence>
        {showNewGroup && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowNewGroup(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-zinc-900 dark:text-white text-lg">Create New Group</h3>
                <button onClick={() => setShowNewGroup(false)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Group Name</label>
                  <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="e.g. Algorithms Study Circle" className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500 placeholder:text-zinc-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Study', 'Project', 'Impact', 'Research'].map(t => (
                      <button key={t} onClick={() => setNewGroupType(t)} className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${newGroupType === t ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-indigo-500/50'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button onClick={() => setShowNewGroup(false)} className="flex-1 btn-secondary py-2.5 text-sm">Cancel</button>
                <button onClick={() => { setShowNewGroup(false); toast.success(`"${newGroupName || 'New Group'}" created!`); setNewGroupName(''); }} className="flex-1 btn-primary py-2.5 text-sm">Create Group</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Modals for new functionality */}
      <AnimatePresence>
        {/* Full Activity Feed */}
        {showAllActivity && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6" onClick={(e) => e.target === e.currentTarget && setShowAllActivity(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
              <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900">
                <h3 className="font-bold text-zinc-900 dark:text-white text-lg">Full Activity Feed</h3>
                <button onClick={() => setShowAllActivity(false)} className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
                {[...feed, ...feed, ...feed].map((item, i) => {
                  const Icon = itemIcons[item.itemType] || FileText;
                  return (
                    <div key={i} className="flex gap-4 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors group">
                      <div className={`w-10 h-10 rounded-full ${item.color} flex items-center justify-center text-sm font-bold flex-shrink-0`}>{item.initials}</div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex justify-between items-start mb-1">
                          <p className="text-sm text-zinc-900 dark:text-zinc-100">
                            <span className="font-semibold">{item.user}</span> {item.action} in <span className={`font-semibold ${item.groupColor}`}>{item.group}</span>
                          </p>
                          <span className="text-xs text-zinc-400 whitespace-nowrap ml-4">{item.time}</span>
                        </div>
                        <div className="inline-flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 mt-1">
                          <Icon className={`w-4 h-4 ${item.color.split(' ')[1]}`} />
                          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{item.item}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Group Chat Modal */}
        {showChat && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 sm:p-6" onClick={(e) => e.target === e.currentTarget && setShowChat(false)}>
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col h-[70vh]">
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-indigo-50 dark:bg-indigo-900/20 rounded-t-2xl">
                <div>
                  <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Hash className="w-4 h-4 text-indigo-500" /> {selectedGroup?.name || 'Group Chat'}</h3>
                  <p className="text-xs text-zinc-500">{selectedGroup?.members || 0} members</p>
                </div>
                <button onClick={() => setShowChat(false)} className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/50 dark:bg-zinc-900/50">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.user === 'You' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${msg.user === 'You' ? 'bg-indigo-500 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300'}`}>{msg.initials}</div>
                    <div className={`max-w-[75%] ${msg.user === 'You' ? 'items-end' : 'items-start'} flex flex-col`}>
                      <div className="flex items-baseline gap-2 mb-1 px-1">
                        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{msg.user}</span>
                        <span className="text-[10px] text-zinc-400">{msg.time}</span>
                      </div>
                      <div className={`p-3 rounded-2xl text-sm ${msg.user === 'You' ? 'bg-indigo-500 text-white rounded-tr-sm' : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-tl-sm'}`}>
                        {msg.isFile ? (
                          <div className="flex items-center gap-2 cursor-pointer hover:opacity-80" onClick={() => setShowFilePreview({ name: msg.fileName || '', ext: msg.fileName?.split('.').pop() || '' })}>
                            <FileText className="w-5 h-5" />
                            <span className="underline font-medium">{msg.fileName}</span>
                          </div>
                        ) : (
                          msg.text
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-b-2xl">
                <div className="flex items-center gap-2">
                  <button className="p-2 text-zinc-400 hover:text-indigo-500 transition-colors" onClick={() => {
                    const newFile = { id: Date.now(), user: 'You', initials: 'ME', text: '', isFile: true, fileName: 'Attached_Document.pdf', time: 'Just now' };
                    setChatMessages([...chatMessages, newFile]);
                    toast.success('Document attached');
                  }}>
                    <Paperclip className="w-5 h-5" />
                  </button>
                  <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => {
                    if (e.key === 'Enter' && chatInput.trim()) {
                      setChatMessages([...chatMessages, { id: Date.now(), user: 'You', initials: 'ME', text: chatInput, time: 'Just now' }]);
                      setChatInput('');
                    }
                  }} placeholder="Type a message..." className="flex-1 bg-zinc-100 dark:bg-zinc-800 border-none rounded-full px-4 py-2 text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                  <button className="p-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full transition-colors" onClick={() => {
                    if (chatInput.trim()) {
                      setChatMessages([...chatMessages, { id: Date.now(), user: 'You', initials: 'ME', text: chatInput, time: 'Just now' }]);
                      setChatInput('');
                    }
                  }}>
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Video Meeting Simulation */}
        {showMeeting && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-zinc-950 z-[70] flex flex-col">
            <div className="p-4 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-white font-semibold">Meeting: {selectedGroup?.name}</span>
                <span className="text-zinc-400 text-sm pl-4 border-l border-zinc-700">04:23</span>
              </div>
            </div>
            <div className="flex-1 p-4 sm:p-8 grid grid-cols-2 md:grid-cols-3 gap-4 place-content-center">
              {[...Array(selectedGroup ? Math.min(selectedGroup.members, 6) : 4)].map((_, i) => (
                <div key={i} className="aspect-video bg-zinc-800 rounded-2xl relative overflow-hidden flex items-center justify-center border border-zinc-700">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white">
                    {selectedGroup?.avatars[i] || 'U'}
                  </div>
                  <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur px-2 py-1 rounded-md text-xs text-white flex items-center gap-2">
                    {i === 0 && <MicOff className="w-3 h-3 text-red-400" />} User {i + 1}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-6 bg-zinc-900/80 backdrop-blur-lg flex justify-center items-center gap-4 border-t border-zinc-800">
              <button className="w-12 h-12 rounded-full bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center text-white transition-colors" onClick={() => toast.success('Microphone toggled')}><Mic className="w-5 h-5" /></button>
              <button className="w-12 h-12 rounded-full bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center text-white transition-colors" onClick={() => toast.success('Camera toggled')}><VideoOff className="w-5 h-5" /></button>
              <button className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors shadow-lg" onClick={() => setShowMeeting(false)}><PhoneOff className="w-6 h-6" /></button>
              <button className="w-12 h-12 rounded-full bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center text-white transition-colors" onClick={() => { setShowMeeting(false); setShowChat(true); }}><MessageSquare className="w-5 h-5" /></button>
            </div>
          </motion.div>
        )}

        {/* All Members Modal */}
        {showAllMembers && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 sm:p-6" onClick={(e) => e.target === e.currentTarget && setShowAllMembers(false)}>
             <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[70vh]">
              <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                <h3 className="font-bold text-zinc-900 dark:text-white text-lg">Group Members ({selectedGroup?.members})</h3>
                <button onClick={() => setShowAllMembers(false)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {[...Array(selectedGroup?.members || 10)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-sm text-white font-bold">U{i+1}</div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-zinc-900 dark:text-white">Group Member {i + 1}</div>
                      <div className="text-xs text-zinc-500">{i === 0 ? 'Admin' : 'Member'} • Joined recently</div>
                    </div>
                    <button className="p-2 text-zinc-400 hover:text-indigo-500 transition-colors" onClick={() => { setShowAllMembers(false); setShowChat(true); }}><MessageSquare className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
             </motion.div>
          </motion.div>
        )}

        {/* File Preview Modal */}
        {showFilePreview && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-md z-[80] flex flex-col p-4 sm:p-8" onClick={(e) => e.target === e.currentTarget && setShowFilePreview(null)}>
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3 bg-zinc-900/50 p-2 pr-4 rounded-xl border border-zinc-700">
                <div className={`p-2 rounded-lg ${showFilePreview.ext === 'pdf' ? 'bg-red-500/20 text-red-400' : showFilePreview.ext === 'fig' ? 'bg-fuchsia-500/20 text-fuchsia-400' : 'bg-blue-500/20 text-blue-400'}`}>
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">{showFilePreview.name}</h3>
                  <p className="text-zinc-400 text-xs">{showFilePreview.ext.toUpperCase()} Document • 2.4 MB</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="p-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors"><Download className="w-5 h-5" /></button>
                <button className="p-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors"><ExternalLink className="w-5 h-5" /></button>
                <button onClick={() => setShowFilePreview(null)} className="p-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors ml-4"><X className="w-5 h-5" /></button>
              </div>
            </div>
            
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex-1 bg-white dark:bg-zinc-950 rounded-2xl overflow-hidden flex flex-col items-center justify-center border border-zinc-200 dark:border-zinc-800 shadow-2xl relative">
               {/* Simulated Document Content */}
               <div className="w-full h-full max-w-4xl mx-auto p-12 bg-white dark:bg-zinc-900 overflow-y-auto shadow-inner">
                  <div className="h-8 w-3/4 bg-zinc-200 dark:bg-zinc-800 rounded-md mb-8 animate-pulse" />
                  <div className="space-y-4 mb-12">
                    <div className="h-4 w-full bg-zinc-100 dark:bg-zinc-800 rounded mb-2" />
                    <div className="h-4 w-full bg-zinc-100 dark:bg-zinc-800 rounded mb-2" />
                    <div className="h-4 w-5/6 bg-zinc-100 dark:bg-zinc-800 rounded mb-2" />
                    <div className="h-4 w-11/12 bg-zinc-100 dark:bg-zinc-800 rounded" />
                  </div>
                  
                  <div className="aspect-video w-full bg-zinc-100 dark:bg-zinc-800 rounded-xl mb-12 flex items-center justify-center">
                    <Video className="w-12 h-12 text-zinc-300 dark:text-zinc-700" />
                  </div>

                  <div className="space-y-4">
                    <div className="h-4 w-full bg-zinc-100 dark:bg-zinc-800 rounded mb-2" />
                    <div className="h-4 w-full bg-zinc-100 dark:bg-zinc-800 rounded mb-2" />
                    <div className="h-4 w-4/6 bg-zinc-100 dark:bg-zinc-800 rounded" />
                  </div>
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Users, MessageSquare, FileText, Search, Plus, MoreHorizontal, Hash, BookOpen, Star, X, ChevronRight, Upload, Video, Calendar, Send, Mic, MicOff, VideoOff, PhoneOff, Paperclip, Download, ExternalLink, Edit2, Trash2, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';

const groups = [
  { id: 1, name: 'OS Study Group', type: 'Study', members: 12, latestActivity: 'Alex shared Chapter_4_Notes.pdf', time: '10m ago', unread: 3, color: 'from-blue-500 to-indigo-600', initials: 'OS', completion: 68, avatars: ['AK','BL','CR','DM'], isMeetingActive: false },
  { id: 2, name: 'Web App Hackathon', type: 'Project', members: 4, latestActivity: 'Sarah pushed to main branch', time: '1h ago', unread: 0, color: 'from-fuchsia-500 to-pink-600', initials: 'WH', completion: 42, avatars: ['SK','JP','RM','TN'], isMeetingActive: true },
  { id: 3, name: 'Clean Water Initiative', type: 'Impact', members: 28, latestActivity: 'Dr. Evans: Meeting at 5PM today', time: '2h ago', unread: 12, color: 'from-emerald-500 to-teal-600', initials: 'CW', completion: 81, avatars: ['DE','LF','GM','HO'], isMeetingActive: false },
  { id: 4, name: 'AI Research Collective', type: 'Research', members: 9, latestActivity: 'New paper shared: LLM Reasoning', time: '4h ago', unread: 2, color: 'from-amber-500 to-orange-600', initials: 'AI', completion: 55, avatars: ['PA','QB','RC','SD'], isMeetingActive: false },
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
  
  const [inviteInput, setInviteInput] = useState('');
  const [inviteMembers, setInviteMembers] = useState<string[]>([]);
  const [generatedLink, setGeneratedLink] = useState('');
  
  // New Modals State
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ id: number | string, user: string, initials: string, text: string, time: string, isFile?: boolean, fileName?: string, isEdited?: boolean }>>([
    { id: 1, user: 'Alex Chen', initials: 'AC', text: 'Hey guys, I uploaded the notes for Chapter 4.', time: '10:00 AM' },
    { id: 2, user: 'Sarah Kim', initials: 'SK', text: 'Thanks! I will review them tonight.', time: '10:05 AM' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<number | string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState('');
  
  const [showMeeting, setShowMeeting] = useState(false);
  const [showMeetingChat, setShowMeetingChat] = useState(false); // In-meeting chat panel
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [showFilePreview, setShowFilePreview] = useState<{name: string, ext: string, aiSummary?: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Handle webcam stream reliably
  useEffect(() => {
    if (showMeeting && (isCamOn || isMicOn)) {
      navigator.mediaDevices.getUserMedia({ video: isCamOn, audio: isMicOn })
        .then(stream => {
          setLocalStream(stream);
        })
        .catch(err => {
          console.error("Media access error:", err);
          toast.error("Could not access camera or mic. Please click the lock icon in your browser's URL bar and ensure permissions are allowed.");
        });
    } else if (!isCamOn && !isMicOn) {
      setLocalStream(null);
    }
    
    return () => {
      setLocalStream(prevStream => {
        if (prevStream) {
          prevStream.getTracks().forEach(track => track.stop());
        }
        return null;
      });
    };
  }, [showMeeting, isCamOn, isMicOn]);

  // Bind the stream to the video element whenever it changes or the video mounts
  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
      videoRef.current.play().catch(e => console.error("Video play failed:", e));
    }
  }, [localStream, showMeeting, isCamOn]);

  // Toggle mic track when isMicOn changes
  useEffect(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = isMicOn;
      });
    }
  }, [isMicOn, localStream]);


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
                <div className="flex gap-2 w-full">
                  <button className="flex-1 btn-primary py-2 px-1 text-sm flex items-center justify-center whitespace-nowrap" onClick={() => setShowChat(true)}>
                    <MessageSquare className="w-4 h-4 mr-1" /> Chat
                  </button>
                  <button className="flex-1 btn-secondary py-2 px-1 text-sm flex items-center justify-center whitespace-nowrap" onClick={() => {
                    fileInputRef.current?.click();
                  }}>
                    <Upload className="w-4 h-4 mr-1" /> Files
                  </button>
                  <button 
                    className={`flex-1 py-2 px-1 text-sm flex items-center justify-center whitespace-nowrap ${selectedGroup.isMeetingActive ? 'bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold shadow-lg shadow-green-500/30' : 'btn-secondary'}`} 
                    onClick={() => setShowMeeting(true)}
                  >
                    <Video className="w-4 h-4 mr-1" /> {selectedGroup.isMeetingActive ? 'Join Meeting' : 'Meet'}
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
                <div>
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Invite Members</label>
                  <div className="flex gap-2 mb-2">
                    <input 
                      value={inviteInput} 
                      onChange={e => setInviteInput(e.target.value)} 
                      onKeyDown={e => {
                        if (e.key === 'Enter' && inviteInput.trim()) {
                          setInviteMembers([...inviteMembers, inviteInput.trim()]);
                          setInviteInput('');
                        }
                      }}
                      placeholder="Email or username..." 
                      className="flex-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500 placeholder:text-zinc-400" 
                    />
                    <button 
                      onClick={() => {
                        if (inviteInput.trim()) {
                          setInviteMembers([...inviteMembers, inviteInput.trim()]);
                          setInviteInput('');
                        }
                      }}
                      className="px-4 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 dark:bg-indigo-900/50 dark:hover:bg-indigo-900/80 dark:text-indigo-300 rounded-xl text-sm font-medium transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  {inviteMembers.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {inviteMembers.map((member, i) => (
                        <div key={i} className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-full text-xs text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                          <span>{member}</span>
                          <button onClick={() => setInviteMembers(inviteMembers.filter((_, idx) => idx !== i))} className="hover:text-red-500 transition-colors">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                   <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 block">Share Link</label>
                   {generatedLink ? (
                      <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-3 py-2">
                        <span className="text-xs font-mono text-green-700 dark:text-green-300 flex-1 truncate">{generatedLink}</span>
                        <button onClick={() => { navigator.clipboard.writeText(generatedLink); toast.success("Link copied!"); }} className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 font-medium text-sm px-2">Copy</button>
                      </div>
                   ) : (
                      <button onClick={() => setGeneratedLink(`${window.location.origin}/join/${Math.random().toString(36).substring(7)}`)} className="text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
                        Generate Invite Link
                      </button>
                   )}
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button onClick={() => { setShowNewGroup(false); setInviteMembers([]); setGeneratedLink(''); setInviteInput(''); setNewGroupName(''); }} className="flex-1 btn-secondary py-2.5 text-sm">Cancel</button>
                <button onClick={() => { 
                  setShowNewGroup(false); 
                  toast.success(`"${newGroupName || 'New Group'}" created with ${inviteMembers.length} members!`); 
                  setNewGroupName(''); 
                  setInviteMembers([]);
                  setGeneratedLink('');
                }} className="flex-1 btn-primary py-2.5 text-sm">Create Group</button>
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
                  <div key={i} className={`flex gap-3 ${msg.user === 'You' ? 'flex-row-reverse' : ''} group/message`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${msg.user === 'You' ? 'bg-indigo-500 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300'}`}>{msg.initials}</div>
                    <div className={`max-w-[75%] ${msg.user === 'You' ? 'items-end' : 'items-start'} flex flex-col`}>
                      <div className="flex items-baseline gap-2 mb-1 px-1">
                        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{msg.user}</span>
                        <span className="text-[10px] text-zinc-400">{msg.time} {msg.isEdited && '(edited)'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {msg.user === 'You' && (
                          <div className="opacity-0 group-hover/message:opacity-100 flex items-center gap-1 transition-opacity">
                            <button onClick={() => { setEditingMessageId(msg.id); setEditingMessageText(msg.text); }} className="p-1.5 text-zinc-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded">
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button onClick={() => {
                              // Optimistic delete
                              setChatMessages(prev => prev.filter(m => m.id !== msg.id));
                              fetch(`/api/groups/messages?id=${msg.id}`, { method: 'DELETE' }).catch(e => console.error("Failed to delete", e));
                            }} className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        <div className={`p-3 rounded-2xl text-sm ${msg.user === 'You' ? 'bg-indigo-500 text-white rounded-tr-sm' : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-tl-sm'}`}>
                          {msg.isFile ? (
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2 cursor-pointer hover:opacity-80" onClick={() => setShowFilePreview({ name: msg.fileName || '', ext: msg.fileName?.split('.').pop() || '', aiSummary: (msg as any).aiSummary })}>
                                <FileText className="w-5 h-5" />
                                <span className="underline font-medium">{msg.fileName}</span>
                              </div>
                              {msg.text && msg.text.includes('Uploading') && (
                                <span className="text-xs text-indigo-200 mt-1 animate-pulse">Generating AI Summary...</span>
                              )}
                            </div>
                          ) : (
                            msg.text
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-b-2xl">
                {editingMessageId && (
                  <div className="flex justify-between items-center mb-2 px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded text-xs text-zinc-600 dark:text-zinc-300">
                    <span>Editing message</span>
                    <button onClick={() => { setEditingMessageId(null); setEditingMessageText(''); setChatInput(''); }} className="hover:text-zinc-900 dark:hover:text-white"><X className="w-3 h-3" /></button>
                  </div>
                )}
                <div className="flex items-center gap-2">

                  <button className="p-2 text-zinc-400 hover:text-indigo-500 transition-colors" onClick={() => fileInputRef.current?.click()}>
                    <Paperclip className="w-5 h-5" />
                  </button>
                  <input 
                    value={editingMessageId ? editingMessageText : chatInput} 
                    onChange={e => editingMessageId ? setEditingMessageText(e.target.value) : setChatInput(e.target.value)} 
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        if (editingMessageId && editingMessageText.trim()) {
                          // Optimistic edit
                          setChatMessages(prev => prev.map(m => m.id === editingMessageId ? { ...m, text: editingMessageText, isEdited: true } : m));
                          fetch('/api/groups/messages', {
                            method: 'PATCH',
                            body: JSON.stringify({ messageId: editingMessageId, content: editingMessageText })
                          }).catch(err => console.error("Failed to edit", err));
                          setEditingMessageId(null);
                          setEditingMessageText('');
                        } else if (!editingMessageId && chatInput.trim()) {
                          const newId = Date.now();
                          setChatMessages([...chatMessages, { id: newId, user: 'You', initials: 'ME', text: chatInput, time: 'Just now' }]);
                          fetch('/api/groups/messages', {
                            method: 'POST',
                            body: JSON.stringify({ content: chatInput, senderId: 'mock-user-id', groupId: selectedGroup?.id?.toString() || '1' })
                          }).catch(err => console.error("Failed to send", err));
                          setChatInput('');
                        }
                      }
                    }} 
                    placeholder={editingMessageId ? "Edit your message..." : "Type your message..."} 
                    className="flex-1 bg-zinc-100 dark:bg-zinc-800 border-none rounded-full px-4 py-2 text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" 
                  />
                  <button className="p-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full transition-colors" onClick={() => {
                    if (editingMessageId && editingMessageText.trim()) {
                      setChatMessages(prev => prev.map(m => m.id === editingMessageId ? { ...m, text: editingMessageText, isEdited: true } : m));
                      fetch('/api/groups/messages', {
                        method: 'PATCH',
                        body: JSON.stringify({ messageId: editingMessageId, content: editingMessageText })
                      }).catch(err => console.error("Failed to edit", err));
                      setEditingMessageId(null);
                      setEditingMessageText('');
                    } else if (!editingMessageId && chatInput.trim()) {
                      const newId = Date.now();
                      setChatMessages([...chatMessages, { id: newId, user: 'You', initials: 'ME', text: chatInput, time: 'Just now' }]);
                      fetch('/api/groups/messages', {
                        method: 'POST',
                        body: JSON.stringify({ content: chatInput, senderId: 'mock-user-id', groupId: selectedGroup?.id?.toString() || '1' })
                      }).catch(err => console.error("Failed to send", err));
                      setChatInput('');
                    }
                  }}>
                    {editingMessageId ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Video Meeting Simulation */}
        {showMeeting && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-zinc-950 z-[70] flex flex-row">
            <div className="flex-1 flex flex-col h-full relative">
              <div className="p-4 flex justify-between items-center absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-zinc-950/80 to-transparent">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-white font-semibold">Meeting: {selectedGroup?.name}</span>
                  <span className="text-zinc-400 text-sm pl-4 border-l border-zinc-700">04:23</span>
                </div>
              </div>
              <div className="flex-1 p-4 sm:p-8 grid grid-cols-2 md:grid-cols-3 gap-4 place-content-center mt-12">
                {[...Array(selectedGroup ? Math.min(selectedGroup.members, 6) : 4)].map((_, i) => (
                  <div key={i} className="aspect-video bg-zinc-800 rounded-2xl relative overflow-hidden flex items-center justify-center border border-zinc-700">
                    {i === 0 && isCamOn ? (
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white">
                        {i === 0 ? 'ME' : (selectedGroup?.avatars[i] || 'U')}
                      </div>
                    )}
                    <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur px-2 py-1 rounded-md text-xs text-white flex items-center gap-2">
                      {i === 0 ? (
                        !isMicOn && <MicOff className="w-3 h-3 text-red-400" />
                      ) : (
                        <MicOff className="w-3 h-3 text-red-400" />
                      )} 
                      {i === 0 ? 'You' : `User ${i + 1}`}
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-6 bg-zinc-900/80 backdrop-blur-lg flex justify-center items-center gap-4 border-t border-zinc-800">
                <button className={`w-12 h-12 rounded-full ${isMicOn ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-red-500 hover:bg-red-600'} flex items-center justify-center text-white transition-colors`} onClick={() => setIsMicOn(!isMicOn)}>
                  {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </button>
                <button className={`w-12 h-12 rounded-full ${isCamOn ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-red-500 hover:bg-red-600'} flex items-center justify-center text-white transition-colors`} onClick={() => setIsCamOn(!isCamOn)}>
                  {isCamOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </button>
                <button className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors shadow-lg" onClick={() => { setShowMeeting(false); setShowMeetingChat(false); toast.info('You left the meeting'); }}><PhoneOff className="w-6 h-6" /></button>
                <button className={`w-12 h-12 rounded-full ${showMeetingChat ? 'bg-indigo-500 hover:bg-indigo-600 text-white' : 'bg-zinc-700 hover:bg-zinc-600 text-white'} flex items-center justify-center transition-colors`} onClick={() => setShowMeetingChat(!showMeetingChat)}>
                  <MessageSquare className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* In-Meeting Side Chat */}
            <AnimatePresence>
              {showMeetingChat && (
                <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 350, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 flex flex-col h-full">
                  <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                    <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">Meeting Chat</h3>
                    <button onClick={() => setShowMeetingChat(false)} className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500"><X className="w-5 h-5" /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/50 dark:bg-zinc-900/50">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex gap-3 ${msg.user === 'You' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${msg.user === 'You' ? 'bg-indigo-500 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300'}`}>{msg.initials}</div>
                        <div className={`max-w-[85%] ${msg.user === 'You' ? 'items-end' : 'items-start'} flex flex-col`}>
                          <div className="flex items-baseline gap-2 mb-1 px-1">
                            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{msg.user}</span>
                            <span className="text-[10px] text-zinc-400">{msg.time}</span>
                          </div>
                          <div className={`p-3 rounded-2xl text-sm ${msg.user === 'You' ? 'bg-indigo-500 text-white rounded-tr-sm' : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-tl-sm'}`}>
                            {msg.text}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                    <div className="flex items-center gap-2">
                      <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => {
                        if (e.key === 'Enter' && chatInput.trim()) {
                          setChatMessages([...chatMessages, { id: Date.now(), user: 'You', initials: 'ME', text: chatInput, time: 'Just now' }]);
                          setChatInput('');
                        }
                      }} placeholder="Send a message..." className="flex-1 bg-zinc-100 dark:bg-zinc-800 border-none rounded-full px-4 py-2 text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                      <button className="p-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full transition-colors" onClick={() => {
                        if (chatInput.trim()) {
                          setChatMessages([...chatMessages, { id: Date.now(), user: 'You', initials: 'ME', text: chatInput, time: 'Just now' }]);
                          setChatInput('');
                        }
                      }}><Send className="w-4 h-4" /></button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
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
                <button className="p-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors" onClick={() => {
                  const link = document.createElement('a');
                  link.href = '#';
                  link.download = showFilePreview.name;
                  link.click();
                  toast.success(`Downloaded ${showFilePreview.name} to your device`);
                }}><Download className="w-5 h-5" /></button>
                <button className="p-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors" onClick={() => toast.success('Link copied to clipboard!')}><ExternalLink className="w-5 h-5" /></button>
                <button onClick={() => setShowFilePreview(null)} className="p-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors ml-4"><X className="w-5 h-5" /></button>
              </div>
            </div>
            
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex-1 bg-white dark:bg-zinc-950 rounded-2xl overflow-hidden flex flex-col items-center justify-center border border-zinc-200 dark:border-zinc-800 shadow-2xl relative">
               {/* Simulated Document Content */}
               <div className="w-full h-full max-w-4xl mx-auto p-12 bg-white dark:bg-zinc-900 overflow-y-auto shadow-inner text-zinc-800 dark:text-zinc-200">
                  <h1 className="text-3xl font-bold mb-6">{showFilePreview.name.replace(/\.[^/.]+$/, "")}</h1>
                  
                  {/* AI Summary Section */}
                  <div className="mb-8 p-6 bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 rounded-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                    <h2 className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold mb-3">
                      <Star className="w-4 h-4 fill-current" /> AI Summary
                    </h2>
                    <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                      {showFilePreview.aiSummary || `This document contains essential information and updates regarding our recent group activities and upcoming milestones. Please review the details below carefully.`}
                    </p>
                  </div>
                  
                  <h2 className="text-xl font-semibold mb-4 text-indigo-600 dark:text-indigo-400">1. Key Objectives</h2>
                  <ul className="list-disc pl-6 space-y-2 mb-8">
                    <li>Complete the primary research phase by end of this week.</li>
                    <li>Draft the initial findings report and share with the team.</li>
                    <li>Prepare presentation slides for the next sync meeting.</li>
                  </ul>

                  {showFilePreview.ext === 'pdf' || showFilePreview.ext === 'fig' ? (
                    <div className="aspect-video w-full bg-zinc-100 dark:bg-zinc-800 rounded-xl mb-12 flex flex-col items-center justify-center border border-zinc-200 dark:border-zinc-700">
                      <FileText className="w-16 h-16 text-zinc-400 dark:text-zinc-500 mb-4" />
                      <span className="text-zinc-500 dark:text-zinc-400 font-medium">{showFilePreview.name} Visual Preview</span>
                    </div>
                  ) : null}

                  <h2 className="text-xl font-semibold mb-4 text-indigo-600 dark:text-indigo-400">2. Next Steps</h2>
                  <p className="leading-relaxed mb-6">
                    Ensure all assignments are submitted through the portal before the deadline. We will discuss these points in detail during our next scheduled call.
                  </p>
                  
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-lg">
                    <p className="text-amber-800 dark:text-amber-200 text-sm font-medium">Note: This is a simulated document view. You can download the actual file using the button in the top right corner.</p>
                  </div>
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <input type="file" ref={fileInputRef} className="hidden" onChange={async (e) => {
        if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const tempId = Date.now();
          const newFileMsg = { id: tempId, user: 'You', initials: 'ME', text: 'Uploading and analyzing...', isFile: true, fileName: file.name, time: 'Just now', aiSummary: '' };
          setChatMessages([...chatMessages, newFileMsg]);
          toast.info(`Uploading ${file.name}...`);
          
          try {
            const uploadRes = await fetch(`/api/upload?filename=${file.name}`, { method: 'POST', body: file });
            let fileUrl = '';
            if (uploadRes.ok) {
               const blobData = await uploadRes.json();
               fileUrl = blobData.url;
            }

            const summarizeRes = await fetch('/api/summarize', {
              method: 'POST',
              body: JSON.stringify({ fileUrl: fileUrl || 'local-file' })
            });
            
            let aiSummary = `Simulated Summary: This document covers key objectives and research phases.`;
            if (summarizeRes.ok) {
               const summaryData = await summarizeRes.json();
               aiSummary = summaryData.summary;
            }

            // DB call
            fetch('/api/groups/messages', {
              method: 'POST',
              body: JSON.stringify({
                content: 'Shared a file',
                senderId: 'mock-user-id',
                groupId: selectedGroup?.id?.toString() || '1',
                attachments: [{ url: fileUrl, fileName: file.name, aiSummary }]
              })
            }).catch(e => console.error("DB push failed", e));

            setChatMessages(prev => prev.map(msg => msg.id === tempId ? { ...msg, text: 'Shared a file', aiSummary } : msg));
            toast.success('Document analyzed and shared!');
          } catch (err) {
            console.warn("API failed, using simulated data", err);
            setTimeout(() => {
               setChatMessages(prev => prev.map(msg => msg.id === tempId ? { ...msg, text: 'Shared a file', aiSummary: `AI Summary for ${file.name}: The document covers essential milestones and objectives for the group project.` } : msg));
               toast.success('Document analyzed and shared!');
            }, 1500);
          }
        }
      }} />
    </>
  );
}

'use client';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { Topbar } from '@/components/layout/Topbar';
import { Users, MessageSquare, Search, Plus, MoreHorizontal, X, ChevronRight, Upload, Video, Mic, Trash2 } from 'lucide-react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import useSWR from 'swr';
import { formatDistanceToNowStrict } from 'date-fns';
import { authedJson } from '@/lib/authed-fetch';
import { GroupChat } from '@/components/groups/GroupChat';
import { GroupDetailBody } from '@/components/groups/GroupDetailBody';
import { useInitialSearch } from '@/hooks/useInitialSearch';
import { useLiveInterval } from '@/lib/realtime-client';

type GroupItem = {
  id: string | number;
  name: string;
  type: string;
  members: number;
  latestActivity: string;
  time: string;
  unread: number;
  color: string;
  initials: string;
  completion: number;
  avatars: string[];
  isMeetingActive: boolean;
  isJoined?: boolean;
};

type ActivityItem = {
  id: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  author: { id: string; name: string };
  group: { id: string; name: string; category: string | null };
};

function ActivityRow({ item, onOpen, delay = 0 }: { item: ActivityItem; onOpen: () => void; delay?: number }) {
  const preview = item.imageUrl ? '📷 Photo' : item.body.startsWith('📎 ') ? '📎 File' : item.body;
  return (
    <motion.button
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      onClick={onOpen}
      className="w-full text-left flex gap-3 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors"
    >
      <div className="w-8 h-8 rounded-full bg-indigo-500/15 text-indigo-500 flex items-center justify-center text-xs font-bold flex-shrink-0">
        {item.author.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="text-xs font-semibold text-zinc-900 dark:text-white truncate">{item.author.name}</span>
          <span className="text-[10px] text-zinc-400 whitespace-nowrap">{formatDistanceToNowStrict(new Date(item.createdAt), { addSuffix: true })}</span>
        </div>
        <p className="text-[11px] text-zinc-500 mb-1">in <span className="font-semibold text-indigo-500">{item.group.name}</span></p>
        <p className="text-xs text-zinc-700 dark:text-zinc-300 truncate">{preview}</p>
      </div>
    </motion.button>
  );
}

const typeColors: Record<string, string> = {
  Study: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  Project: 'bg-fuchsia-500/10 text-fuchsia-500 border-fuchsia-500/20',
  Impact: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  Research: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
};

const gradientColors: Record<string, string> = {
  Study: 'from-blue-500 to-indigo-600',
  Project: 'from-fuchsia-500 to-pink-600',
  Impact: 'from-emerald-500 to-teal-600',
  Research: 'from-amber-500 to-orange-600',
};


const TABS = ['All', 'Study', 'Project', 'Impact', 'Research'];

export default function GroupsPage() {
  const router = useRouter();
  const [groupsList, setGroupsList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  useInitialSearch(setSearch);
  const [selectedGroup, setSelectedGroup] = useState<GroupItem | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<number | string | null>(null);
  const [inviteGroup, setInviteGroup] = useState<GroupItem | null>(null);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState('Study');
  
  const [inviteInput, setInviteInput] = useState('');
  const [inviteMembers, setInviteMembers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const [res, myRes] = await Promise.all([
          api.get('/groups'),
          api.get('/groups/my').catch(() => ({ data: [] }))
        ]);
        
        const myGroupIds = new Set(myRes.data.map((m: any) => m.groupId));
        
        const formatted = res.data.map((g: any) => ({
          id: g.id,
          name: g.name,
          type: g.category || 'Study',
          members: g._count?.members || 1,
          latestActivity: g._count?.posts > 0 ? 'New posts available' : 'Group created',
          time: new Date(g.createdAt).toLocaleDateString(),
          unread: 0,
          color: gradientColors[g.category || 'Study'] || 'from-indigo-500 to-purple-600',
          initials: g.name.substring(0, 2).toUpperCase(),
          completion: 0,
          avatars: g.members?.map((m: any) => m.user?.avatarUrl ? m.user.avatarUrl : m.user?.name?.substring(0, 2).toUpperCase() || 'U') || ['U'],
          isMeetingActive: false,
          isJoined: myGroupIds.has(g.id)
        }));
        setGroupsList(formatted);
        // Open a group shared via link (?group=<id>)
        const linked = new URLSearchParams(window.location.search).get('group');
        const target = linked ? formatted.find((g: any) => g.id === linked) : null;
        if (target) setSelectedGroup(target);
      } catch (error) {
        console.error('Failed to fetch groups', error);
        setGroupsList([]);
        toast.error('Could not load groups. Please try again shortly.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchGroups();
  }, []);

  
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const activityPoll = useLiveInterval(60_000, 0); // pushed live when posts change (src/server/groups-live.ts)
  const { data: activityData } = useSWR<ActivityItem[]>('/api/groups/activity?limit=30', authedJson, { refreshInterval: activityPoll });
  const activity = Array.isArray(activityData) ? activityData : [];

  // The group's own call room in UniVerse (src/server/calls.ts): members join from here.
  const openMeeting = (group: GroupItem, kind: 'audio' | 'video' = 'video') => router.push(`/call/g_${group.id}?kind=${kind}`);

  const filtered = groupsList.filter(g =>
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
                  <button key={t} role="tab" aria-selected={filter === t} onClick={() => setFilter(t)} className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${filter === t ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Group Cards */}
            {isLoading ? (
              <div>
                <ContentSkeleton variant="grid" />
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.length === 0 && groupsList.length > 0 && (
                <div className="md:col-span-2 rounded-2xl border border-dashed border-zinc-200 dark:border-white/[0.08] p-6 text-center">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">No groups match{search ? ` “${search}”` : ''}{filter !== 'All' ? ` in ${filter}` : ''}</p>
                  <button onClick={() => { setSearch(''); setFilter('All'); }} className="btn-ghost btn-sm mt-2 mx-auto">Clear search and filters</button>
                </div>
              )}
              {filtered.map((group, i) => (
                <motion.div
                  key={group.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 6) * 0.03 }}
                  onClick={() => setSelectedGroup(group)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${group.name}`}
                  onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSelectedGroup(group); } }}
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
                      <div className="relative">
                        <button className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Options for ${group.name}`} onClick={e => { e.stopPropagation(); setActiveMenuId(activeMenuId === group.id ? null : group.id); }}>
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {activeMenuId === group.id && (
                          <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg z-50 py-1 overflow-hidden" onClick={e => e.stopPropagation()}>
                            <button onClick={() => { setInviteGroup(group); setActiveMenuId(null); }} className="w-full text-left px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2">
                               <Users className="w-4 h-4" /> Add people
                            </button>
                            {group.isJoined && (
                            <button onClick={async () => {
                              setActiveMenuId(null);
                              try {
                                await api.delete(`/groups/${group.id}/leave`);
                                setGroupsList(groupsList.map(g => g.id === group.id ? { ...g, isJoined: false, members: Math.max(0, g.members - 1) } : g));
                                toast.success(`You left ${group.name}`);
                              } catch {
                                toast.error('Could not leave the group. Please try again.');
                              }
                            }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
                               <Trash2 className="w-4 h-4" /> Leave group
                            </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Members avatars */}
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex -space-x-2">
                      {group.avatars.map((a: string, idx: number) => (
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
            )}
          </div>

          {/* Right — Activity Feed */}
          <div className="w-full xl:w-80 xl:flex-shrink-0">
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2 text-sm">
                  <MessageSquare className="w-4 h-4 text-indigo-500" /> Activity Feed
                </h3>
                <button className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors" onClick={() => setShowAllActivity(true)}>
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {activity.length === 0 && (
                  <p className="text-xs text-zinc-500 py-4 text-center">No recent messages in your groups yet.</p>
                )}
                {activity.slice(0, 6).map((item, i) => (
                  <ActivityRow key={item.id} item={item} delay={i * 0.06} onOpen={() => {
                    const g = groupsList.find((x) => x.id === item.group.id);
                    if (g) { setSelectedGroup(g); setShowChat(true); }
                  }} />
                ))}
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
              className="fixed right-0 top-0 h-[100dvh] w-full sm:w-[420px] glass-sidebar sheet-safe-top border-l border-[var(--separator)] dark:border-white/[0.07] shadow-2xl z-50 overflow-y-auto"
            >
              <div className={`h-28 bg-gradient-to-br ${selectedGroup.color} relative flex items-end p-5`}>
                <div className="absolute top-4 right-14">
                  <button onClick={() => setActiveMenuId(activeMenuId === 'detail' ? null : 'detail')} className="p-1.5 rounded-lg bg-black/20 hover:bg-black/30 text-white transition-colors">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {activeMenuId === 'detail' && (
                    <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
                      <button onClick={() => { setInviteGroup(selectedGroup); setActiveMenuId(null); }} className="w-full text-left px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2">
                         <Users className="w-4 h-4" /> Add people
                      </button>
                      <button onClick={async () => {
                        setActiveMenuId(null);
                        try {
                          await api.delete(`/groups/${selectedGroup.id}/leave`);
                          const updated = { ...selectedGroup, isJoined: false, members: Math.max(0, selectedGroup.members - 1) };
                          setGroupsList(groupsList.map(g => g.id === selectedGroup.id ? updated : g));
                          setSelectedGroup(null);
                          toast.success(`You left ${selectedGroup.name}`);
                        } catch {
                          toast.error('Could not leave the group. Please try again.');
                        }
                      }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
                         <Trash2 className="w-4 h-4" /> Leave group
                      </button>
                    </div>
                  )}
                </div>
                <button onClick={() => setSelectedGroup(null)} className="absolute top-4 right-4 p-1.5 rounded-lg bg-black/20 hover:bg-black/30 text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
                <div>
                  <span className="text-white/70 text-xs font-medium">{selectedGroup.type} Group</span>
                  <h2 className="text-xl font-black text-white">{selectedGroup.name}</h2>
                </div>
              </div>
              <div className="p-5 space-y-5">
                <div className="flex gap-2 w-full">
                  {!selectedGroup.isJoined ? (
                    <button 
                      className="flex-1 btn-primary py-2 px-1 text-sm flex items-center justify-center whitespace-nowrap"
                      onClick={async () => {
                        try {
                          await api.post(`/groups/${selectedGroup.id}/join`);
                          toast.success(`Joined ${selectedGroup.name}!`);
                          const updatedGroup = { ...selectedGroup, isJoined: true, members: selectedGroup.members + 1 };
                          setSelectedGroup(updatedGroup);
                          setGroupsList(groupsList.map(g => g.id === selectedGroup.id ? updatedGroup : g));
                        } catch (e) {
                          toast.error('Failed to join group');
                        }
                      }}
                    >
                      <Plus className="w-4 h-4 mr-1" /> Join Group
                    </button>
                  ) : (
                    <>
                      <button className="flex-1 btn-primary py-2 px-1 text-sm flex items-center justify-center whitespace-nowrap" onClick={() => setShowChat(true)}>
                        <MessageSquare className="w-4 h-4 mr-1" /> Chat
                      </button>
                      <button className="flex-1 btn-secondary py-2 px-1 text-sm flex items-center justify-center whitespace-nowrap" onClick={() => setShowChat(true)}>
                        <Upload className="w-4 h-4 mr-1" /> Files
                      </button>
                      <button 
                        className={`flex-1 py-2 px-1 text-sm flex items-center justify-center whitespace-nowrap ${selectedGroup.isMeetingActive ? 'bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold shadow-lg shadow-green-500/30' : 'btn-secondary'}`} 
                        onClick={() => openMeeting(selectedGroup)}
                      >
                        <Video className="w-4 h-4 mr-1" /> Meet
                      </button>
                      <button className="btn-secondary py-2 px-3 text-sm flex items-center justify-center" onClick={() => openMeeting(selectedGroup, 'audio')} aria-label="Voice call with the group" title="Voice call">
                        <Mic className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>

                <GroupDetailBody groupId={selectedGroup.id} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* New Group Modal */}
      <AnimatePresence>
        {showNewGroup && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowNewGroup(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="tone-panel border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
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

              </div>
              <div className="flex gap-2 mt-6">
                <button onClick={() => { setShowNewGroup(false); setInviteMembers([]); setInviteInput(''); setNewGroupName(''); }} className="flex-1 btn-secondary py-2.5 text-sm">Cancel</button>
                <button aria-busy={creating || undefined} disabled={creating} onClick={async () => {
                  const name = newGroupName.trim();
                  if (!name) return toast.error('Group name is required');
                  setCreating(true);
                  try {
                    const { data: g } = await api.post('/groups', { name, category: newGroupType, isPublic: true });
                    const newGroup = {
                      id: g.id,
                      name,
                      type: newGroupType,
                      members: 1,
                      latestActivity: 'Group created',
                      time: 'Just now',
                      unread: 0,
                      color: gradientColors[newGroupType] || 'from-indigo-500 to-purple-600',
                      initials: name.substring(0, 2).toUpperCase(),
                      completion: 0,
                      avatars: [],
                      isMeetingActive: false,
                      isJoined: true,
                    };
                    setGroupsList(prev => [newGroup, ...prev]);
                    if (inviteMembers.length > 0) {
                      api.post(`/groups/${g.id}/invite`, { emails: inviteMembers })
                        .then(() => toast.success(`Invited ${inviteMembers.length} member${inviteMembers.length === 1 ? '' : 's'}.`))
                        .catch(() => toast.error('Group created, but the invites could not be sent.'));
                    }
                    toast.success(`"${name}" created`);
                    setShowNewGroup(false);
                    setNewGroupName('');
                    setInviteMembers([]);
                    setInviteInput('');
                  } catch {
                    toast.error('Could not create the group. Please try again.');
                  } finally {
                    setCreating(false);
                  }
                }} className="flex-1 btn-primary py-2.5 text-sm disabled:opacity-60">{creating ? 'Creating…' : 'Create Group'}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Modals for new functionality */}
      <AnimatePresence>
        {inviteGroup && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6" onClick={(e) => e.target === e.currentTarget && setInviteGroup(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="tone-panel border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-md shadow-2xl p-6 relative">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-zinc-900 dark:text-white text-lg">Invite to {inviteGroup.name}</h3>
                <button onClick={() => { setInviteGroup(null); setInviteInput(''); setInviteMembers([]); }} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
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
                   <button
                     onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/student/groups?group=${inviteGroup.id}`); toast.success('Group link copied'); }}
                     className="text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
                   >
                     Copy link to this group
                   </button>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button onClick={async () => { 
                  if (inviteMembers.length > 0) {
                    try {
                      await api.post(`/groups/${inviteGroup.id}/invite`, { emails: inviteMembers });
                      toast.success(`Invited ${inviteMembers.length} members to ${inviteGroup.name}`);
                    } catch (e) {
                      toast.error('Failed to invite members');
                    }
                  }
                  setInviteGroup(null); 
                  setInviteMembers([]);
                 
                  setInviteInput('');
                }} className="flex-1 btn-primary py-2.5 text-sm">Done</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {/* Full Activity Feed */}
        {showAllActivity && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6" onClick={(e) => e.target === e.currentTarget && setShowAllActivity(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="tone-panel border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
              <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900">
                <h3 className="font-bold text-zinc-900 dark:text-white text-lg">Full Activity Feed</h3>
                <button onClick={() => setShowAllActivity(false)} className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
                {activity.length === 0 && <p className="text-sm text-zinc-500 text-center py-8">No recent messages in your groups yet.</p>}
                {activity.map((item) => (
                  <ActivityRow key={item.id} item={item} onOpen={() => {
                    const g = groupsList.find((x) => x.id === item.group.id);
                    if (g) { setShowAllActivity(false); setSelectedGroup(g); setShowChat(true); }
                  }} />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Group Chat */}
        {showChat && selectedGroup && (
          <GroupChat group={selectedGroup} onClose={() => setShowChat(false)} />
        )}

      </AnimatePresence>
    </>
  );
}

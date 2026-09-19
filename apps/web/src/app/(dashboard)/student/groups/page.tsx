'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Users, MessageSquare, FileText, Search, Plus, MoreHorizontal, Hash } from 'lucide-react';
import { motion } from 'framer-motion';

const groups = [
  { id: 1, name: 'OS Study Group', type: 'Study Group', members: 12, latestActivity: 'Alex shared a new note', time: '10m ago', unread: 3, color: 'from-blue-500 to-indigo-500', initials: 'OS' },
  { id: 2, title: 'Web App Hackathon', type: 'Project Team', members: 4, latestActivity: 'Sarah pushed to main', time: '1h ago', unread: 0, color: 'from-fuchsia-500 to-pink-500', initials: 'WH' },
  { id: 3, title: 'Clean Water Initiative', type: 'Global Impact', members: 28, latestActivity: 'Meeting at 5PM today', time: '2h ago', unread: 12, color: 'from-emerald-500 to-teal-500', initials: 'CW' },
];

const feed = [
  { user: 'Alex Chen', group: 'OS Study Group', action: 'shared a file', item: 'Chapter_4_Notes.pdf', time: '10 mins ago', icon: FileText, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { user: 'Sarah Kim', group: 'Web App Hackathon', action: 'commented', item: '"We should use Next.js for this."', time: '1 hour ago', icon: MessageSquare, color: 'text-fuchsia-500', bg: 'bg-fuchsia-500/10' },
  { user: 'Dr. Evans', group: 'Clean Water Initiative', action: 'scheduled an event', item: 'Weekly Sync', time: '2 hours ago', icon: Hash, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
];

export default function GroupsPage() {
  return (
    <>
      <Topbar 
        title="My Groups & Teams" 
        subtitle="Collaborate on projects, study together, and join impact initiatives."
        action={{ label: 'New Group', onClick: () => console.log('new group') }}
      />
      <div className="flex-1 p-8 space-y-8 overflow-y-auto">
        
        <div className="flex flex-col xl:flex-row gap-8">
          
          {/* Main Groups List */}
          <div className="flex-1 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input 
                  type="text" 
                  placeholder="Search groups..." 
                  className="w-full pl-10 pr-4 py-2 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/[0.06] rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <div className="flex items-center gap-2">
                <button className="px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">All</button>
                <button className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.04]">Study</button>
                <button className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.04]">Projects</button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groups.map((group, i) => (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                  key={group.id}
                  className="card-hover p-5 flex flex-col justify-between h-48 group cursor-pointer"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${group.color} flex items-center justify-center text-white font-black text-lg shadow-lg`}>
                        {group.initials}
                      </div>
                      <div>
                        <h3 className="font-bold text-zinc-900 dark:text-white text-base group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {group.name || group.title}
                        </h3>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mt-0.5">
                          <Users className="w-3.5 h-3.5" /> {group.members} Members
                        </div>
                      </div>
                    </div>
                    {group.unread > 0 && (
                      <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-md shadow-indigo-500/30">
                        {group.unread}
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Latest Activity</div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-600 dark:text-zinc-300 truncate pr-4">{group.latestActivity}</span>
                      <span className="text-xs text-zinc-400 whitespace-nowrap">{group.time}</span>
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Create New Group Card */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
                className="card-hover p-5 border-dashed border-2 flex flex-col items-center justify-center h-48 cursor-pointer hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/5 group"
              >
                <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-white/[0.04] group-hover:bg-indigo-100 dark:group-hover:bg-indigo-500/20 flex items-center justify-center mb-3 transition-colors">
                  <Plus className="w-6 h-6 text-zinc-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                </div>
                <h3 className="font-bold text-zinc-900 dark:text-white">Create New Group</h3>
                <p className="text-xs text-zinc-500 mt-1">Start a study group or project team</p>
              </motion.div>
            </div>
          </div>

          {/* Right Sidebar - Activity Feed */}
          <div className="w-full xl:w-96 space-y-6">
            <div className="card h-full min-h-[500px]">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-indigo-500" /> Activity Feed
                </h3>
                <button className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-zinc-200 dark:before:via-white/[0.06] before:to-transparent">
                {feed.map((item, i) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    key={i} 
                    className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
                  >
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-white dark:border-[#0d1117] ${item.bg} ${item.color} shrink-0 z-10 mx-auto`}>
                      <item.icon className="w-4 h-4" />
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-2xl bg-zinc-50 dark:bg-white/[0.02] border border-zinc-100 dark:border-white/[0.04]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-zinc-900 dark:text-white">{item.user}</span>
                        <span className="text-[10px] text-zinc-500">{item.time}</span>
                      </div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-400 mb-2">
                        {item.action} in <span className="font-semibold text-indigo-600 dark:text-indigo-400">{item.group}</span>
                      </div>
                      <div className="text-sm font-medium text-zinc-900 dark:text-white p-2 rounded-lg bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/[0.04]">
                        {item.item}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

            </div>
          </div>

        </div>
      </div>
    </>
  );
}

'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Users, Search, Plus, MessageCircle, MoreVertical } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const MOCK_GROUPS = [
  { id: 1, name: 'CS101 Study Group', members: 12, lastActive: '2 hours ago', type: 'Study', image: 'CS' },
  { id: 2, name: 'Web Dev Bootcamp Project', members: 4, lastActive: '5 mins ago', type: 'Project', image: 'WD' },
  { id: 3, name: 'Robotics Club', members: 45, lastActive: '1 day ago', type: 'Extracurricular', image: 'RC' },
  { id: 4, name: 'Algorithm Enthusiasts', members: 28, lastActive: '3 hours ago', type: 'Interest', image: 'AE' },
];

export default function StudentGroups() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <>
      <Topbar title="My Groups" subtitle="Collaborate with your peers" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input 
                type="text" 
                placeholder="Search groups..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-zinc-900/50 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 transition-all"
              />
            </div>
            
            <button onClick={() => toast.success('Create Group clicked')} className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium transition-colors w-full sm:w-auto justify-center">
              <Plus className="w-4 h-4" /> Create Group
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {MOCK_GROUPS.map((group) => (
              <div key={group.id} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors group cursor-pointer relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4">
                  <button onClick={(e) => { e.stopPropagation(); toast.success('Options clicked'); }} className="text-zinc-500 hover:text-white transition-colors">
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center text-xl font-bold text-indigo-400 mb-4 group-hover:scale-105 transition-transform">
                    {group.image}
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-1 line-clamp-1">{group.name}</h3>
                  <div className="inline-block px-2.5 py-0.5 rounded-full bg-zinc-800 text-xs font-medium text-zinc-400 mb-4">
                    {group.type}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 py-4 border-t border-b border-zinc-800/50 mb-4">
                  <div className="text-center">
                    <div className="text-xs text-zinc-500 mb-1">Members</div>
                    <div className="text-sm font-medium text-zinc-300 flex items-center justify-center gap-1">
                      <Users className="w-3 h-3 text-zinc-500" /> {group.members}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-zinc-500 mb-1">Active</div>
                    <div className="text-sm font-medium text-zinc-300">
                      {group.lastActive}
                    </div>
                  </div>
                </div>

                <button onClick={() => window.open('/assets/dummy.pdf', '_blank')}} className="w-full py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                  <MessageCircle className="w-4 h-4" /> Open Chat
                </button>
              </div>
            ))}
          </div>

        </div>
      </div>
    </>
  );
}

'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Users, Calendar, MapPin, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const ASSOCIATIONS = [
  { id: 1, name: 'Computer Science Society', category: 'Academic', nextMeeting: 'Tomorrow, 6 PM', location: 'Innovation Hub', memberCount: 120 },
  { id: 2, name: 'Debate Club', category: 'Extracurricular', nextMeeting: 'Friday, 5 PM', location: 'Room 304', memberCount: 45 },
  { id: 3, name: 'Robotics Team', category: 'Academic', nextMeeting: 'Saturday, 10 AM', location: 'Engineering Lab', memberCount: 85 },
  { id: 4, name: 'Green Earth Initiative', category: 'Social', nextMeeting: 'Next Monday, 4 PM', location: 'Student Union', memberCount: 200 },
];

export default function AssociationsPage() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <>
      <Topbar title="Associations Schedule" subtitle="Discover and join student clubs" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search associations..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {ASSOCIATIONS.map(assoc => (
              <div key={assoc.id} className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-xl hover:border-zinc-700 transition-colors">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-white">{assoc.name}</h3>
                    <span className="text-xs font-medium text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-full mt-2 inline-block">
                      {assoc.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-zinc-400 text-sm bg-zinc-800/50 px-3 py-1 rounded-full">
                    <Users className="w-4 h-4" /> {assoc.memberCount}
                  </div>
                </div>
                
                <div className="space-y-3 pt-4 border-t border-zinc-800/50">
                  <div className="flex items-center gap-2 text-zinc-300">
                    <Calendar className="w-4 h-4 text-zinc-500" /> 
                    <span className="text-sm font-medium">Next Meeting:</span>
                    <span className="text-sm">{assoc.nextMeeting}</span>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-300">
                    <MapPin className="w-4 h-4 text-zinc-500" /> 
                    <span className="text-sm">{assoc.location}</span>
                  </div>
                </div>
                
                <button onClick={() => toast.success(`Joined ${assoc.name}`)} className="mt-6 w-full py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-medium rounded-lg transition-colors">
                  Join Association
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

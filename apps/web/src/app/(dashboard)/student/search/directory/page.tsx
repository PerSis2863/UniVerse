'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Search, Mail, Filter, Building2, MapPin } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const MOCK_DIRECTORY = [
  { id: 1, name: 'Alice Johnson', major: 'B.S. Computer Science', year: 'Junior', location: 'Campus Dorms', email: 'alice.j@universe.edu', avatar: 'A' },
  { id: 2, name: 'Bob Smith', major: 'B.A. Business Admin', year: 'Senior', location: 'Off-Campus', email: 'bob.s@universe.edu', avatar: 'B' },
  { id: 3, name: 'Charlie Davis', major: 'B.S. Engineering', year: 'Sophomore', location: 'Campus Dorms', email: 'charlie.d@universe.edu', avatar: 'C' },
  { id: 4, name: 'Diana Prince', major: 'B.S. Physics', year: 'Freshman', location: 'Campus Dorms', email: 'diana.p@universe.edu', avatar: 'D' },
  { id: 5, name: 'Evan Wright', major: 'B.A. Graphic Design', year: 'Junior', location: 'Off-Campus', email: 'evan.w@universe.edu', avatar: 'E' },
  { id: 6, name: 'Fiona Gallagher', major: 'B.S. Mathematics', year: 'Senior', location: 'Off-Campus', email: 'fiona.g@universe.edu', avatar: 'F' },
];

export default function StudentDirectory() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredStudents = MOCK_DIRECTORY.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.major.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <Topbar title="Student Directory" subtitle="Find and connect with peers across the university" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input 
                type="text" 
                placeholder="Search by name, major, or year..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 transition-all shadow-sm"
              />
            </div>
            <button onClick={() => toast.success('Filters clicked')} className="flex items-center gap-2 bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 px-6 py-3 rounded-xl transition-colors whitespace-nowrap font-medium">
              <Filter className="w-4 h-4" /> Filters
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredStudents.map((student) => (
              <div key={student.id} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors group">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-xl font-bold text-indigo-400 shadow-sm flex-shrink-0 group-hover:scale-105 transition-transform">
                    {student.avatar}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-white truncate">{student.name}</h3>
                    <div className="text-sm font-medium text-indigo-400 truncate">{student.major}</div>
                  </div>
                </div>

                <div className="space-y-2 mb-6">
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Building2 className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                    <span>{student.year}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <MapPin className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                    <span>{student.location}</span>
                  </div>
                </div>

                <button onClick={() => toast.success(`Messaging ${student.name}`)} className="w-full py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                  <Mail className="w-4 h-4" /> Message
                </button>
              </div>
            ))}
          </div>
          
          {filteredStudents.length === 0 && (
            <div className="p-12 text-center bg-zinc-900/50 border border-zinc-800 rounded-xl">
              <div className="text-zinc-400 text-lg">No students found matching your search.</div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}

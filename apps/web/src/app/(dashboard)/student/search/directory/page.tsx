'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Search, Mail, Filter, Building2, MapPin, X, User } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

const MOCK_DIRECTORY = [
  { id: 1, name: 'Alice Johnson', major: 'B.S. Computer Science', year: 'Junior', location: 'Campus Dorms', email: 'alice.j@universe.edu', avatar: 'A' },
  { id: 2, name: 'Bob Smith', major: 'B.A. Business Admin', year: 'Senior', location: 'Off-Campus', email: 'bob.s@universe.edu', avatar: 'B' },
  { id: 3, name: 'Charlie Davis', major: 'B.S. Engineering', year: 'Sophomore', location: 'Campus Dorms', email: 'charlie.d@universe.edu', avatar: 'C' },
  { id: 4, name: 'Diana Prince', major: 'B.S. Physics', year: 'Freshman', location: 'Campus Dorms', email: 'diana.p@universe.edu', avatar: 'D' },
  { id: 5, name: 'Evan Wright', major: 'B.A. Graphic Design', year: 'Junior', location: 'Off-Campus', email: 'evan.w@universe.edu', avatar: 'E' },
  { id: 6, name: 'Fiona Gallagher', major: 'B.S. Mathematics', year: 'Senior', location: 'Off-Campus', email: 'fiona.g@universe.edu', avatar: 'F' },
];

export default function StudentDirectory() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeModal, setActiveModal] = useState<'filter' | null>(null);
  
  // Filters
  const [filterYear, setFilterYear] = useState('');
  const [filterLocation, setFilterLocation] = useState('');

  const filteredStudents = MOCK_DIRECTORY.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          s.major.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesYear = filterYear ? s.year === filterYear : true;
    const matchesLocation = filterLocation ? s.location === filterLocation : true;
    return matchesSearch && matchesYear && matchesLocation;
  });

  return (
    <>
      <Topbar title="Student Directory" subtitle="Find and connect with peers across the university" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 dark:text-zinc-400" />
              <input 
                type="text" 
                placeholder="Search by name, major, or year..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:text-zinc-500 focus:outline-none focus:border-indigo-500 transition-all shadow-sm"
              />
            </div>
            <button onClick={() => setActiveModal('filter')} className="flex items-center gap-2 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:bg-zinc-800 text-zinc-300 px-6 py-3 rounded-xl transition-colors whitespace-nowrap font-medium">
              <Filter className="w-4 h-4" /> Filters
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredStudents.map((student) => (
              <div key={student.id} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors group">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-xl font-bold text-indigo-400 shadow-sm flex-shrink-0 group-hover:scale-105 transition-transform">
                    {student.avatar}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white truncate">{student.name}</h3>
                    <div className="text-sm font-medium text-indigo-400 truncate">{student.major}</div>
                  </div>
                </div>

                <div className="space-y-2 mb-6">
                  <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <Building2 className="w-4 h-4 text-zinc-500 dark:text-zinc-500 flex-shrink-0" />
                    <span>{student.year}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <MapPin className="w-4 h-4 text-zinc-500 dark:text-zinc-500 flex-shrink-0" />
                    <span>{student.location}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => router.push(`/student/inbox?chatWith=${encodeURIComponent(student.name)}`)} className="flex-1 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                    <Mail className="w-4 h-4" /> Message
                  </button>
                  <button onClick={() => router.push(`/student/profile/${encodeURIComponent(student.name)}`)} className="flex-1 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                    <User className="w-4 h-4" /> Profile
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          {filteredStudents.length === 0 && (
            <div className="p-12 text-center bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <div className="text-zinc-600 dark:text-zinc-400 text-lg">No students found matching your search.</div>
            </div>
          )}

        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {activeModal === 'filter' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setActiveModal(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-[#0d1117] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-white/[0.02]">
                <h2 className="text-xl font-bold text-white">Filter Directory</h2>
                <button onClick={() => setActiveModal(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">Year</label>
                  <select 
                    value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 px-4 text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
                  >
                    <option value="">Any Year</option>
                    <option value="Freshman">Freshman</option>
                    <option value="Sophomore">Sophomore</option>
                    <option value="Junior">Junior</option>
                    <option value="Senior">Senior</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">Location</label>
                  <select 
                    value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 px-4 text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
                  >
                    <option value="">Any Location</option>
                    <option value="Campus Dorms">Campus Dorms</option>
                    <option value="Off-Campus">Off-Campus</option>
                  </select>
                </div>
                <button onClick={() => setActiveModal(null)} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors">
                  Apply Filters
                </button>
              </div>
            </motion.div>
          </div>
        )}


      </AnimatePresence>
    </>
  );
}

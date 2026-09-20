'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Search, Building, MapPin, Calendar, ExternalLink, Filter, X } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

const INTERNSHIP_HISTORY = [
  { id: 1, student: 'Alice Johnson', company: 'Google', role: 'Software Engineering Intern', location: 'Mountain View, CA', term: 'Summer 2026', logo: 'G' },
  { id: 2, student: 'Bob Smith', company: 'Goldman Sachs', role: 'Investment Banking Analyst', location: 'New York, NY', term: 'Summer 2026', logo: 'GS' },
  { id: 3, student: 'Charlie Davis', company: 'NASA JPL', role: 'Robotics Research Intern', location: 'Pasadena, CA', term: 'Fall 2025', logo: 'N' },
  { id: 4, student: 'Diana Prince', company: 'Tesla', role: 'Battery Engineering Intern', location: 'Austin, TX', term: 'Summer 2026', logo: 'T' },
  { id: 5, student: 'Evan Wright', company: 'Adobe', role: 'UX Design Intern', location: 'San Francisco, CA', term: 'Spring 2026', logo: 'A' },
];

export default function InternshipHistory() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState('All');
  const [selectedTerm, setSelectedTerm] = useState('All');

  const filteredInternships = INTERNSHIP_HISTORY.filter(internship => {
    const matchesSearch = 
      internship.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      internship.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
      internship.student.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesLocation = selectedLocation === 'All' || internship.location.includes(selectedLocation);
    const matchesTerm = selectedTerm === 'All' || internship.term === selectedTerm;

    return matchesSearch && matchesLocation && matchesTerm;
  });

  const uniqueLocations = Array.from(new Set(INTERNSHIP_HISTORY.map(i => i.location.split(',')[0])));
  const uniqueTerms = Array.from(new Set(INTERNSHIP_HISTORY.map(i => i.term)));

  return (
    <>
      <Topbar title="Internship History" subtitle="See where fellow students have interned" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 dark:text-zinc-400" />
              <input 
                type="text" 
                placeholder="Search by company, role, or student name..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:text-zinc-500 focus:outline-none focus:border-indigo-500 transition-all"
              />
            </div>
            <button 
              onClick={() => setShowFilters(true)} 
              className={`flex items-center gap-2 border px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${showFilters || selectedLocation !== 'All' || selectedTerm !== 'All' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
            >
              <Filter className="w-4 h-4" /> Filters {(selectedLocation !== 'All' || selectedTerm !== 'All') && '(Active)'}
            </button>
          </div>

          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80">
                  <th className="p-4 text-sm font-medium text-zinc-600 dark:text-zinc-400">Company & Role</th>
                  <th className="p-4 text-sm font-medium text-zinc-600 dark:text-zinc-400">Student</th>
                  <th className="p-4 text-sm font-medium text-zinc-600 dark:text-zinc-400 hidden sm:table-cell">Location</th>
                  <th className="p-4 text-sm font-medium text-zinc-600 dark:text-zinc-400 hidden md:table-cell">Term</th>
                  <th className="p-4 text-sm font-medium text-zinc-600 dark:text-zinc-400 text-right">Connect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredInternships.map((internship) => (
                  <tr key={internship.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-bold text-indigo-400 flex-shrink-0">
                          {internship.logo}
                        </div>
                        <div>
                          <div className="font-medium text-zinc-900 dark:text-white group-hover:text-indigo-400 transition-colors cursor-pointer">{internship.role}</div>
                          <div className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                            <Building className="w-3 h-3" /> {internship.company}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-sm font-medium text-zinc-200">{internship.student}</div>
                    </td>
                    <td className="p-4 text-sm text-zinc-600 dark:text-zinc-400 hidden sm:table-cell">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3" /> {internship.location}
                      </div>
                    </td>
                    <td className="p-4 text-sm text-zinc-600 dark:text-zinc-400 hidden md:table-cell">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" /> {internship.term}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => router.push(`/student/inbox?chatWith=${encodeURIComponent(internship.student)}`)} 
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-indigo-600 hover:text-white text-zinc-300 rounded-lg text-sm font-medium transition-colors"
                      >
                        Ask about experience <ExternalLink className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredInternships.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-zinc-500">
                      No internships found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      </div>

      {/* Filter Modal */}
      <AnimatePresence>
        {showFilters && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl relative"
            >
              <button
                onClick={() => setShowFilters(false)}
                className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-xl font-bold text-white mb-6">Filter Internships</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Location</label>
                  <select 
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="All">All Locations</option>
                    {uniqueLocations.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Term</label>
                  <select 
                    value={selectedTerm}
                    onChange={(e) => setSelectedTerm(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="All">All Terms</option>
                    {uniqueTerms.map(term => (
                      <option key={term} value={term}>{term}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button
                  onClick={() => {
                    setSelectedLocation('All');
                    setSelectedTerm('All');
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-700 text-white hover:bg-zinc-800 font-medium transition-colors"
                >
                  Reset
                </button>
                <button
                  onClick={() => setShowFilters(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors"
                >
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

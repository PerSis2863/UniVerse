'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Search, Building, MapPin, Calendar, ExternalLink, Filter } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const INTERNSHIP_HISTORY = [
  { id: 1, student: 'Alice Johnson', company: 'Google', role: 'Software Engineering Intern', location: 'Mountain View, CA', term: 'Summer 2026', logo: 'G' },
  { id: 2, student: 'Bob Smith', company: 'Goldman Sachs', role: 'Investment Banking Analyst', location: 'New York, NY', term: 'Summer 2026', logo: 'GS' },
  { id: 3, student: 'Charlie Davis', company: 'NASA JPL', role: 'Robotics Research Intern', location: 'Pasadena, CA', term: 'Fall 2025', logo: 'N' },
  { id: 4, student: 'Diana Prince', company: 'Tesla', role: 'Battery Engineering Intern', location: 'Austin, TX', term: 'Summer 2026', logo: 'T' },
  { id: 5, student: 'Evan Wright', company: 'Adobe', role: 'UX Design Intern', location: 'San Francisco, CA', term: 'Spring 2026', logo: 'A' },
];

export default function InternshipHistory() {
  const [searchTerm, setSearchTerm] = useState('');

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
            <button onClick={() => toast.success('Filters clicked')} className="flex items-center gap-2 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:bg-zinc-800 text-zinc-300 px-4 py-2 rounded-lg transition-colors whitespace-nowrap">
              <Filter className="w-4 h-4" /> Filters
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
                {INTERNSHIP_HISTORY.map((internship) => (
                  <tr key={internship.id} className="hover:bg-zinc-100 dark:bg-zinc-800/30 transition-colors group">
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
                      <button onClick={() => toast.success(`Asking ${internship.student} about their experience...`)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-900 dark:text-white rounded-lg text-sm font-medium transition-colors">
                        Ask about experience <ExternalLink className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </>
  );
}

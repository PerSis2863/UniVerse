'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Briefcase, Building, MapPin, DollarSign, Search, Filter, Bookmark, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const INTERNSHIPS = [
  { id: 1, role: 'Software Engineering Intern', company: 'TechCorp', location: 'San Francisco, CA', type: 'Summer 2027', salary: '$40-50/hr', status: 'Actively Hiring', logo: 'TC' },
  { id: 2, role: 'Data Science Intern', company: 'DataSys', location: 'Remote', type: 'Fall 2026', salary: '$35-45/hr', status: 'Closing Soon', logo: 'DS' },
  { id: 3, role: 'Product Design Intern', company: 'CreativeStudio', location: 'New York, NY', type: 'Summer 2027', salary: '$30-40/hr', status: 'New', logo: 'CS' },
  { id: 4, role: 'Marketing Intern', company: 'GlobalBrand', location: 'Chicago, IL', type: 'Spring 2027', salary: 'Unpaid', status: 'Open', logo: 'GB' },
];

export default function StudentInternships() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <>
      <Topbar title="Internships" subtitle="Find and apply for internship opportunities" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 dark:text-zinc-400" />
              <input 
                type="text" 
                placeholder="Search by role, company, or skills..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:text-zinc-500 focus:outline-none focus:border-indigo-500 transition-all"
              />
            </div>
            <button onClick={() => toast.success('Filters clicked')} className="flex items-center gap-2 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:bg-zinc-800 text-zinc-300 px-4 py-2 rounded-lg transition-colors whitespace-nowrap">
              <Filter className="w-4 h-4" /> Filters
            </button>
            <button onClick={() => toast.success('My Applications clicked')} className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-zinc-900 dark:text-white px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap">
              <Briefcase className="w-4 h-4" /> My Applications
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            {INTERNSHIPS.map((job) => (
              <div key={job.id} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors group">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center font-bold text-indigo-400">
                      {job.logo}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-zinc-900 dark:text-white group-hover:text-indigo-400 transition-colors">{job.role}</h3>
                      <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                        <Building className="w-3.5 h-3.5" /> {job.company}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => toast.success('Bookmark clicked')} className="text-zinc-500 dark:text-zinc-500 hover:text-indigo-400 transition-colors">
                    <Bookmark className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="flex items-center gap-2 text-sm text-zinc-300">
                    <MapPin className="w-4 h-4 text-zinc-500 dark:text-zinc-500" />
                    <span className="truncate">{job.location}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-zinc-300">
                    <Briefcase className="w-4 h-4 text-zinc-500 dark:text-zinc-500" />
                    <span>{job.type}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-zinc-300">
                    <DollarSign className="w-4 h-4 text-zinc-500 dark:text-zinc-500" />
                    <span>{job.salary}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
                  <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    job.status === 'Actively Hiring' ? 'bg-green-500/10 text-green-400' :
                    job.status === 'Closing Soon' ? 'bg-amber-500/10 text-amber-400' :
                    'bg-indigo-500/10 text-indigo-400'
                  }`}>
                    {job.status}
                  </div>
                  
                  <button onClick={() => toast.success('Apply Now clicked')} className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-white hover:text-indigo-400 transition-colors">
                    Apply Now <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </>
  );
}

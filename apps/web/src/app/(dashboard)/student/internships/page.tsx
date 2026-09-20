'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Briefcase, Building, MapPin, DollarSign, Search, Filter, Bookmark, ExternalLink, X, FileText, Check, Edit2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const INITIAL_INTERNSHIPS = [
  { id: 1, role: 'Software Engineering Intern', company: 'TechCorp', location: 'San Francisco, CA', type: 'Summer 2027', salary: '$40-50/hr', status: 'Actively Hiring', logo: 'TC' },
  { id: 2, role: 'Data Science Intern', company: 'DataSys', location: 'Remote', type: 'Fall 2026', salary: '$35-45/hr', status: 'Closing Soon', logo: 'DS' },
  { id: 3, role: 'Product Design Intern', company: 'CreativeStudio', location: 'New York, NY', type: 'Summer 2027', salary: '$30-40/hr', status: 'New', logo: 'CS' },
  { id: 4, role: 'Marketing Intern', company: 'GlobalBrand', location: 'Chicago, IL', type: 'Spring 2027', salary: 'Unpaid', status: 'Open', logo: 'GB' },
  { id: 5, role: 'Machine Learning Intern', company: 'AI Labs', location: 'Remote', type: 'Summer 2027', salary: '$45-60/hr', status: 'Actively Hiring', logo: 'AL' },
  { id: 6, role: 'Frontend Developer Intern', company: 'WebSolutions', location: 'Austin, TX', type: 'Fall 2026', salary: '$25-35/hr', status: 'Open', logo: 'WS' },
  { id: 7, role: 'Cybersecurity Intern', company: 'SecureNet', location: 'Washington, DC', type: 'Summer 2027', salary: '$35-50/hr', status: 'Closing Soon', logo: 'SN' },
];

export default function StudentInternships() {
  const [searchTerm, setSearchTerm] = useState('');
  const [bookmarkedIds, setBookmarkedIds] = useState<number[]>([]);
  
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [selectedType, setSelectedType] = useState('All');
  
  const [activeApplication, setActiveApplication] = useState<typeof INITIAL_INTERNSHIPS[0] | null>(null);
  const [formData, setFormData] = useState({ resume: '', coverLetter: '' });
  
  const [showMyApplications, setShowMyApplications] = useState(false);
  const [applications, setApplications] = useState<{ id: number; internship: typeof INITIAL_INTERNSHIPS[0]; resume: string; coverLetter: string; appliedAt: string; status: string }[]>([]);
  const [editingAppId, setEditingAppId] = useState<number | null>(null);

  const toggleBookmark = (id: number) => {
    setBookmarkedIds(prev => prev.includes(id) ? prev.filter(bId => bId !== id) : [...prev, id]);
  };

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeApplication) return;

    if (editingAppId) {
      setApplications(apps => apps.map(app => app.id === editingAppId ? { ...app, resume: formData.resume, coverLetter: formData.coverLetter } : app));
      toast.success("Application updated successfully!");
    } else {
      const newApp = {
        id: Date.now(),
        internship: activeApplication,
        resume: formData.resume || 'resume.pdf',
        coverLetter: formData.coverLetter,
        appliedAt: new Date().toLocaleDateString(),
        status: 'Applied'
      };
      setApplications([newApp, ...applications]);
      toast.success(`Successfully applied to ${activeApplication.company}!`);
    }
    
    setActiveApplication(null);
    setFormData({ resume: '', coverLetter: '' });
    setEditingAppId(null);
  };

  const filteredInternships = INITIAL_INTERNSHIPS.filter(job => {
    const matchesSearch = job.role.toLowerCase().includes(searchTerm.toLowerCase()) || job.company.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === 'All' || job.type.includes(selectedType) || job.status.includes(selectedType);
    return matchesSearch && matchesType;
  });

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
            <button onClick={() => setShowFilterDrawer(true)} className="flex items-center gap-2 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-4 py-2 rounded-lg transition-colors whitespace-nowrap">
              <Filter className="w-4 h-4" /> Filters
            </button>
            <button onClick={() => setShowMyApplications(true)} className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap">
              <Briefcase className="w-4 h-4" /> My Applications
              {applications.length > 0 && (
                <span className="ml-1 bg-white/20 px-2 py-0.5 rounded-full text-xs">{applications.length}</span>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            {filteredInternships.map((job) => (
              <div key={job.id} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors group">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center font-bold text-indigo-500 dark:text-indigo-400">
                      {job.logo}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-zinc-900 dark:text-white group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors">{job.role}</h3>
                      <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                        <Building className="w-3.5 h-3.5" /> {job.company}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => toggleBookmark(job.id)} className={`transition-colors ${bookmarkedIds.includes(job.id) ? 'text-indigo-500' : 'text-zinc-400 hover:text-indigo-400'}`}>
                    <Bookmark className={`w-5 h-5 ${bookmarkedIds.includes(job.id) ? 'fill-current' : ''}`} />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                    <MapPin className="w-4 h-4 text-zinc-400" />
                    <span className="truncate">{job.location}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                    <Briefcase className="w-4 h-4 text-zinc-400" />
                    <span className="truncate">{job.type}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                    <DollarSign className="w-4 h-4 text-zinc-400" />
                    <span>{job.salary}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
                  <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    job.status === 'Actively Hiring' ? 'bg-green-500/10 text-green-600 dark:text-green-400' :
                    job.status === 'Closing Soon' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                    'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                  }`}>
                    {job.status}
                  </div>
                  
                  {applications.some(a => a.internship.id === job.id) ? (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
                      <Check className="w-4 h-4" /> Applied
                    </span>
                  ) : (
                    <button onClick={() => { setActiveApplication(job); setFormData({ resume: '', coverLetter: '' }); setEditingAppId(null); }} className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-white hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors">
                      Apply Now <ExternalLink className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            
            {filteredInternships.length === 0 && (
              <div className="col-span-1 md:col-span-2 text-center py-12 text-zinc-500">
                No internships found matching your criteria.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter Drawer */}
      <AnimatePresence>
        {showFilterDrawer && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowFilterDrawer(false)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }} className="fixed right-0 top-0 h-full w-full sm:w-80 bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl z-50 overflow-y-auto">
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Filter className="w-5 h-5 text-indigo-500" /> Filters</h2>
                <button onClick={() => setShowFilterDrawer(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">Timeframe</h3>
                  <div className="space-y-2">
                    {['All', 'Summer 2027', 'Fall 2026', 'Spring 2027'].map(type => (
                      <label key={type} className="flex items-center gap-3 cursor-pointer group">
                        <input type="radio" name="filter-time" checked={selectedType === type} onChange={() => setSelectedType(type)} className="w-4 h-4 text-indigo-500 focus:ring-indigo-500 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800" />
                        <span className={`text-sm ${selectedType === type ? 'text-zinc-900 dark:text-white font-medium' : 'text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-300'}`}>{type}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">Status</h3>
                  <div className="space-y-2">
                    {['Actively Hiring', 'Closing Soon', 'New', 'Open'].map(type => (
                      <label key={type} className="flex items-center gap-3 cursor-pointer group">
                        <input type="radio" name="filter-status" checked={selectedType === type} onChange={() => setSelectedType(type)} className="w-4 h-4 text-indigo-500 focus:ring-indigo-500 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800" />
                        <span className={`text-sm ${selectedType === type ? 'text-zinc-900 dark:text-white font-medium' : 'text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-300'}`}>{type}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="pt-4 mt-4 border-t border-zinc-200 dark:border-zinc-800">
                  <button onClick={() => { setSelectedType('All'); setShowFilterDrawer(false); toast.success('Filters cleared'); }} className="w-full py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-lg text-sm font-medium transition-colors">Clear All Filters</button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Application Modal (Apply Now & Edit) */}
      <AnimatePresence>
        {activeApplication && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && setActiveApplication(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-900/50">
                <div>
                  <h3 className="font-bold text-zinc-900 dark:text-white text-xl">{editingAppId ? 'Edit Application' : 'Apply Now'}</h3>
                  <p className="text-sm text-zinc-500">{activeApplication.role} at {activeApplication.company}</p>
                </div>
                <button onClick={() => setActiveApplication(null)} className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleApply} className="p-6 space-y-5">
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 block">Resume</label>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-zinc-900 dark:text-white">Aditya_Bhatt_Resume.pdf</p>
                      <p className="text-xs text-zinc-500">Using default profile resume</p>
                    </div>
                    <button type="button" className="text-sm font-medium text-indigo-500 hover:text-indigo-600 transition-colors">Change</button>
                  </div>
                </div>
                
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 block">Cover Letter (Optional)</label>
                  <textarea 
                    value={formData.coverLetter}
                    onChange={e => setFormData({ ...formData, coverLetter: e.target.value })}
                    rows={4} 
                    placeholder={`Why are you a great fit for the ${activeApplication.role} role?`}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-all resize-none"
                  ></textarea>
                </div>

                <div className="pt-2">
                  <button type="submit" className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-3 rounded-xl transition-colors shadow-lg shadow-indigo-500/20">
                    {editingAppId ? 'Update Application' : 'Submit Application'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* My Applications Drawer */}
      <AnimatePresence>
        {showMyApplications && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowMyApplications(false)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }} className="fixed right-0 top-0 h-full w-full sm:w-[500px] bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl z-50 overflow-y-auto flex flex-col">
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <Briefcase className="w-6 h-6 text-indigo-500" /> My Applications
                </h2>
                <button onClick={() => setShowMyApplications(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors"><X className="w-5 h-5" /></button>
              </div>
              
              <div className="p-6 flex-1 overflow-y-auto space-y-4 bg-zinc-50 dark:bg-black/20">
                {applications.length === 0 ? (
                  <div className="text-center py-20">
                    <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Briefcase className="w-8 h-8 text-zinc-400" />
                    </div>
                    <h3 className="text-zinc-900 dark:text-white font-bold mb-1">No applications yet</h3>
                    <p className="text-sm text-zinc-500">Apply to internships to see them tracked here.</p>
                  </div>
                ) : (
                  applications.map((app) => (
                    <div key={app.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex gap-3">
                          <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-indigo-500">
                            {app.internship.logo}
                          </div>
                          <div>
                            <h4 className="font-bold text-zinc-900 dark:text-white">{app.internship.role}</h4>
                            <p className="text-sm text-zinc-500">{app.internship.company}</p>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-medium rounded-full">
                          {app.status}
                        </span>
                      </div>
                      
                      <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 bg-zinc-50 dark:bg-zinc-950 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800/50">
                        <p><span className="font-semibold text-zinc-900 dark:text-white">Applied:</span> {app.appliedAt}</p>
                        {app.coverLetter && (
                          <p className="mt-2 line-clamp-2"><span className="font-semibold text-zinc-900 dark:text-white">Cover Letter:</span> "{app.coverLetter}"</p>
                        )}
                      </div>
                      
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            setEditingAppId(app.id);
                            setActiveApplication(app.internship);
                            setFormData({ resume: app.resume, coverLetter: app.coverLetter });
                            setShowMyApplications(false);
                          }} 
                          className="flex-1 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <Edit2 className="w-4 h-4" /> Edit Details
                        </button>
                        <button 
                          onClick={() => {
                            setApplications(apps => apps.filter(a => a.id !== app.id));
                            toast.success("Application withdrawn");
                          }} 
                          className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-400 hover:text-red-500 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

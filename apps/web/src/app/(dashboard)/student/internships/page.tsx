'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Briefcase, Building, MapPin, DollarSign, Search, Filter, Bookmark, ExternalLink, X, FileText, Check, Edit2, Trash2, Loader2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import Image from 'next/image';

export default function StudentInternships() {
  const [searchTerm, setSearchTerm] = useState('');
  const [bookmarkedIds, setBookmarkedIds] = useState<number[]>([]);
  
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [selectedType, setSelectedType] = useState('All');
  
  const [activeApplication, setActiveApplication] = useState<any>(null);
  const [formData, setFormData] = useState({ resume: '', coverLetter: '' });
  
  const [showMyApplications, setShowMyApplications] = useState(false);
  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data fetching
  const [internships, setInternships] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const SAMPLE_INTERNSHIPS = [
    { id: 1, title: 'Software Engineering Intern', company: { name: 'Google', logoUrl: null }, location: 'Mountain View, CA', type: 'On-site', duration: '12 weeks', stipend: '$8,500/mo', tags: ['React', 'Python', 'Cloud'], deadline: '2027-03-01', description: 'Join Google\'s engineering team to build products used by billions.', isBookmarked: false },
    { id: 2, title: 'ML Research Intern', company: { name: 'DeepMind', logoUrl: null }, location: 'London, UK', type: 'Hybrid', duration: '6 months', stipend: '£6,000/mo', tags: ['PyTorch', 'NLP', 'LLMs'], deadline: '2027-02-15', description: 'Work alongside world-class researchers on frontier AI problems.', isBookmarked: false },
    { id: 3, title: 'Data Science Intern', company: { name: 'Spotify', logoUrl: null }, location: 'Stockholm, Sweden', type: 'Remote', duration: '10 weeks', stipend: '€4,500/mo', tags: ['SQL', 'Python', 'ML'], deadline: '2027-03-20', description: 'Analyze music trends and build recommendation features at scale.', isBookmarked: false },
    { id: 4, title: 'Product Design Intern', company: { name: 'Figma', logoUrl: null }, location: 'San Francisco, CA', type: 'On-site', duration: '12 weeks', stipend: '$7,000/mo', tags: ['UX', 'Figma', 'Prototyping'], deadline: '2027-04-01', description: 'Shape the future of design tools used by millions of designers.', isBookmarked: false },
    { id: 5, title: 'Backend Engineering Intern', company: { name: 'Stripe', logoUrl: null }, location: 'Dublin, Ireland', type: 'Hybrid', duration: '6 months', stipend: '€5,500/mo', tags: ['Go', 'Distributed Systems', 'APIs'], deadline: '2027-02-28', description: 'Build payments infrastructure that powers the global economy.', isBookmarked: false },
    { id: 6, title: 'Impact Technology Intern', company: { name: 'UNICEF', logoUrl: null }, location: 'New York, NY', type: 'Hybrid', duration: '3 months', stipend: '$3,200/mo', tags: ['Social Impact', 'Data', 'Python'], deadline: '2027-03-15', description: 'Use technology to improve outcomes for children worldwide.', isBookmarked: false },
  ];

  const fetchInternships = async () => {
    try {
      const [internshipsRes, appsRes] = await Promise.all([
        api.get('/internships'),
        api.get('/internships/my-applications')
      ]);
      const data = internshipsRes.data || [];
      setInternships(data.length > 0 ? data : SAMPLE_INTERNSHIPS);
      setApplications(appsRes.data || []);
    } catch (error) {
      // Backend offline — show sample data
      setInternships(SAMPLE_INTERNSHIPS);
      setApplications([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInternships();
  }, []);


  const toggleBookmark = (id: number) => {
    setBookmarkedIds(prev => prev.includes(id) ? prev.filter(bId => bId !== id) : [...prev, id]);
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeApplication) return;

    try {
      if (editingAppId) {
        await api.patch(`/internships/applications/${editingAppId}`, {
          coverLetter: formData.coverLetter,
          cvUrl: formData.resume,
        });
        toast.success("Application updated successfully!");
      } else {
        await api.post(`/internships/${activeApplication.id}/apply`, {
          coverLetter: formData.coverLetter,
          cvUrl: formData.resume || 'resume.pdf',
        });
        toast.success(`Successfully applied to ${activeApplication.company?.name || 'the company'}!`);
      }
      
      setActiveApplication(null);
      setFormData({ resume: '', coverLetter: '' });
      setEditingAppId(null);
      fetchInternships(); // refresh data
    } catch (error) {
      console.error(error);
      toast.error('Failed to submit application');
    }
  };

  const withdrawApplication = async (id: string) => {
    try {
      // In a real app we might DELETE, but PATCH status is safer
      await api.patch(`/internships/applications/${id}`, { status: 'REJECTED' }); // using rejected or withdrawn if it exists
      toast.success("Application withdrawn");
      fetchInternships();
    } catch (error) {
      console.error(error);
      toast.error('Failed to withdraw');
    }
  };

  const filteredInternships = internships.filter(job => {
    const matchesSearch = (job.title || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (job.company?.name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === 'All' || job.type === selectedType;
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

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
              <Loader2 className="w-8 h-8 animate-spin mb-4 text-indigo-500" />
              <p>Loading internships...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
              {filteredInternships.map((job) => {
                const hasApplied = applications.some(a => a.internshipId === job.id);
                return (
                  <div key={job.id} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors group flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex gap-4">
                        <div className="w-12 h-12 relative rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center font-bold text-indigo-500 dark:text-indigo-400 overflow-hidden shrink-0">
                          {job.company?.logoUrl ? (
                            <Image src={job.company.logoUrl} alt={job.company.name} fill className="object-cover" />
                          ) : (
                            job.company?.name?.substring(0, 2).toUpperCase() || 'C'
                          )}
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">{job.title}</h3>
                          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                            <Building className="w-3.5 h-3.5" /> {job.company?.name}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => toggleBookmark(job.id)} className={`transition-colors ${bookmarkedIds.includes(job.id) ? 'text-indigo-500' : 'text-zinc-400 hover:text-indigo-400'} shrink-0`}>
                        <Bookmark className={`w-5 h-5 ${bookmarkedIds.includes(job.id) ? 'fill-current' : ''}`} />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                        <MapPin className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="truncate">{job.location || 'Remote'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                        <Briefcase className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="truncate">{job.type?.replace('_', ' ') || 'Internship'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                        <DollarSign className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="truncate">{job.salary || (job.isPaid ? 'Paid' : 'Unpaid')}</span>
                      </div>
                    </div>

                    <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 mb-6 flex-1">
                      {job.description || "No description provided."}
                    </p>

                    <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800 mt-auto">
                      <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        job.isActive ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      }`}>
                        {job.isActive ? 'Actively Hiring' : 'Closed'}
                      </div>
                      
                      {hasApplied ? (
                        <span className="flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
                          <Check className="w-4 h-4" /> Applied
                        </span>
                      ) : (
                        <button onClick={() => { setActiveApplication(job); setFormData({ resume: '', coverLetter: '' }); setEditingAppId(null); }} disabled={!job.isActive} className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-white hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors disabled:opacity-50 disabled:hover:text-zinc-900 disabled:cursor-not-allowed">
                          Apply Now <ExternalLink className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              
              {filteredInternships.length === 0 && (
                <div className="col-span-1 md:col-span-2 text-center py-12 text-zinc-500">
                  No internships found matching your criteria.
                </div>
              )}
            </div>
          )}
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
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">Job Type</h3>
                  <div className="space-y-2">
                    {['All', 'FULL_TIME', 'PART_TIME', 'SUMMER', 'REMOTE'].map(type => (
                      <label key={type} className="flex items-center gap-3 cursor-pointer group">
                        <input type="radio" name="filter-time" checked={selectedType === type} onChange={() => setSelectedType(type)} className="w-4 h-4 text-indigo-500 focus:ring-indigo-500 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800" />
                        <span className={`text-sm ${selectedType === type ? 'text-zinc-900 dark:text-white font-medium' : 'text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-300'}`}>{type.replace('_', ' ')}</span>
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
                  <p className="text-sm text-zinc-500">{activeApplication.title} at {activeApplication.company?.name}</p>
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
                      <p className="text-sm font-medium text-zinc-900 dark:text-white">{formData.resume || 'Aditya_Bhatt_Resume.pdf'}</p>
                      <p className="text-xs text-zinc-500">{formData.resume ? 'Custom resume attached' : 'Using default profile resume'}</p>
                    </div>
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="text-sm font-medium text-indigo-500 hover:text-indigo-600 transition-colors">Change</button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept=".pdf,.doc,.docx" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setFormData({ ...formData, resume: file.name });
                          toast.success(`Attached ${file.name}`);
                        }
                      }} 
                    />
                  </div>
                </div>
                
                <div>
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 block">Cover Letter (Optional)</label>
                  <textarea 
                    value={formData.coverLetter}
                    onChange={e => setFormData({ ...formData, coverLetter: e.target.value })}
                    rows={4} 
                    placeholder={`Why are you a great fit for the ${activeApplication.title} role?`}
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
                  applications.map((app) => {
                    const internship = app.internship;
                    if (!internship) return null;
                    return (
                    <div key={app.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex gap-3">
                          <div className="w-10 h-10 relative rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-indigo-500 shrink-0 overflow-hidden">
                            {internship.company?.logoUrl ? (
                              <Image src={internship.company.logoUrl} alt={internship.company.name} fill className="object-cover" />
                            ) : (
                              internship.company?.name?.substring(0, 2).toUpperCase() || 'C'
                            )}
                          </div>
                          <div>
                            <h4 className="font-bold text-zinc-900 dark:text-white line-clamp-1">{internship.title}</h4>
                            <p className="text-sm text-zinc-500">{internship.company?.name}</p>
                          </div>
                        </div>
                        <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                          app.status === 'PENDING' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                          app.status === 'ACCEPTED' ? 'bg-green-500/10 text-green-600 dark:text-green-400' :
                          'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}>
                          {app.status}
                        </span>
                      </div>
                      
                      <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 bg-zinc-50 dark:bg-zinc-950 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800/50">
                        <p><span className="font-semibold text-zinc-900 dark:text-white">Applied:</span> {new Date(app.appliedAt).toLocaleDateString()}</p>
                        {app.coverLetter && (
                          <p className="mt-2 line-clamp-2"><span className="font-semibold text-zinc-900 dark:text-white">Cover Letter:</span> "{app.coverLetter}"</p>
                        )}
                      </div>
                      
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            setEditingAppId(app.id);
                            setActiveApplication(internship);
                            setFormData({ resume: app.cvUrl || '', coverLetter: app.coverLetter || '' });
                            setShowMyApplications(false);
                          }} 
                          className="flex-1 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <Edit2 className="w-4 h-4" /> Edit Details
                        </button>
                        <button 
                          onClick={() => withdrawApplication(app.id)} 
                          className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-400 hover:text-red-500 rounded-lg transition-colors"
                          title="Withdraw Application"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  )})
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

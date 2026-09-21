'use client';

import { useState, useEffect } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Award, CheckCircle2, ChevronRight, GraduationCap, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';

export default function Scholarships() {
  const [scholarships, setScholarships] = useState<any[]>([]);
  const [myApplications, setMyApplications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedScholarship, setSelectedScholarship] = useState<any>(null);
  const [showAll, setShowAll] = useState(false);
  const [applicationStep, setApplicationStep] = useState<1 | 2 | 3>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [motivation, setMotivation] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [scholarshipsRes, appsRes] = await Promise.all([
        api.get('/scholarships'),
        api.get('/scholarships/my-applications')
      ]);
      setScholarships(scholarshipsRes.data);
      setMyApplications(appsRes.data);
    } catch (error) {
      toast.error('Failed to load scholarships');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    setApplicationStep(2);
  };

  const handleSubmit = async () => {
    if (!motivation.trim()) {
      toast.error('Please provide a statement.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      await api.post(`/scholarships/${selectedScholarship.id}/apply`, {
        motivation
      });
      await fetchData(); // Refresh data to hide from available list
      setApplicationStep(3);
      toast.success('Application submitted successfully!');
    } catch (error) {
      toast.error('Failed to submit application');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedScholarship(null);
    setTimeout(() => {
      setApplicationStep(1);
      setMotivation('');
    }, 300);
  };

  const availableScholarships = scholarships.filter(
    (s) => !myApplications.some((app) => app.scholarshipId === s.id)
  );
  
  const displayedScholarships = showAll ? availableScholarships : availableScholarships.slice(0, 2);
  
  const activeAwardsCount = myApplications.filter(app => app.status === 'APPROVED').length;
  const totalAwarded = myApplications
    .filter(app => app.status === 'APPROVED')
    .reduce((sum, app) => sum + (app.scholarship?.amount || 0), 0);

  if (isLoading) {
    return (
      <>
        <Topbar title="Scholarships" subtitle="View and apply for financial aid and scholarships" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Scholarships" subtitle="View and apply for financial aid and scholarships" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-8">
          
          <div className="bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-xl p-8 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                <Award className="w-8 h-8 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-1">Active Scholarships</h2>
                <div className="text-zinc-300">
                  You currently have {activeAwardsCount} active scholarship{activeAwardsCount !== 1 && 's'} for the academic year.
                </div>
              </div>
            </div>
            <div className="text-center md:text-right">
              <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">Total Awarded</div>
              <div className="text-3xl font-bold text-zinc-900 dark:text-white">${totalAwarded.toLocaleString()}</div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-zinc-900 dark:text-white">Your Applications & Awards</h3>
            
            {myApplications.length === 0 ? (
              <div className="text-zinc-500 text-sm">You haven't applied for any scholarships yet.</div>
            ) : (
              <div className="space-y-4">
                {myApplications.map((app) => (
                  <div key={app.id} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
                    <div className="flex justify-between items-start border-b border-zinc-200 dark:border-zinc-800/50 pb-6 mb-6">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="text-lg font-medium text-zinc-900 dark:text-white">{app.scholarship?.name}</h4>
                          <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${app.status === 'APPROVED' ? 'bg-green-500/10 text-green-400' : app.status === 'REJECTED' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                            {app.status === 'APPROVED' && <CheckCircle2 className="w-3 h-3" />}
                            {app.status}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl line-clamp-2">{app.scholarship?.description}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xl font-bold text-zinc-900 dark:text-white">${app.scholarship?.amount?.toLocaleString()}</div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-500">Amount</div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-zinc-500 dark:text-zinc-500 mb-1">Applied Date</div>
                        <div className="font-medium text-zinc-200">{new Date(app.appliedAt).toLocaleDateString()}</div>
                      </div>
                      <div>
                        <div className="text-zinc-500 dark:text-zinc-500 mb-1">Provider</div>
                        <div className="font-medium text-zinc-200">{app.scholarship?.provider || 'Internal'}</div>
                      </div>
                      <div>
                        <div className="text-zinc-500 dark:text-zinc-500 mb-1">Status</div>
                        <div className="font-medium text-zinc-200">{app.status}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-semibold text-zinc-900 dark:text-white">Available to Apply</h3>
              {availableScholarships.length > 2 && (
                <button onClick={() => setShowAll(!showAll)} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium flex items-center gap-1 transition-colors">
                  {showAll ? 'Show Less' : 'View All'} <ChevronRight className={`w-4 h-4 transition-transform ${showAll ? 'rotate-90' : ''}`} />
                </button>
              )}
            </div>
            
            {availableScholarships.length === 0 ? (
              <div className="text-zinc-500 text-sm">No new scholarships available to apply for at this time.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {displayedScholarships.map((award: any) => (
                  <div key={award.id} onClick={() => setSelectedScholarship(award)} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors group cursor-pointer flex flex-col justify-between">
                    <div>
                      <div className="flex items-start gap-4 mb-4">
                        <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center flex-shrink-0">
                          <GraduationCap className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-zinc-900 dark:text-white group-hover:text-indigo-400 transition-colors line-clamp-1">{award.name}</h4>
                          <div className="text-sm text-zinc-500 dark:text-zinc-500 mt-0.5">{award.provider || 'Internal'}</div>
                        </div>
                      </div>
                      <p className="text-sm text-zinc-400 line-clamp-2 mb-4">{award.description}</p>
                    </div>
                    <div className="flex justify-between items-end border-t border-zinc-800 pt-4">
                      <div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-500 mb-1">Deadline</div>
                        <div className="text-sm font-medium text-zinc-300">{award.deadline ? new Date(award.deadline).toLocaleDateString() : 'Rolling'}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-zinc-900 dark:text-white">${award.amount?.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      <AnimatePresence>
        {selectedScholarship && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-zinc-800 flex justify-between items-start bg-zinc-900/50 flex-shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/50 rounded-xl flex items-center justify-center">
                    <GraduationCap className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white">{selectedScholarship.name}</h3>
                    <div className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Step {applicationStep} of 3</div>
                  </div>
                </div>
                <button 
                  onClick={handleClose}
                  className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-full hover:bg-white/5 transition-colors"
                  disabled={isSubmitting}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 overflow-y-auto">
                <AnimatePresence mode="wait">
                  {applicationStep === 1 && (
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                      className="space-y-6"
                    >
                      <div className="grid grid-cols-2 gap-4 bg-zinc-50 dark:bg-zinc-800/30 p-5 rounded-2xl border border-zinc-100 dark:border-zinc-800/50">
                        <div>
                          <div className="text-xs text-zinc-500 mb-1">Award Amount</div>
                          <div className="font-bold text-zinc-900 dark:text-white text-xl">${selectedScholarship.amount?.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-xs text-zinc-500 mb-1">Deadline</div>
                          <div className="font-bold text-zinc-900 dark:text-white text-xl">{selectedScholarship.deadline ? new Date(selectedScholarship.deadline).toLocaleDateString() : 'Rolling'}</div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-semibold text-zinc-900 dark:text-white mb-2">Description</h4>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">
                          {selectedScholarship.description}
                        </p>
                      </div>

                      {selectedScholarship.requirements && (
                        <div>
                          <h4 className="text-sm font-semibold text-zinc-900 dark:text-white mb-2">Requirements</h4>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">
                            {selectedScholarship.requirements}
                          </p>
                        </div>
                      )}

                      <div className="pt-4 flex gap-4">
                        <button 
                          onClick={handleClose}
                          className="flex-1 px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 font-bold text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-zinc-900 dark:text-white"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={handleApply}
                          className="flex-1 btn-primary py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                        >
                          Start Application <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {applicationStep === 2 && (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                      className="space-y-6"
                    >
                      <div>
                        <h4 className="text-lg font-bold text-white mb-1">Questionnaire</h4>
                        <p className="text-sm text-zinc-400">Please answer the following questions to complete your application.</p>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-zinc-300 mb-2">Why are you a good fit for this scholarship?</label>
                          <textarea 
                            rows={4} 
                            value={motivation}
                            onChange={(e) => setMotivation(e.target.value)}
                            placeholder="Write a brief statement..."
                            className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-zinc-300 mb-2">Are you currently receiving other financial aid?</label>
                          <select className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50" style={{ colorScheme: 'dark' }}>
                            <option>Yes</option>
                            <option>No</option>
                          </select>
                        </div>
                      </div>

                      <div className="pt-4 flex gap-4">
                        <button 
                          onClick={() => setApplicationStep(1)}
                          className="flex-1 px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 font-bold text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-zinc-900 dark:text-white"
                          disabled={isSubmitting}
                        >
                          Back
                        </button>
                        <button 
                          onClick={handleSubmit}
                          disabled={isSubmitting}
                          className="flex-[2] btn-primary py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                        >
                          {isSubmitting ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
                          ) : (
                            'Submit Application'
                          )}
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {applicationStep === 3 && (
                    <motion.div
                      key="step3"
                      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center text-center space-y-6 py-8"
                    >
                      <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="w-10 h-10 text-green-400" />
                      </div>
                      
                      <div>
                        <h4 className="text-2xl font-bold text-white mb-2">Application Submitted!</h4>
                        <p className="text-zinc-400">Your application for the <strong>{selectedScholarship.name}</strong> has been successfully received. We will notify you of a decision within 2-4 weeks.</p>
                      </div>

                      <button 
                        onClick={handleClose}
                        className="btn-primary py-3 px-8 rounded-xl font-bold text-sm"
                      >
                        Return to Scholarships
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

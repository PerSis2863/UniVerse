'use client';

import { Topbar } from '@/components/layout/Topbar';
import { HeartPulse, Stethoscope, CalendarPlus, Activity, X, FileText, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function MedicalPage() {
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  const handleClose = () => {
    setActiveModal(null);
    setTimeout(() => setStep(1), 300); // reset step after animation
  };

  const handleBookingSubmit = () => {
    toast.success('Appointment booked successfully!');
    handleClose();
  };

  const handleAccommodationSubmit = () => {
    toast.success('Accommodation request submitted!');
    handleClose();
  };

  return (
    <>
      <Topbar title="Medical & Disability Services" subtitle="Manage appointments and health accommodations" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-8">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Health Center */}
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 relative overflow-hidden group hover:border-pink-500/30 transition-colors">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-pink-500/5 rounded-full blur-2xl group-hover:bg-pink-500/10 transition-colors" />
              <div className="w-12 h-12 bg-pink-500/20 rounded-xl flex items-center justify-center mb-6">
                <Stethoscope className="w-6 h-6 text-pink-400" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">Campus Health Center</h2>
              <p className="text-zinc-600 dark:text-zinc-400 mb-6">Book appointments for general medical care, vaccinations, and routine checkups.</p>
              
              <button onClick={() => setActiveModal('booking')} className="flex items-center gap-2 bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 px-4 py-2.5 rounded-lg font-medium transition-colors w-full justify-center">
                <CalendarPlus className="w-4 h-4" /> Book Appointment
              </button>
            </div>

            {/* Disability Services */}
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 relative overflow-hidden group hover:border-purple-500/30 transition-colors">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-colors" />
              <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mb-6">
                <HeartPulse className="w-6 h-6 text-purple-400" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">Disability Support</h2>
              <p className="text-zinc-600 dark:text-zinc-400 mb-6">Request academic accommodations, accessible housing, and assistive technology.</p>
              
              <button onClick={() => setActiveModal('accommodations')} className="flex items-center gap-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 px-4 py-2.5 rounded-lg font-medium transition-colors w-full justify-center">
                <Activity className="w-4 h-4" /> Manage Accommodations
              </button>
            </div>

          </div>

          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
            <h3 className="font-semibold text-zinc-900 dark:text-white mb-4">Upcoming Appointments</h3>
            <div className="text-center py-8 text-zinc-500 dark:text-zinc-500 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg">
              No upcoming appointments scheduled.
            </div>
          </div>

        </div>
      </div>

      <AnimatePresence>
        {activeModal === 'booking' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0d1117] border border-zinc-800 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/30">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-pink-500/20 text-pink-400 rounded-lg">
                    <CalendarPlus className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-bold text-white">Book Medical Appointment</h2>
                </div>
                <button onClick={handleClose} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-8 overflow-y-auto">
                {step === 1 && (
                  <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                    <h3 className="text-lg font-medium text-white">What is the reason for your visit?</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {['General Checkup', 'Illness/Injury', 'Vaccination', 'Mental Health Consult'].map(reason => (
                        <button key={reason} onClick={() => setStep(2)} className="p-4 rounded-xl border border-zinc-800 bg-white/[0.02] hover:bg-white/[0.05] hover:border-pink-500/50 text-left transition-all">
                          <span className="font-medium text-zinc-200">{reason}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
                
                {step === 2 && (
                  <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                    <h3 className="text-lg font-medium text-white">Select a Date & Time</h3>
                    <div className="flex gap-6">
                      <div className="flex-1 space-y-4">
                        <label className="text-sm text-zinc-400">Date</label>
                        <input type="date" className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 px-4 text-white focus:outline-none focus:border-pink-500 [color-scheme:dark]" />
                      </div>
                      <div className="flex-1 space-y-4">
                        <label className="text-sm text-zinc-400">Time</label>
                        <select className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 px-4 text-white focus:outline-none focus:border-pink-500 [color-scheme:dark]">
                          <option>09:00 AM</option>
                          <option>10:30 AM</option>
                          <option>01:00 PM</option>
                          <option>03:45 PM</option>
                        </select>
                      </div>
                    </div>
                    <div className="pt-6 flex justify-end gap-3">
                      <button onClick={() => setStep(1)} className="px-6 py-2 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors">Back</button>
                      <button onClick={() => setStep(3)} className="px-6 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-medium transition-colors">Continue</button>
                    </div>
                  </motion.div>
                )}

                {step === 3 && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6 text-center py-8">
                    <div className="w-20 h-20 bg-pink-500/20 rounded-full flex items-center justify-center mx-auto mb-6 text-pink-400">
                      <CheckCircle2 className="w-10 h-10" />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Confirm Appointment</h3>
                    <p className="text-zinc-400 max-w-md mx-auto">You are about to book a General Checkup appointment on the selected date and time. An email confirmation will be sent to your student inbox.</p>
                    <div className="pt-8">
                      <button onClick={handleBookingSubmit} className="px-8 py-3 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-lg transition-colors shadow-lg shadow-pink-500/20">
                        Confirm Booking
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {activeModal === 'accommodations' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0d1117] border border-zinc-800 w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/30">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/20 text-purple-400 rounded-lg">
                    <Activity className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-bold text-white">Manage Accommodations</h2>
                </div>
                <button onClick={handleClose} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-8 overflow-y-auto space-y-8">
                <div>
                  <h3 className="text-lg font-bold text-white mb-4">Active Accommodations</h3>
                  <div className="bg-white/[0.02] border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg"><CheckCircle2 className="w-5 h-5" /></div>
                      <div>
                        <div className="font-medium text-zinc-200">1.5x Time on Written Exams</div>
                        <div className="text-sm text-zinc-500">Approved for Fall 2026 Semester</div>
                      </div>
                    </div>
                    <button className="text-sm text-purple-400 hover:text-purple-300 font-medium">View Letter</button>
                  </div>
                </div>

                <div className="border-t border-zinc-800 pt-8">
                  <h3 className="text-lg font-bold text-white mb-4">Submit New Request</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm text-zinc-400">Accommodation Type</label>
                      <select className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 px-4 text-white focus:outline-none focus:border-purple-500 [color-scheme:dark]">
                        <option>Academic (Testing, Note-taking)</option>
                        <option>Housing (Accessible room, emotional support animal)</option>
                        <option>Dietary (Allergy accommodations)</option>
                        <option>Assistive Technology</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-zinc-400">Supporting Documentation</label>
                      <div className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center bg-white/[0.01]">
                        <FileText className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
                        <p className="text-zinc-400 text-sm">Drag and drop medical documents here, or click to browse</p>
                      </div>
                    </div>
                    <button onClick={handleAccommodationSubmit} className="w-full py-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-lg transition-colors mt-4">
                      Submit Request for Review
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

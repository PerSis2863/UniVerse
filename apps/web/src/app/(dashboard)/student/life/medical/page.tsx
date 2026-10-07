'use client';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, LIFE_TABS } from '@/components/layout/SectionTabs';
import { HeartPulse, Stethoscope, X, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';

type MedicalRecord = {
  bloodType: string;
  allergies: string[];
  conditions: string[];
  medications: string[];
  doctorName: string;
  doctorPhone: string;
  emergencyContact: string;
  emergencyPhone: string;
};

/** The edit form: the lists are typed as comma-separated text. */
type MedicalForm = Omit<MedicalRecord, 'allergies' | 'conditions' | 'medications'> & { allergies: string; conditions: string; medications: string };
const list = (text: string) => text.split(',').map((s) => s.trim()).filter(Boolean);

export default function MedicalPage() {
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { data, isLoading, mutate } = useSWR<Partial<MedicalRecord> | null>('/medical/my', fetcher, {
    onError: () => toast.error('Failed to load medical record'),
  });
  const record: MedicalRecord = {
    bloodType: data?.bloodType || '',
    allergies: data?.allergies || [],
    conditions: data?.conditions || [],
    medications: data?.medications || [],
    doctorName: data?.doctorName || '',
    doctorPhone: data?.doctorPhone || '',
    emergencyContact: data?.emergencyContact || '',
    emergencyPhone: data?.emergencyPhone || '',
  };

  // Local state for the form inputs
  const [formData, setFormData] = useState<MedicalForm>({ ...record, allergies: '', conditions: '', medications: '' });

  const openModal = () => {
    setFormData({ ...record, allergies: record.allergies.join(', '), conditions: record.conditions.join(', '), medications: record.medications.join(', ') });
    setActiveModal('profile');
  };

  const handleClose = () => {
    setActiveModal(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload: MedicalRecord = { ...formData, allergies: list(formData.allergies), conditions: list(formData.conditions), medications: list(formData.medications) };
      await api.post('/medical/my', payload);
      await mutate(payload, { revalidate: false });
      toast.success('Medical profile updated successfully');
      handleClose();
    } catch (error) {
      toast.error('Failed to update medical profile');
    } finally {
      setIsSaving(false);
    }
  };

  const renderArray = (items: string[]) => {
    if (items.length === 0) return <span className="text-zinc-500 italic">None reported</span>;
    return (
      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => (
          <span key={i} className="px-2 py-1 bg-white/[0.05] border border-white/[0.1] rounded text-sm text-zinc-300">
            {item}
          </span>
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <>
        <Topbar title="Medical & Health Services" subtitle="Manage your health profile and emergency contacts" />
        <SectionTabs tabs={LIFE_TABS} />
        <div className="flex-1 flex items-center justify-center">
          <ContentSkeleton variant="list" />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Medical & Health Services" subtitle="Manage your health profile and emergency contacts" />
      <SectionTabs tabs={LIFE_TABS} />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-8">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Medical Profile */}
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 relative overflow-hidden group hover:border-pink-500/30 transition-colors">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-pink-500/5 rounded-full blur-2xl group-hover:bg-pink-500/10 transition-colors" />
              <div className="flex justify-between items-start mb-6">
                <div className="w-12 h-12 bg-pink-500/20 rounded-xl flex items-center justify-center">
                  <Stethoscope className="w-6 h-6 text-pink-400" />
                </div>
                <button onClick={openModal} className="flex items-center gap-2 bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 px-4 py-2 rounded-lg font-medium transition-colors text-sm">
                  Update Profile
                </button>
              </div>
              
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-6">Medical Profile</h2>
              
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-zinc-500 mb-1">Blood Type</div>
                  <div className="font-medium text-white">{record.bloodType || <span className="text-zinc-500 italic">Not specified</span>}</div>
                </div>
                <div>
                  <div className="text-sm text-zinc-500 mb-1">Allergies</div>
                  {renderArray(record.allergies)}
                </div>
                <div>
                  <div className="text-sm text-zinc-500 mb-1">Medical Conditions</div>
                  {renderArray(record.conditions)}
                </div>
                <div>
                  <div className="text-sm text-zinc-500 mb-1">Current Medications</div>
                  {renderArray(record.medications)}
                </div>
              </div>
            </div>

            {/* Emergency Contacts */}
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 relative overflow-hidden group hover:border-red-500/30 transition-colors">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-red-500/5 rounded-full blur-2xl group-hover:bg-red-500/10 transition-colors" />
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center mb-6">
                <HeartPulse className="w-6 h-6 text-red-400" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-6">Contacts</h2>
              
              <div className="space-y-6">
                <div className="p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                  <h3 className="text-sm text-zinc-400 mb-2 font-medium">Emergency Contact</h3>
                  <div className="font-bold text-white mb-1">{record.emergencyContact || <span className="text-zinc-500 italic">Not specified</span>}</div>
                  <div className="text-zinc-300 text-sm">{record.emergencyPhone || <span className="text-zinc-500 italic">Not specified</span>}</div>
                </div>

                <div className="p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                  <h3 className="text-sm text-zinc-400 mb-2 font-medium">Primary Care Physician</h3>
                  <div className="font-bold text-white mb-1">{record.doctorName || <span className="text-zinc-500 italic">Not specified</span>}</div>
                  <div className="text-zinc-300 text-sm">{record.doctorPhone || <span className="text-zinc-500 italic">Not specified</span>}</div>
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>

      <AnimatePresence>
        {activeModal === 'profile' && (
          <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#121830] border border-zinc-800 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/30">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-pink-500/20 text-pink-400 rounded-lg">
                    <Stethoscope className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-bold text-white">Update Medical Profile</h2>
                </div>
                <button onClick={handleClose} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-8 overflow-y-auto space-y-6">
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Blood Type</label>
                    <select 
                      value={formData.bloodType}
                      onChange={e => setFormData({...formData, bloodType: e.target.value})}
                      className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 px-4 text-white focus:outline-none focus:border-pink-500 [color-scheme:dark]"
                    >
                      <option value="">Select Blood Type</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Allergies (comma separated)</label>
                    <input 
                      type="text" 
                      value={formData.allergies}
                      onChange={e => setFormData({...formData, allergies: e.target.value})}
                      placeholder="e.g. Peanuts, Penicillin"
                      className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 px-4 text-white focus:outline-none focus:border-pink-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Medical Conditions (comma separated)</label>
                    <input 
                      type="text" 
                      value={formData.conditions}
                      onChange={e => setFormData({...formData, conditions: e.target.value})}
                      placeholder="e.g. Asthma, Type 1 Diabetes"
                      className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 px-4 text-white focus:outline-none focus:border-pink-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Current Medications (comma separated)</label>
                    <input 
                      type="text" 
                      value={formData.medications}
                      onChange={e => setFormData({...formData, medications: e.target.value})}
                      placeholder="e.g. Albuterol, Insulin"
                      className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 px-4 text-white focus:outline-none focus:border-pink-500"
                    />
                  </div>
                </div>

                <div className="pt-6 border-t border-zinc-800 space-y-4">
                  <h3 className="font-bold text-white">Contacts</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-zinc-400 mb-1">Emergency Contact Name</label>
                      <input 
                        type="text" 
                        value={formData.emergencyContact}
                        onChange={e => setFormData({...formData, emergencyContact: e.target.value})}
                        className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 px-4 text-white focus:outline-none focus:border-pink-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-zinc-400 mb-1">Emergency Phone</label>
                      <input 
                        type="text" 
                        value={formData.emergencyPhone}
                        onChange={e => setFormData({...formData, emergencyPhone: e.target.value})}
                        className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 px-4 text-white focus:outline-none focus:border-pink-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-zinc-400 mb-1">Doctor Name</label>
                      <input 
                        type="text" 
                        value={formData.doctorName}
                        onChange={e => setFormData({...formData, doctorName: e.target.value})}
                        className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 px-4 text-white focus:outline-none focus:border-pink-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-zinc-400 mb-1">Doctor Phone</label>
                      <input 
                        type="text" 
                        value={formData.doctorPhone}
                        onChange={e => setFormData({...formData, doctorPhone: e.target.value})}
                        className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 px-4 text-white focus:outline-none focus:border-pink-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-6 flex justify-end gap-3">
                  <button onClick={handleClose} className="px-6 py-2 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleSave} aria-busy={isSaving || undefined} disabled={isSaving} className="px-6 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-medium transition-colors flex items-center gap-2">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

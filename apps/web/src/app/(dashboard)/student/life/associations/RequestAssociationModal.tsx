'use client';
import { useState } from 'react';
import { X, Info, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface RequestAssociationModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function RequestAssociationModal({ onClose, onSuccess }: RequestAssociationModalProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Academic');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const api = (await import('@/lib/fetcher')).api;
      await api.post('/associations', {
        name,
        category,
        description,
        requirements,
      });
      toast.success('Association requested successfully! Waiting for admin approval.');
      onSuccess();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to request association.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-[#0d1117] border border-white/[0.1] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-white/[0.05]">
          <h2 className="text-xl font-bold text-white">Request New Association</h2>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.05] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[70vh]">
          <div className="mb-6 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-200">
            <div className="flex gap-3 mb-2">
              <Info className="w-5 h-5 text-blue-400 shrink-0" />
              <h3 className="font-semibold text-blue-100">Eligibility & Requirements</h3>
            </div>
            <ul className="list-disc pl-9 space-y-1 text-sm text-blue-200/80">
              <li>You must have a clear mission statement and purpose.</li>
              <li>A minimum of 5 founding members is recommended.</li>
              <li>Must comply with the university's code of conduct.</li>
              <li>After submission, your request will be reviewed by the Administration.</li>
            </ul>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">Association Name</label>
              <input 
                required
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.1] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="e.g. Quantum Computing Club"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">Category</label>
              <select 
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-[#161b22] border border-white/[0.1] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="Academic">Academic</option>
                <option value="Cultural">Cultural</option>
                <option value="Engineering">Engineering</option>
                <option value="Sustainability">Sustainability</option>
                <option value="Arts & Humanities">Arts & Humanities</option>
                <option value="Business">Business</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">Description / Mission Statement</label>
              <textarea 
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.1] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 min-h-[100px]"
                placeholder="What is the purpose of this association?"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">Why should this be approved?</label>
              <textarea 
                required
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.1] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 min-h-[80px]"
                placeholder="Explain how you meet the requirements and your plan for the first semester."
              />
            </div>

            <div className="pt-4 flex justify-end gap-3">
              <button 
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl font-medium text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? 'Submitting...' : (
                  <>
                    <Plus className="w-4 h-4" />
                    Submit Request
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

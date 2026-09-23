'use client';
import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { toast } from 'sonner';

interface ManageAssociationModalProps {
  association: any;
  onClose: () => void;
  onSuccess: () => void;
}

export function ManageAssociationModal({ association, onClose, onSuccess }: ManageAssociationModalProps) {
  const [name, setName] = useState(association?.name || '');
  const [category, setCategory] = useState(association?.category || '');
  const [description, setDescription] = useState(association?.description || '');
  const [budget, setBudget] = useState(association?.budget || 0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const api = (await import('@/lib/fetcher')).api;
      await api.patch(`/associations/${association.id}`, {
        name,
        category,
        description,
        budget: Number(budget),
      });
      toast.success('Association updated successfully!');
      onSuccess();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to update association.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-[#0d1117] border border-white/[0.1] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-white/[0.05]">
          <h2 className="text-xl font-bold text-white">Manage Association</h2>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.05] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[70vh]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">Association Name</label>
              <input 
                required
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.1] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
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
                <label className="block text-sm font-medium text-zinc-400 mb-1.5">Allocated Budget ($)</label>
                <input 
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.1] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">Description</label>
              <textarea 
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.1] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 min-h-[100px]"
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
                {isSubmitting ? 'Saving...' : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Changes
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

'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Plus, Edit2, Trash2, X, Briefcase, MapPin, Building, Calendar, DollarSign } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { fetcher, api } from '@/lib/fetcher';

export default function AdminInternshipsPage() {
  const { data: internshipsData, mutate } = useSWR('/internships', fetcher);
  const internships = internshipsData || [];
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    title: '', company: '', location: '', type: 'Full-time', duration: '', stipend: '', deadline: '', status: 'Active'
  });

  const handleOpenModal = (id: string | null = null) => {
    if (id) {
      const item = internships.find(i => i.id === id);
      if (item) setFormData({ ...item });
      setEditingId(id);
    } else {
      setFormData({ title: '', company: '', location: '', type: 'Full-time', duration: '', stipend: '', deadline: '', status: 'Active' });
      setEditingId(null);
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        // await api.patch(`/internships/${editingId}`, formData);
        toast.success('Internship updated successfully (mock update)');
      } else {
        await api.post('/internships', formData);
        toast.success('New internship added');
      }
      mutate();
      setIsModalOpen(false);
    } catch (error) {
      toast.error('Failed to save internship');
    }
  };
  
  const handleDelete = async (id: string) => {
    try {
      // await api.delete(`/internships/${id}`);
      toast.success('Internship deleted (mock delete)');
      mutate();
    } catch (error) {
      toast.error('Failed to delete internship');
    }
  };

  return (
    <>
      <Topbar 
        title="Internships & Career" 
        subtitle="Manage job postings and career opportunities"
        rightNode={
          <button 
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-zinc-900 dark:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Opportunity
          </button>
        }
      />
      
      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">{editingId ? 'Edit Opportunity' : 'Add Opportunity'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white p-2 rounded-lg hover:bg-zinc-100 dark:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Job Title</label>
                  <input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} type="text" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. Software Engineering Intern" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Company</label>
                  <input required value={formData.company} onChange={e => setFormData({...formData, company: e.target.value})} type="text" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. Google" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Location</label>
                  <input required value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} type="text" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. Remote or Mountain View, CA" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Type</label>
                  <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors">
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Co-op">Co-op</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Duration</label>
                  <input required value={formData.duration} onChange={e => setFormData({...formData, duration: e.target.value})} type="text" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. 12 weeks" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Stipend / Pay</label>
                  <input required value={formData.stipend} onChange={e => setFormData({...formData, stipend: e.target.value})} type="text" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. $8,000/mo or Unpaid" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Deadline</label>
                  <input required value={formData.deadline} onChange={e => setFormData({...formData, deadline: e.target.value})} type="date" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors [color-scheme:dark]" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Status</label>
                  <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors">
                    <option value="Active">Active</option>
                    <option value="Draft">Draft</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </div>
              
              <div className="pt-4 flex justify-end gap-3 border-t border-zinc-200 dark:border-zinc-800 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-zinc-900 dark:text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors shadow-lg shadow-indigo-500/20">
                  Save Opportunity
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex-1 p-8 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
        <div className="max-w-7xl mx-auto space-y-6">
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {internships.map((internship) => (
              <div key={internship.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden flex flex-col group">
                <div className="p-6 flex flex-col h-full">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">{internship.title}</h3>
                      <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                        <Building className="w-4 h-4" />
                        <span>{internship.company?.name || internship.company}</span>
                      </div>
                    </div>
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${
                      internship.isActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                      'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20'
                    }`}>
                      {internship.isActive ? 'Active' : 'Draft'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="flex items-center gap-2 text-sm text-zinc-300">
                      <MapPin className="w-4 h-4 text-zinc-500 dark:text-zinc-500" />
                      {internship.location || 'Remote'}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-zinc-300">
                      <Briefcase className="w-4 h-4 text-zinc-500 dark:text-zinc-500" />
                      {internship.type || 'Internship'}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-zinc-300">
                      <Calendar className="w-4 h-4 text-zinc-500 dark:text-zinc-500" />
                      {internship.duration || 'N/A'}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-zinc-300">
                      <DollarSign className="w-4 h-4 text-zinc-500 dark:text-zinc-500" />
                      {internship.salary || internship.stipend || 'Unpaid'}
                    </div>
                  </div>

                  <div className="mt-auto pt-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                    <div className="text-xs text-zinc-500 dark:text-zinc-500">
                      Deadline: <span className="text-zinc-300">{internship.deadline ? new Date(internship.deadline).toLocaleDateString() : 'N/A'}</span>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleOpenModal(internship.id)}
                        className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors inline-flex items-center justify-center"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(internship.id)}
                        className="p-2 text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors inline-flex items-center justify-center"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </>
  );
}

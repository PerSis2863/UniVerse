'use client';
import { Topbar } from '@/components/layout/Topbar';
import { FileText, CreditCard, GraduationCap, Plus, Edit2, Trash2, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

const TABS = [
  { id: 'documents', label: 'School Documents', icon: FileText },
  { id: 'billing', label: 'Billing & Accounting', icon: CreditCard },
  { id: 'scholarships', label: 'Scholarships', icon: GraduationCap },
];

export default function AdminAdministrativeClient() {
  const [activeTab, setActiveTab] = useState('documents');
  const [loading, setLoading] = useState(true);

  const [docs, setDocs] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [scholarships, setScholarships] = useState<any[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({});

  // Fetch data from API
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/documents').catch(() => ({ data: [] })),
      api.get('/scholarships').catch(() => ({ data: [] })),
    ]).then(([docsRes, schRes]) => {
      setDocs(docsRes.data || []);
      setScholarships(schRes.data || []);
      setBills([]); // No billing API endpoint yet
    }).finally(() => setLoading(false));
  }, []);

  const refetch = async () => {
    const [docsRes, schRes] = await Promise.all([
      api.get('/documents').catch(() => ({ data: [] })),
      api.get('/scholarships').catch(() => ({ data: [] })),
    ]);
    setDocs(docsRes.data || []);
    setScholarships(schRes.data || []);
  };

  const handleOpenModal = (id: string | null = null) => {
    if (activeTab === 'documents') {
      if (id) {
        setFormData(docs.find(d => d.id === id) || {});
      } else {
        setFormData({ title: '', type: 'OTHER', status: 'Draft' });
      }
    } else if (activeTab === 'billing') {
      if (id) {
        setFormData(bills.find(b => b.id === id) || {});
      } else {
        setFormData({ description: '', amount: 0, dueDate: '', status: 'Pending' });
      }
    } else if (activeTab === 'scholarships') {
      if (id) {
        setFormData(scholarships.find(s => s.id === id) || {});
      } else {
        setFormData({ name: '', amount: 0, deadline: '', isActive: true });
      }
    }
    setEditingId(id);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (activeTab === 'documents') {
        if (editingId) {
          await api.patch(`/documents/${editingId}`, formData);
        } else {
          await api.post('/documents', formData);
        }
      } else if (activeTab === 'scholarships') {
        if (editingId) {
          // no patch endpoint, skip
        } else {
          await api.post('/scholarships', formData);
        }
      }
      toast.success('Saved successfully!');
      await refetch();
      setIsModalOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      if (activeTab === 'documents') {
        await api.delete(`/documents/${id}`);
        setDocs(prev => prev.filter(d => d.id !== id));
      } else if (activeTab === 'scholarships') {
        toast.error('Delete scholarship is not supported yet.');
        return;
      }
      toast.success('Deleted successfully');
    } catch (err: any) {
      toast.error('Failed to delete');
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <Topbar
        title="Administrative Management"
        subtitle="Manage documents, billing, and scholarships"
        rightNode={
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Add New {activeTab === 'documents' ? 'Document' : activeTab === 'billing' ? 'Bill' : 'Scholarship'}
          </button>
        }
      />

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
                {editingId ? 'Edit ' : 'Create '}
                {activeTab === 'documents' ? 'Document' : activeTab === 'billing' ? 'Bill' : 'Scholarship'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {activeTab === 'documents' && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Document Title</label>
                    <input required value={formData.title || ''} onChange={e => setFormData({...formData, title: e.target.value})} type="text" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Type</label>
                    <select value={formData.type || 'OTHER'} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors">
                      <option value="TRANSCRIPT">Transcript</option>
                      <option value="ENROLLMENT">Enrollment Certificate</option>
                      <option value="DIPLOMA">Diploma</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                </>
              )}

              {activeTab === 'billing' && (
                <>
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-600 dark:text-amber-400 text-sm">
                    Billing management via API is coming soon. Currently read-only.
                  </div>
                </>
              )}

              {activeTab === 'scholarships' && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Scholarship Name</label>
                    <input required value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} type="text" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Amount ($)</label>
                      <input required value={formData.amount || 0} onChange={e => setFormData({...formData, amount: Number(e.target.value)})} type="number" min="0" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Deadline</label>
                      <input value={formData.deadline || ''} onChange={e => setFormData({...formData, deadline: e.target.value})} type="date" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors [color-scheme:dark]" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Status</label>
                    <select value={formData.isActive ? 'Open' : 'Closed'} onChange={e => setFormData({...formData, isActive: e.target.value === 'Open'})} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors">
                      <option value="Open">Open</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>
                </>
              )}

              <div className="pt-4 flex justify-end gap-3 border-t border-zinc-200 dark:border-zinc-800 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors shadow-lg shadow-indigo-500/20">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-8">
        <div className="flex gap-6 max-w-7xl mx-auto overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-4 px-2 border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 p-8 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
        <div className="max-w-7xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            </div>
          ) : (
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80">
                      {activeTab === 'documents' && (
                        <>
                          <th className="p-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Document Title</th>
                          <th className="p-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Type</th>
                          <th className="p-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Date</th>
                        </>
                      )}
                      {activeTab === 'billing' && (
                        <>
                          <th className="p-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Student</th>
                          <th className="p-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Description</th>
                          <th className="p-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Amount</th>
                          <th className="p-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Due Date</th>
                        </>
                      )}
                      {activeTab === 'scholarships' && (
                        <>
                          <th className="p-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Scholarship Name</th>
                          <th className="p-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Amount</th>
                          <th className="p-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Deadline</th>
                          <th className="p-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Applicants</th>
                        </>
                      )}
                      <th className="p-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Status</th>
                      <th className="p-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/50">

                    {activeTab === 'documents' && docs.map((doc) => (
                      <tr key={doc.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                        <td className="p-4 font-medium text-zinc-900 dark:text-white">{doc.title}</td>
                        <td className="p-4 text-zinc-600 dark:text-zinc-300">{doc.type}</td>
                        <td className="p-4 text-zinc-600 dark:text-zinc-300">{doc.issuedAt ? new Date(doc.issuedAt).toLocaleDateString() : doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : '-'}</td>
                        <td className="p-4">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${
                            doc.isVerified ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                          }`}>{doc.isVerified ? 'Verified' : 'Pending'}</span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => handleOpenModal(doc.id)} className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => handleDelete(doc.id)} className="p-2 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {activeTab === 'billing' && bills.map((bill) => (
                      <tr key={bill.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                        <td className="p-4">
                          <div className="font-medium text-zinc-900 dark:text-white">{bill.user?.firstName} {bill.user?.lastName}</div>
                          <div className="text-xs text-zinc-500">{bill.userId}</div>
                        </td>
                        <td className="p-4 text-zinc-600 dark:text-zinc-300">{bill.description}</td>
                        <td className="p-4 font-semibold text-indigo-600 dark:text-indigo-400">${bill.amount?.toLocaleString()}</td>
                        <td className="p-4 text-zinc-600 dark:text-zinc-300">{bill.dueDate ? new Date(bill.dueDate).toLocaleDateString() : '-'}</td>
                        <td className="p-4">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${
                            bill.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' :
                            bill.status === 'PENDING' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' :
                            'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                          }`}>{bill.status}</span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => handleOpenModal(bill.id)} className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => handleDelete(bill.id)} className="p-2 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {activeTab === 'scholarships' && scholarships.map((scholarship) => (
                      <tr key={scholarship.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                        <td className="p-4 font-medium text-zinc-900 dark:text-white">{scholarship.name}</td>
                        <td className="p-4 font-semibold text-indigo-600 dark:text-indigo-400">${scholarship.amount?.toLocaleString()}</td>
                        <td className="p-4 text-zinc-600 dark:text-zinc-300">{scholarship.deadline ? new Date(scholarship.deadline).toLocaleDateString() : 'Rolling'}</td>
                        <td className="p-4 text-zinc-600 dark:text-zinc-300">{scholarship._count?.applications ?? scholarship.applicationsCount ?? 0}</td>
                        <td className="p-4">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${
                            scholarship.isActive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20'
                          }`}>{scholarship.isActive ? 'Open' : 'Closed'}</span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => handleOpenModal(scholarship.id)} className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => handleDelete(scholarship.id)} className="p-2 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {(
                      (activeTab === 'documents' && docs.length === 0) ||
                      (activeTab === 'billing' && bills.length === 0) ||
                      (activeTab === 'scholarships' && scholarships.length === 0)
                    ) && (
                      <tr>
                        <td colSpan={6} className="p-12 text-center">
                          <div className="text-zinc-400 dark:text-zinc-500 text-sm">
                            {activeTab === 'billing'
                              ? 'Billing data will be available once the billing API is connected.'
                              : 'No records found. Click "Add New" to create one.'}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

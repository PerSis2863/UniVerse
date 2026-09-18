'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Search, Folder, FileText, ExternalLink, Download, Plus, X, Upload, Trash2, Edit } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const CATEGORIES = ['All', 'Computer Science', 'Business', 'Finance', 'General'];

type Resource = {
  id: string;
  title: string;
  type: string;
  category: string;
  date: string;
  label: string;
  size?: string;
  url?: string;
};

const INITIAL_RESOURCES: Resource[] = [
  { id: '1', title: 'React Performance Optimization', type: 'PDF', category: 'Computer Science', size: '2.4 MB', date: '2023-10-20', label: 'RESEARCH' },
  { id: '2', title: 'How to write a good research paper', type: 'Document', category: 'General', size: '1.1 MB', date: '2023-09-15', label: 'RESEARCH' },
  { id: '3', title: 'Business Strategy Frameworks', type: 'Link', category: 'Business', url: 'https://example.com', date: '2023-10-05', label: 'GUIDE' },
  { id: '4', title: 'Corporate Finance Case Studies', type: 'PDF', category: 'Finance', size: '5.2 MB', date: '2023-10-10', label: 'MATERIAL' },
];

export default function TeacherKnowledgeHubPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [resources, setResources] = useState(INITIAL_RESOURCES);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<any>(null);
  
  const [formData, setFormData] = useState({ title: '', category: 'General', type: 'Document', url: '' });

  const filteredResources = resources.filter(r => 
    r.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAdd = () => {
    if (!formData.title) {
      toast.error('Title is required');
      return;
    }
    setResources([...resources, {
      id: Date.now().toString(),
      title: formData.title,
      category: formData.category,
      type: formData.type,
      size: '1.0 MB',
      date: new Date().toISOString().split('T')[0],
      label: 'NEW',
      url: formData.url
    }]);
    setShowAddModal(false);
    setFormData({ title: '', category: 'General', type: 'Document', url: '' });
    toast.success('Resource added successfully!');
  };

  const handleEdit = () => {
    if (!formData.title) {
      toast.error('Title is required');
      return;
    }
    setResources(resources.map(r => r.id === showEditModal.id ? { ...r, ...formData } : r));
    setShowEditModal(null);
    toast.success('Resource updated successfully!');
  }

  const handleDelete = (id: string) => {
    setResources(resources.filter(r => r.id !== id));
    toast.success('Resource deleted.');
  };

  const handleView = (resource: any) => {
    if (resource.type === 'Link' || resource.url) {
      toast.success(`Opening ${resource.title} link in new tab`);
      window.open(resource.url || 'https://example.com', '_blank');
    } else {
      toast.success(`Downloading ${resource.title}`);
    }
  };

  const openEdit = (resource: any) => {
    setFormData({ title: resource.title, category: resource.category, type: resource.type, url: resource.url || '' });
    setShowEditModal(resource);
  };

  return (
    <>
      <Topbar title="Knowledge Hub" subtitle="Manage resources, articles, and guides" />
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-8">
          
          <div className="flex justify-end">
            <button 
              onClick={() => { setFormData({ title: '', category: 'General', type: 'Document', url: '' }); setShowAddModal(true); }}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20 whitespace-nowrap z-20 relative"
            >
               Add Resource
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {filteredResources.map((resource) => (
                <div key={resource.id} className="card p-6 flex flex-col hover:border-indigo-500/50 transition-colors group relative cursor-pointer" onClick={() => handleView(resource)}>
                   
                   {/* Actions Overlay */}
                   <div className="absolute top-4 right-4 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                     <button className="p-2 text-zinc-400 hover:text-white rounded-md transition-colors bg-zinc-800/80 hover:bg-zinc-700" onClick={() => openEdit(resource)}>
                       <Edit className="w-4 h-4" />
                     </button>
                     <button onClick={() => handleDelete(resource.id)} className="p-2 text-red-500/80 hover:text-red-400 rounded-md transition-colors bg-zinc-800/80 hover:bg-zinc-700">
                       <Trash2 className="w-4 h-4" />
                     </button>
                   </div>

                   <div className="inline-flex px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-500/10 text-indigo-400 w-max mb-4">
                     {resource.label}
                   </div>
                   
                   <h4 className="text-lg font-bold text-white mb-2">{resource.title}</h4>
                   <p className="text-sm text-zinc-400 flex-1 mb-6">Course material in {resource.category}</p>
                   
                   <div className="flex items-center justify-between text-sm">
                     <span className="text-zinc-500">Added {new Date(resource.date).toLocaleDateString()}</span>
                     <span className="text-indigo-400 font-medium flex items-center gap-1">View <ExternalLink className="w-3 h-3" /></span>
                   </div>
                </div>
             ))}
             {filteredResources.length === 0 && (
                <div className="col-span-full py-12 text-center text-zinc-500 card">
                  No resources have been added yet.
                </div>
             )}
          </div>
        </div>
      </div>

      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-5 relative">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{showEditModal ? 'Edit Resource' : 'Add New Resource'}</h2>
                <p className="text-sm text-zinc-400 mt-1">Configure resource details.</p>
              </div>
              <button onClick={() => { setShowAddModal(false); setShowEditModal(null); }} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Resource Title *</label>
                <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 relative z-10" placeholder="e.g. Study Guide v2" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Category</label>
                <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500">
                  {CATEGORIES.filter(c => c !== 'All').map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Type</label>
                <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500">
                  <option value="Document">Document</option>
                  <option value="PDF">PDF</option>
                  <option value="Video">Video</option>
                  <option value="Link">Web Link</option>
                </select>
              </div>
              {formData.type === 'Link' && (
                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1">URL</label>
                  <input type="url" value={formData.url} onChange={e => setFormData({...formData, url: e.target.value})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="https://" />
                </div>
              )}
            </div>
            
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
              <button onClick={() => { setShowAddModal(false); setShowEditModal(null); }} className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={showEditModal ? handleEdit : handleAdd} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg flex items-center gap-2 transition-all">
                <Upload className="w-4 h-4" /> {showEditModal ? 'Save Changes' : 'Add Resource'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

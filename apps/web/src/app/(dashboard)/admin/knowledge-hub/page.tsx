'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Search, Folder, FileText, ExternalLink, Download, Plus, X, Upload, Edit2, Trash2, Save } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const CATEGORIES = ['All', 'Computer Science', 'Business', 'Finance', 'General'];

type Resource = {
  id: string;
  title: string;
  type: string;
  category: string;
  size?: string;
  url?: string;
  date: string;
};

const INITIAL_RESOURCES: Resource[] = [
  { id: '1', title: 'React Performance Optimization', type: 'PDF', category: 'Computer Science', size: '2.4 MB', date: '2023-10-20' },
  { id: '2', title: 'Advanced Calculus Formula Sheet', type: 'Document', category: 'General', size: '1.1 MB', date: '2023-09-15' },
  { id: '3', title: 'Business Strategy Frameworks', type: 'Link', category: 'Business', url: 'https://example.com', date: '2023-10-05' },
  { id: '4', title: 'Corporate Finance Case Studies', type: 'PDF', category: 'Finance', size: '4.5 MB', date: '2023-08-20' },
];

export default function AdminKnowledgeHubPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [resources, setResources] = useState<Resource[]>(INITIAL_RESOURCES);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [formData, setFormData] = useState({ title: '', category: 'General', type: 'Document', url: '' });

  const filteredResources = resources.filter(r => {
    const matchesSearch = r.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === 'All' || r.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const handleOpenModal = (resource?: Resource) => {
    if (resource) {
      setEditingResource(resource);
      setFormData({
        title: resource.title,
        category: resource.category,
        type: resource.type,
        url: resource.url || '',
      });
    } else {
      setEditingResource(null);
      setFormData({ title: '', category: 'General', type: 'Document', url: '' });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingResource(null);
  };

  const handleSave = () => {
    if (!formData.title) {
      toast.error('Title is required');
      return;
    }
    
    if (editingResource) {
      setResources(resources.map(r => r.id === editingResource.id ? { 
        ...r, 
        ...formData,
        size: formData.type !== 'Link' ? r.size || '1.0 MB' : undefined
      } : r));
      toast.success('Resource updated successfully!');
    } else {
      setResources([...resources, {
        id: Date.now().toString(),
        title: formData.title,
        category: formData.category,
        type: formData.type,
        url: formData.type === 'Link' ? formData.url : undefined,
        size: formData.type !== 'Link' ? '1.0 MB' : undefined,
        date: new Date().toISOString().split('T')[0]
      }]);
      toast.success('Resource added successfully!');
    }
    handleCloseModal();
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this resource?')) {
      setResources(resources.filter(r => r.id !== id));
      toast.success('Resource deleted successfully.');
    }
  };

  return (
    <>
      <Topbar title="Knowledge Hub Management" subtitle="Manage course materials and shared resources" />
      <div className="flex-1 p-8 overflow-y-auto bg-[#09090b]">
        <div className="max-w-6xl mx-auto space-y-8">
          
          {/* Controls */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input 
                type="text" 
                placeholder="Search resources..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 z-10 relative"
              />
            </div>
            <button 
              onClick={() => handleOpenModal()}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20 whitespace-nowrap z-20 relative"
            >
              <Plus className="w-4 h-4" /> Add Resource
            </button>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            {/* Sidebar Categories */}
            <div className="w-full lg:w-64 shrink-0 space-y-2 relative z-10">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 px-2">Categories</h3>
              {CATEGORIES.map(category => (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    activeCategory === category 
                      ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' 
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-white border border-transparent'
                  }`}
                >
                  <Folder className={`w-4 h-4 ${activeCategory === category ? 'text-indigo-400' : 'text-zinc-500'}`} />
                  {category}
                </button>
              ))}
            </div>

            {/* Resources List */}
            <div className="flex-1 relative z-10">
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/80">
                  <h3 className="font-semibold text-white">Files in {activeCategory}</h3>
                  <span className="text-sm text-zinc-400">{filteredResources.length} items</span>
                </div>
                <div className="divide-y divide-zinc-800/50">
                  {filteredResources.length === 0 ? (
                    <div className="p-12 text-center text-zinc-500">
                      No resources found in this category.
                    </div>
                  ) : (
                    filteredResources.map((resource) => (
                      <div key={resource.id} className="p-4 flex items-center justify-between hover:bg-zinc-800/30 transition-colors group">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:bg-indigo-500/10 group-hover:text-indigo-400 transition-colors shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-sm font-medium text-white mb-0.5">{resource.title}</h4>
                            <div className="flex items-center gap-3 text-xs text-zinc-500">
                              <span>{resource.type}</span>
                              {resource.size && <span>• {resource.size}</span>}
                              <span>• Added {new Date(resource.date).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => handleOpenModal(resource)}
                            className="p-2 text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/20 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(resource.id)}
                            className="p-2 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/20 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">
                  {editingResource ? 'Edit Resource' : 'Add New Resource'}
                </h2>
                <p className="text-sm text-zinc-400 mt-1">Upload a file or add a link to the hub.</p>
              </div>
              <button onClick={handleCloseModal} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Resource Title *</label>
                <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="e.g. Study Guide v2" />
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
                  <input type="url" value={formData.url} onChange={e => setFormData({...formData, url: e.target.value})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="https://..." />
                </div>
              )}
            </div>
            
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
              <button onClick={handleCloseModal} className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleSave} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg flex items-center gap-2 transition-all">
                <Save className="w-4 h-4" /> {editingResource ? 'Save Changes' : 'Add Resource'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Search, Folder, FileText, ExternalLink, Download, Plus, X, Upload, Trash2, Share2, Copy } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const CATEGORIES = ['All', 'Computer Science', 'Business', 'Finance', 'General'];

type Resource = {
  id: string;
  title: string;
  type: string;
  category: string;
  isPublic?: boolean;
  url?: string;
  size?: string;
  date?: string;
};

export function SharedKnowledgeHub({ role }: { role: 'student' | 'teacher' | 'admin' }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [resources, setResources] = useState<Resource[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareSearchTerm, setShareSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({ title: '', type: 'Document', category: 'General', url: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { user } = useAuthStore();

  const fetchResources = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/knowledge-hub');
      // The backend returns an array of KnowledgeHubResource objects.
      // We map them to our frontend Resource type.
      const mapped = res.data.map((r: any) => ({
        id: r.id,
        title: r.title,
        type: r.url ? 'Link' : 'Document',
        category: r.category || 'General',
        url: r.url,
        date: new Date(r.createdAt).toISOString().split('T')[0],
        isPublic: r.isPublic,
      }));
      setResources(mapped);
    } catch (error) {
      console.error('Failed to load resources', error);
      toast.error('Failed to load resources');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  const filteredResources = resources.filter(r => {
    const matchesSearch = r.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === 'All' || r.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setFormData({
        ...formData,
        title: file.name.split('.')[0] || 'New File',
        type: file.type.includes('pdf') ? 'PDF' : 'Document'
      });
    }
  };

  const handleAdd = async () => {
    if (!formData.title && !selectedFile) {
      toast.error('Title or file is required');
      return;
    }

    try {
      let fileUrl = formData.url;

      if (formData.type !== 'Link' && selectedFile) {
        // In a real app we would upload the file to S3/GCS.
        // For this demo, we'll just mock a URL.
        fileUrl = `https://mock-storage.com/${selectedFile.name}`;
      }

      await api.post('/knowledge-hub', {
        title: formData.title || (selectedFile ? selectedFile.name : 'Untitled'),
        category: formData.category,
        url: fileUrl || undefined,
        isPublic: false,
      });
      
      setShowAddModal(false);
      setFormData({ title: '', category: 'General', type: 'Document', url: '' });
      setSelectedFile(null);
      toast.success('Resource added successfully!');
      fetchResources();
    } catch (error) {
      console.error(error);
      toast.error('Failed to add resource');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/knowledge-hub/${id}`);
      setResources(resources.filter(r => r.id !== id));
      toast.success('Resource deleted successfully.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete resource');
    }
  };

  const handleShareHub = () => {
    setShowShareModal(true);
  };

  const submitShareHub = async () => {
    try {
      // For demo purposes, we will just make all current user's resources public
      // In a real app we'd probably have a 'share hub' endpoint or a 'profile settings' toggle
      const myResources = resources.filter(r => !r.isPublic);
      await Promise.all(myResources.map(r => api.patch(`/knowledge-hub/${r.id}`, { isPublic: true })));
      
      toast.success('Your Knowledge Hub is now public and shared successfully!');
      setShowShareModal(false);
      setShareSearchTerm('');
      fetchResources();
    } catch (error) {
      console.error(error);
      toast.error('Failed to share hub');
    }
  };

  const handleShareFile = (title: string) => {
    navigator.clipboard.writeText(`Check out this resource: ${title}`);
    toast.success(`Share link for "${title}" copied to clipboard!`);
  };

  const handleDownload = (resource: Resource) => {
    if (resource.type === 'Link' && resource.url) {
      window.open(resource.url, '_blank');
      return;
    }

    if (resource.url) {
      // It's an object URL (simulated file)
      const a = document.createElement('a');
      a.href = resource.url;
      a.download = resource.title;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      // Fallback for dummy resources
      toast.error('File content not available for mock resource.');
    }
  };

  const titles = {
    student: 'My Knowledge Hub',
    teacher: 'Educator Knowledge Hub',
    admin: 'Knowledge Hub Management'
  };

  const subtitles = {
    student: 'Access course materials and share resources with peers and mentors',
    teacher: 'Manage course materials and share resources with your classes',
    admin: 'Manage platform-wide course materials and shared resources'
  };

  return (
    <>
      <Topbar title={titles[role]} subtitle={subtitles[role]} />
      <div className="flex-1 p-8 overflow-y-auto bg-[#09090b]">
        <div className="max-w-6xl mx-auto space-y-8">
          
          {/* Controls */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 dark:text-zinc-400" />
              <input 
                type="text" 
                placeholder="Search resources..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 z-10 relative"
              />
            </div>
            <div className="flex gap-3">
              <button 
                onClick={handleShareHub}
                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border border-zinc-700 whitespace-nowrap z-20"
              >
                <Share2 className="w-4 h-4" /> Share Hub
              </button>
              <button 
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20 whitespace-nowrap z-20 relative"
              >
                <Plus className="w-4 h-4" /> Add Resource
              </button>
            </div>
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
              <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/[0.05] rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-white/[0.05] flex justify-between items-center bg-white/[0.02]">
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
                      <div key={resource.id} className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors group">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-white/[0.04] flex items-center justify-center text-zinc-400 group-hover:bg-indigo-500/10 group-hover:text-indigo-400 transition-colors shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-sm font-medium text-white mb-0.5">{resource.title}</h4>
                            <div className="flex items-center gap-3 text-xs text-zinc-500">
                              <span>{resource.type}</span>
                              {resource.size && <span>• {resource.size}</span>}
                              <span>• Added {resource.date}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => handleShareFile(resource.title)}
                            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                            title="Share"
                          >
                            <Share2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDownload(resource)}
                            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                            title={resource.type === 'Link' ? 'Open Link' : 'Download'}
                          >
                            {resource.type === 'Link' ? <ExternalLink className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                          </button>
                          <button 
                            onClick={() => handleDelete(resource.id)}
                            className="p-2 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                            title="Delete"
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

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Add New Resource</h2>
                <p className="text-sm text-zinc-400 mt-1">Upload a file or add a link to your hub.</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Type</label>
                <select value={formData.type} onChange={e => {
                    setFormData({...formData, type: e.target.value});
                    if (e.target.value === 'Link') setSelectedFile(null);
                  }} 
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500">
                  <option value="Document">Document Upload</option>
                  <option value="PDF">PDF Upload</option>
                  <option value="Video">Video Upload</option>
                  <option value="Link">Web Link</option>
                </select>
              </div>

              {formData.type === 'Link' ? (
                <>
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">Resource Title *</label>
                    <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="e.g. Study Guide v2" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">URL *</label>
                    <input type="url" value={formData.url} onChange={e => setFormData({...formData, url: e.target.value})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="https://..." />
                  </div>
                </>
              ) : (
                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1">Upload File *</label>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-zinc-700 hover:border-indigo-500 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors bg-zinc-950/50"
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      onChange={handleFileChange}
                    />
                    <Upload className="w-8 h-8 text-zinc-500 mb-2" />
                    <p className="text-sm font-medium text-zinc-300 text-center">
                      {selectedFile ? selectedFile.name : 'Click to select a file'}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      {selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB` : 'PDF, DOCX, MP4 up to 50MB'}
                    </p>
                  </div>
                  {selectedFile && (
                    <div className="mt-3">
                      <label className="text-xs font-medium text-zinc-300 block mb-1">Rename File (Optional)</label>
                      <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500" />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Category</label>
                <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500">
                  {CATEGORIES.filter(c => c !== 'All').map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleAdd} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg flex items-center gap-2 transition-all">
                <Plus className="w-4 h-4" /> Add Resource
              </button>
            </div>
          </div>
        </div>
      )}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Share Knowledge Hub</h2>
                <p className="text-sm text-zinc-400 mt-1">Make your resources visible to others.</p>
              </div>
              <button onClick={() => setShowShareModal(false)} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Share with</label>
                <input 
                  type="text" 
                  value={shareSearchTerm} 
                  onChange={e => setShareSearchTerm(e.target.value)} 
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500" 
                  placeholder="Search by name or email (e.g., Alice)..." 
                />
              </div>
              <div className="text-xs text-zinc-500">
                Leaving this empty will make your hub visible to anyone viewing your public profile.
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
              <button onClick={() => setShowShareModal(false)} className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={submitShareHub} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg flex items-center gap-2 transition-all">
                <Share2 className="w-4 h-4" /> Share
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

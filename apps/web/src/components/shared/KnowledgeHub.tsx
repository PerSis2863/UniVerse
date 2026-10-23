'use client';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, STUDENT_LEARN_TABS, TEACHER_LEARN_TABS } from '@/components/layout/SectionTabs';
import { uploadChatFile } from '@/components/chat/chat-client';
import { Search, FileText, ExternalLink, Download, Plus, X, Upload, Trash2, Share2, FolderOpen } from 'lucide-react';
import { FolderCard } from '@/components/files/FolderCard';
import { useState, useRef } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import useSWR from 'swr';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { FileDrop } from '@/components/ui/FileDrop';

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
  const [showAddModal, setShowAddModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareSearchTerm, setShareSearchTerm] = useState('');
  const [formData, setFormData] = useState({ title: '', type: 'Document', category: 'General', url: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  

  // KnowledgeHubResource rows, shaped for this page.
  const { data: resources = [], isLoading: loading, mutate: fetchResources } = useSWR<Resource[]>('/knowledge-hub', async (url: string) => {
    const res = await api.get<{ id: string; title: string; url: string | null; category: string | null; createdAt: string; isPublic: boolean }[]>(url);
    return res.data.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.url ? 'Link' : 'Document',
      category: r.category || 'General',
      url: r.url ?? undefined,
      date: new Date(r.createdAt).toISOString().split('T')[0],
      isPublic: r.isPublic,
    }));
  }, { onError: () => toast.error('Failed to load resources') });

  const filteredResources = resources.filter(r => {
    const matchesSearch = r.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === 'All' || r.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) takeFile(e.target.files[0]);
  };
  // Chosen, dropped or pasted (Phase E).
  const takeFile = (file: File) => {
    setSelectedFile(file);
    setFormData({
      ...formData,
      title: file.name.split('.')[0] || 'New File',
      type: file.type.includes('pdf') ? 'PDF' : 'Document'
    });
  };

  const handleAdd = async () => {
    if (!formData.title && !selectedFile) {
      toast.error('Title or file is required');
      return;
    }

    try {
      let fileUrl = formData.url;

      if (formData.type !== 'Link' && selectedFile) {
        const uploaded = await uploadChatFile(selectedFile);
        fileUrl = uploaded.startsWith('/') ? `${window.location.origin}${uploaded}` : uploaded;
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
      toast.error(errorMessage(error, (error as Error)?.message || 'Failed to add resource'));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/knowledge-hub/${id}`);
      void fetchResources(resources.filter((r) => r.id !== id), { revalidate: false });
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

  const handleShareFile = async (title: string, url?: string) => {
    try {
      await navigator.clipboard.writeText(url ? `${title}: ${url}` : title);
      toast.success(url ? 'Link copied — paste it into a chat or email' : 'Title copied (this resource has no link to share)');
    } catch {
      toast.error('Could not copy to the clipboard');
    }
  };

  const handleDownload = (resource: Resource) => {
    if (resource.type === 'Link' && resource.url) {
      window.open(resource.url, '_blank');
      return;
    }

    if (resource.url) {
      const a = document.createElement('a');
      a.href = resource.url;
      a.download = resource.title;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      toast.error('This resource has no file or link attached.');
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
      {role === 'student' && <SectionTabs tabs={STUDENT_LEARN_TABS} />}
      {role === 'teacher' && <SectionTabs tabs={TEACHER_LEARN_TABS} />}
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-8">
          
          {/* Controls */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            <div className="relative w-full md:w-96">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 dark:text-zinc-400" />
              <input 
                type="text" 
                placeholder="Search resources..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full ps-10 pe-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 z-10 relative"
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
                className="btn-primary z-20 relative"
              >
                <Plus className="w-4 h-4" /> Add Resource
              </button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            {/* Categories, as folders that open (M5): each fans out its first resources. */}
            <ul aria-label="Categories" className="w-full lg:w-60 shrink-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-x-4 gap-y-8 pt-8 relative z-10">
              {CATEGORIES.map((category, i) => {
                const inside = resources.filter((r) => category === 'All' || r.category === category);
                return (
                  <li key={category} className={activeCategory === category ? 'folder-chosen' : undefined}>
                    <FolderCard name={category} seed={`kh-${category}`} index={i} sub={`${inside.length} ${inside.length === 1 ? 'item' : 'items'}`}
                      label={`Show ${category}, ${inside.length} ${inside.length === 1 ? 'item' : 'items'}${activeCategory === category ? ' (shown)' : ''}`}
                      peek={inside.slice(0, 3).map((r) => ({ name: r.title, meta: [r.type?.toUpperCase(), r.size].filter(Boolean).join(' · ') }))}
                      onOpen={() => setActiveCategory(category)}
                      action={category !== 'All' ? { kind: 'add', label: `Add a resource to ${category}`, onClick: () => setShowAddModal(true) } : undefined} />
                  </li>
                );
              })}
            </ul>

            {/* Resources List */}
            <div className="flex-1 relative z-10">
              <div className="bg-white/80 dark:bg-zinc-900/50 backdrop-blur-xl border border-zinc-200 dark:border-white/[0.05] rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-zinc-200 dark:border-white/[0.05] flex justify-between items-center bg-zinc-50 dark:bg-white/[0.02]">
                  <h3 className="font-semibold text-zinc-900 dark:text-white">Files in {activeCategory}</h3>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">{filteredResources.length} items</span>
                </div>
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800/50">
                  {loading ? (
                    <ContentSkeleton variant="list" className="p-4" />
                  ) : filteredResources.length === 0 ? (
                    <EmptyState compact icon={FolderOpen} title="No resources here yet" hint="Share notes, slides or links and they’ll appear in this category." />
                  ) : (
                    filteredResources.map((resource) => (
                      <div key={resource.id} className="p-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors group">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-white/[0.04] flex items-center justify-center text-zinc-500 dark:text-zinc-400 group-hover:bg-indigo-500/10 group-hover:text-indigo-400 transition-colors shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-sm font-medium text-zinc-900 dark:text-white mb-0.5">{resource.title}</h4>
                            <div className="flex items-center gap-3 text-xs text-zinc-500">
                              <span>{resource.type}</span>
                              {resource.size && <span>• {resource.size}</span>}
                              <span>• Added {resource.date}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <button 
                            onClick={() => handleShareFile(resource.title, resource.url)}
                            className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                            title="Share"
                          >
                            <Share2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDownload(resource)}
                            className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                            title={resource.type === 'Link' ? 'Open Link' : 'Download'}
                          >
                            {resource.type === 'Link' ? <ExternalLink className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                          </button>
                          <button 
                            onClick={() => handleDelete(resource.id)}
                            className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
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
        <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="sheet-in bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Add New Resource</h2>
                <p className="text-sm text-zinc-400 mt-1">Upload a file or add a link to your hub.</p>
              </div>
              <button aria-label="Close" onClick={() => setShowAddModal(false)} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 block mb-1">Type</label>
                <select aria-label="Type" value={formData.type} onChange={e => {
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
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 block mb-1">Resource Title *</label>
                    <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="e.g. Study Guide v2" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 block mb-1">URL *</label>
                    <input type="url" value={formData.url} onChange={e => setFormData({...formData, url: e.target.value})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="https://..." />
                  </div>
                </>
              ) : (
                <div>
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 block mb-1">Upload File *</label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={(e) => { handleFileChange(e); e.target.value = ''; }}
                  />
                  <FileDrop hint={false} onFiles={(f) => takeFile(f[0])}>
                  {/* A button, so it can be reached and used with the keyboard too. */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-zinc-700 hover:border-indigo-500 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors bg-zinc-950/50"
                  >
                    <Upload className="w-8 h-8 text-zinc-500 mb-2" />
                    <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300 text-center">
                      {selectedFile ? selectedFile.name : 'Choose a file'}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      {selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB` : 'PDF, DOCX, MP4 up to 50MB · or drop it here'}
                    </p>
                  </button>
                  </FileDrop>
                  {selectedFile && (
                    <div className="mt-3">
                      <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 block mb-1">Rename File (Optional)</label>
                      <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500" />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 block mb-1">Category</label>
                <select aria-label="Category" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500">
                  {CATEGORIES.filter(c => c !== 'All').map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleAdd} className="btn-primary">
                <Plus className="w-4 h-4" /> Add Resource
              </button>
            </div>
          </div>
        </div>
      )}
      {showShareModal && (
        <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="sheet-in bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Share Knowledge Hub</h2>
                <p className="text-sm text-zinc-400 mt-1">Make your resources visible to others.</p>
              </div>
              <button aria-label="Close" onClick={() => setShowShareModal(false)} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 block mb-1">Share with</label>
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
              <button onClick={submitShareHub} className="btn-primary">
                <Share2 className="w-4 h-4" /> Share
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

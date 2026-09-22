'use client';
import { Topbar } from '@/components/layout/Topbar';
import { FileText, Download, UploadCloud, Eye, Plus, FileBadge2, X, FileSearch, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

type Doc = {
  id: string;
  title: string;
  type: string;
  fileUrl: string;
  createdAt: string;
  isVerified: boolean;
};

export default function DocumentsPage() {
  const [category, setCategory] = useState('All Categories');
  const [activeModal, setActiveModal] = useState<'upload' | 'view' | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const res = await api.get('/documents/my');
      setDocuments(res.data);
    } catch (error) {
      toast.error('Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredDocs = category === 'All Categories' ? documents : documents.filter(d => d.type === category.toUpperCase() || (category === 'Other' && d.type === 'OTHER'));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      simulateUpload(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const simulateUpload = async (file: File) => {
    setUploadProgress(10);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percentCompleted);
          }
        },
      });
      
      finishUpload(file.name, res.data.url);
    } catch (error) {
      toast.error('Failed to upload file');
      setUploadProgress(0);
    }
  };

  const finishUpload = async (fileName: string, fileUrl: string) => {
    try {
      await api.post('/documents', {
        title: fileName,
        fileUrl: process.env.NEXT_PUBLIC_API_URL + fileUrl,
        type: 'OTHER'
      });
      toast.success(`Successfully uploaded ${fileName}`);
      await fetchDocuments();
      setActiveModal(null);
      setUploadProgress(0);
    } catch (error) {
      toast.error('Failed to save document record');
      setUploadProgress(0);
    }
  };

  const handleView = (doc: Doc) => {
    setSelectedDoc(doc);
    setActiveModal('view');
  };

  const handleDownload = async (doc: Doc) => {
    toast.success(`Downloading ${doc.title}...`);
    try {
      const response = await fetch(doc.fileUrl);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.title;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Failed to download document');
    }
  };

  if (isLoading) {
    return (
      <>
        <Topbar title="School Documents" subtitle="Manage your official academic and administrative files." />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar 
        title="School Documents" 
        subtitle="Manage your official academic and administrative files." 
        action={{ label: 'Upload Document', onClick: () => setActiveModal('upload') }}
      />
      <div className="flex-1 p-8 space-y-8 overflow-y-auto">
        
        {/* Upload Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-dashed border-indigo-500/30 bg-indigo-500/5 dark:bg-indigo-500/10 p-8 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center mb-4 text-indigo-600 dark:text-indigo-400">
            <UploadCloud className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Upload new documents</h3>
          <p className="text-zinc-600 dark:text-zinc-400 text-sm max-w-sm mb-6">
            Keep your profile up to date by uploading required files here. Supported formats: PDF, JPG, PNG (Max 10MB).
          </p>
          <button onClick={() => setActiveModal('upload')} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Open Uploader
          </button>
        </div>

        {/* Document List */}
        <div className="card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h2 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <FileBadge2 className="w-5 h-5 text-indigo-500" /> My Documents
            </h2>
            <div className="flex gap-2">
              <select 
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="bg-zinc-100 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/[0.06] rounded-xl px-3 py-1.5 text-sm outline-none focus:border-indigo-500/50 text-zinc-900 dark:text-white"
                style={{ colorScheme: 'dark' }}
              >
                <option>All Categories</option>
                <option>Transcript</option>
                <option>Diploma</option>
                <option>Certificate</option>
                <option>ID_Card</option>
                <option>Other</option>
              </select>
            </div>
          </div>

          {filteredDocs.length === 0 ? (
            <div className="text-zinc-500 text-sm">No documents found.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocs.map((doc, i) => (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                  key={doc.id} 
                  className="group relative p-5 rounded-2xl bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/[0.05] hover:border-indigo-500/30 hover:bg-white/[0.04] transition-all"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 rounded-xl bg-zinc-200 dark:bg-white/[0.06] flex items-center justify-center text-zinc-500 dark:text-zinc-400 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition-colors">
                      <FileText className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      {doc.type}
                    </span>
                  </div>
                  
                  <h4 className="font-bold text-zinc-900 dark:text-white mb-1 line-clamp-1" title={doc.title}>
                    {doc.title}
                  </h4>
                  <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 mb-6">
                    <span>PDF</span>
                    <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                    <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                  </div>

                  <div className="flex items-center gap-2 pt-4 border-t border-zinc-200 dark:border-white/[0.06]">
                    <button onClick={() => handleView(doc)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-100 dark:bg-white/[0.04] hover:bg-zinc-200 dark:hover:bg-white/[0.08] text-zinc-700 dark:text-zinc-300 text-xs font-semibold transition-colors">
                      <Eye className="w-3.5 h-3.5" /> View
                    </button>
                    <button onClick={() => handleDownload(doc)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-semibold transition-colors">
                      <Download className="w-3.5 h-3.5" /> Download
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Modals */}
      <AnimatePresence>
        {activeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setActiveModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-zinc-800 flex justify-between items-start bg-zinc-900/50">
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">
                    {activeModal === 'upload' ? 'Upload Document' : selectedDoc?.title}
                  </h2>
                  <div className="text-sm text-zinc-400">
                    {activeModal === 'upload' ? 'Select a file to add to your records.' : `${selectedDoc?.type} • Uploaded ${new Date(selectedDoc?.createdAt || '').toLocaleDateString()}`}
                  </div>
                </div>
                <button onClick={() => setActiveModal(null)} className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto">
                {activeModal === 'upload' && (
                  <div className="space-y-6">
                    <div className="border-2 border-dashed border-zinc-700 bg-white/[0.02] hover:bg-white/[0.04] transition-colors rounded-2xl p-12 flex flex-col items-center justify-center text-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                      <UploadCloud className="w-12 h-12 text-indigo-400 mb-4" />
                      <div className="text-lg font-bold text-white mb-1">Click to browse or drag file here</div>
                      <div className="text-sm text-zinc-400">Supported formats: PDF, JPG, PNG (Max 10MB)</div>
                      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png" />
                    </div>

                    {uploadProgress > 0 && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-white">Uploading...</span>
                          <span className="text-zinc-400">{uploadProgress}%</span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-indigo-500 transition-all duration-200 ease-out"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeModal === 'view' && selectedDoc && (
                  <div className="space-y-6">
                    <div className="aspect-[1/1.4] w-full max-w-md mx-auto bg-white rounded-xl shadow-inner border border-zinc-200 flex flex-col items-center justify-center p-8 relative overflow-hidden">
                      <div className="absolute inset-0 opacity-5 bg-[linear-gradient(45deg,#000_25%,transparent_25%,transparent_75%,#000_75%,#000_100%),linear-gradient(45deg,#000_25%,transparent_25%,transparent_75%,#000_75%,#000_100%)] bg-[length:20px_20px] bg-[position:0_0,10px_10px]" />
                      <FileSearch className="w-20 h-20 text-zinc-300 mb-4" />
                      <div className="text-center">
                        <div className="font-bold text-zinc-400 text-lg">Preview not available</div>
                        <div className="text-sm text-zinc-500 mt-2">Download the file to view its full contents.</div>
                      </div>
                    </div>
                    
                    <div className="flex justify-center">
                      <button onClick={() => handleDownload(selectedDoc)} className="btn-primary py-3 px-8 rounded-xl font-bold flex items-center gap-2">
                        <Download className="w-5 h-5" /> Download {selectedDoc.type}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

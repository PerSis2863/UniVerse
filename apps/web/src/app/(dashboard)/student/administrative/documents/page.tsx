'use client';
import { Topbar } from '@/components/layout/Topbar';
import { FileText, Download, UploadCloud, Eye, Plus, FileBadge2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState, useRef } from 'react';
import { toast } from 'sonner';

const documents = [
  { id: '1', name: 'Official Transcript 2025-2026', type: 'PDF', size: '2.4 MB', date: 'Sept 15, 2026', category: 'Academic' },
  { id: '2', name: 'Enrollment Certificate', type: 'PDF', size: '1.1 MB', date: 'Aug 20, 2026', category: 'Administrative' },
  { id: '3', name: 'Student ID Card (Digital)', type: 'JPG', size: '3.5 MB', date: 'Aug 10, 2026', category: 'Identity' },
  { id: '4', name: 'Tuition Receipt Q1', type: 'PDF', size: '840 KB', date: 'Jul 28, 2026', category: 'Financial' },
];

export default function DocumentsPage() {
  const [category, setCategory] = useState('All Categories');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredDocs = category === 'All Categories' ? documents : documents.filter(d => d.category === category);

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      toast.success(`File selected: ${e.target.files[0].name}`);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleView = (docName: string) => {
    toast.info(`Opening ${docName} in viewer...`);
  };

  const handleDownload = (docName: string) => {
    toast.success(`Downloading ${docName}...`);
    const blob = new Blob(["This is a dummy document content."], { type: "application/pdf" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${docName.replace(/\s+/g, "_")}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <>
      <Topbar 
        title="School Documents" 
        subtitle="Manage your official academic and administrative files." 
        action={{ label: 'Upload Document', onClick: handleBrowseClick }}
      />
      <div className="flex-1 p-8 space-y-8">
        
        {/* Upload Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-dashed border-indigo-500/30 bg-indigo-500/5 dark:bg-indigo-500/10 p-8 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center mb-4 text-indigo-600 dark:text-indigo-400">
            <UploadCloud className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Upload new documents</h3>
          <p className="text-zinc-600 dark:text-zinc-400 text-sm max-w-sm mb-6">
            Drag and drop your files here, or click to browse. Supported formats: PDF, JPG, PNG (Max 10MB).
          </p>
          <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png" />
          <button onClick={handleBrowseClick} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Browse Files
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
                className="bg-zinc-100 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/[0.06] rounded-xl px-3 py-1.5 text-sm outline-none focus:border-indigo-500/50"
              >
                <option>All Categories</option>
                <option>Academic</option>
                <option>Administrative</option>
                <option>Financial</option>
                <option>Identity</option>
              </select>
            </div>
          </div>

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
                
                <h4 className="font-bold text-zinc-900 dark:text-white mb-1 line-clamp-1" title={doc.name}>
                  {doc.name}
                </h4>
                <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 mb-6">
                  <span>{doc.size}</span>
                  <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                  <span>{doc.date}</span>
                </div>

                <div className="flex items-center gap-2 pt-4 border-t border-zinc-200 dark:border-white/[0.06]">
                  <button onClick={() => handleView(doc.name)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-100 dark:bg-white/[0.04] hover:bg-zinc-200 dark:hover:bg-white/[0.08] text-zinc-700 dark:text-zinc-300 text-xs font-semibold transition-colors">
                    <Eye className="w-3.5 h-3.5" /> View
                  </button>
                  <button onClick={() => handleDownload(doc.name)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-semibold transition-colors">
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

      </div>
    </>
  );
}

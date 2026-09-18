'use client';

import { Topbar } from '@/components/layout/Topbar';
import { FileText, Download, UploadCloud, Search, Eye, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

const DOCUMENTS = [
  { id: 1, name: 'Official Transcript (Fall 2025)', date: 'Jan 15, 2026', type: 'Academic', size: '245 KB' },
  { id: 2, name: 'Enrollment Verification Letter', date: 'Sep 01, 2025', type: 'Administrative', size: '120 KB' },
  { id: 3, name: 'Student ID Card (Digital Copy)', date: 'Aug 20, 2025', type: 'Identity', size: '1.2 MB' },
  { id: 4, name: 'Health Insurance Waiver', date: 'Aug 15, 2025', type: 'Health', size: '340 KB' },
];

export default function SchoolDocuments() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const handleAction = (message: string) => {
    setToastMessage(message);
    setShowRequestModal(false);
    setShowUploadModal(false);
    setTimeout(() => setToastMessage(''), 3000);
  };

  return (
    <>
      <Topbar title="School Documents" subtitle="Access and request official university documents" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input 
                type="text" 
                placeholder="Search documents..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-zinc-900/50 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 transition-all"
              />
            </div>
            
            <div className="flex gap-2 w-full sm:w-auto">
              <button 
                onClick={() => setShowUploadModal(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                <UploadCloud className="w-4 h-4" /> Upload
              </button>
              <button 
                onClick={() => setShowRequestModal(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Request Document
              </button>
            </div>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80">
                  <th className="p-4 text-sm font-medium text-zinc-400">Document Name</th>
                  <th className="p-4 text-sm font-medium text-zinc-400 hidden md:table-cell">Category</th>
                  <th className="p-4 text-sm font-medium text-zinc-400">Date Issued</th>
                  <th className="p-4 text-sm font-medium text-zinc-400 hidden sm:table-cell">Size</th>
                  <th className="p-4 text-sm font-medium text-zinc-400 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {DOCUMENTS.map((doc) => (
                  <tr key={doc.id} className="hover:bg-zinc-800/30 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-indigo-400" />
                        </div>
                        <span className="font-medium text-white group-hover:text-indigo-400 transition-colors cursor-pointer">{doc.name}</span>
                      </div>
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300">
                        {doc.type}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-zinc-300">{doc.date}</td>
                    <td className="p-4 text-sm text-zinc-400 hidden sm:table-cell">{doc.size}</td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => toast.success('Viewing document...')} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700/50 rounded-lg transition-colors" title="View">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => toast.success('Downloading document...')} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700/50 rounded-lg transition-colors" title="Download">
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {DOCUMENTS.length === 0 && (
              <div className="p-8 text-center text-zinc-500">
                No documents found.
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-emerald-500/90 backdrop-blur text-white px-6 py-3 rounded-xl shadow-2xl z-50 animate-in slide-in-from-bottom-5 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-4">Request Official Document</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Document Type</label>
                <select className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500 transition-colors">
                  <option>Official Transcript</option>
                  <option>Enrollment Verification</option>
                  <option>Degree Certificate</option>
                  <option>Recommendation Letter Template</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Reason (Optional)</label>
                <textarea className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500 transition-colors h-24 resize-none" placeholder="E.g., for visa application..."></textarea>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowRequestModal(false)} className="px-4 py-2 text-zinc-300 hover:text-white transition-colors">Cancel</button>
                <button onClick={() => handleAction('Document requested successfully!')} className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium transition-colors">Submit Request</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-4">Upload Document</h2>
            <div className="space-y-4">
              <div className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center bg-zinc-800/30">
                <UploadCloud className="w-8 h-8 text-zinc-500 mx-auto mb-3" />
                <p className="text-zinc-300 font-medium mb-1">Click to upload or drag and drop</p>
                <p className="text-zinc-500 text-xs">PDF, JPG, PNG up to 10MB</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Document Category</label>
                <select className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500 transition-colors">
                  <option>Identity Proof</option>
                  <option>Medical Certificate</option>
                  <option>Previous Transcripts</option>
                  <option>Other</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowUploadModal(false)} className="px-4 py-2 text-zinc-300 hover:text-white transition-colors">Cancel</button>
                <button onClick={() => handleAction('Document uploaded successfully!')} className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium transition-colors">Upload</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

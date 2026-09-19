'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Calendar, CheckCircle2, XCircle, Clock, Info, Upload, X, FileText, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

// Mock data for student
const MOCK_ATTENDANCE = [
  { id: '1', date: '2026-10-24', course: 'Business Admin 101', status: 'PRESENT' },
  { id: '2', date: '2026-10-22', course: 'Corporate Finance', status: 'LATE' },
  { id: '3', date: '2026-10-20', course: 'Digital Marketing', status: 'ABSENT', justificationStatus: 'NONE' },
  { id: '4', date: '2026-10-18', course: 'Computer Science', status: 'PRESENT' },
  { id: '5', date: '2026-10-15', course: 'Economics', status: 'ABSENT', justificationStatus: 'PENDING' },
];

export default function StudentAttendance() {
  const [records, setRecords] = useState(MOCK_ATTENDANCE);
  const [isJustifyModalOpen, setIsJustifyModalOpen] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  
  // Justification form state
  const [reason, setReason] = useState('');
  const [fileAttached, setFileAttached] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalClasses = records.length;
  const presentClasses = records.filter(s => s.status === 'PRESENT').length;
  const lateClasses = records.filter(s => s.status === 'LATE').length;
  const absentClasses = records.filter(s => s.status === 'ABSENT').length;
  const attendanceRate = Math.round(((presentClasses + (lateClasses * 0.5)) / totalClasses) * 100) || 0;

  const openJustifyModal = (id: string) => {
    setSelectedRecordId(id);
    setReason('');
    setFileAttached(false);
    setIsJustifyModalOpen(true);
  };

  const handleSubmitJustification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason || !fileAttached) {
      toast.error('Please provide a reason and attach a supporting document/photo.');
      return;
    }
    
    setIsSubmitting(true);
    
    // Mock network request
    setTimeout(() => {
      setRecords(records.map(r => 
        r.id === selectedRecordId 
          ? { ...r, justificationStatus: 'PENDING' } 
          : r
      ));
      setIsSubmitting(false);
      setIsJustifyModalOpen(false);
      toast.success('Absence justification submitted to Administration.');
    }, 1000);
  };

  return (
    <>
      <Topbar title="Attendance" subtitle="Track your course attendance and manage absences" />
      
      {/* Justification Modal */}
      {isJustifyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                Justify Absence
              </h2>
              <button onClick={() => setIsJustifyModalOpen(false)} className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmitJustification} className="p-6 space-y-5">
              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3 text-sm text-indigo-300 flex gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>Submit a valid medical certificate or official document to excuse this absence. False claims may result in disciplinary action.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Reason for Absence</label>
                <textarea 
                  required 
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-3 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 h-24 resize-none"
                  placeholder="e.g. Medical emergency (see attached doctor's note)"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Supporting Photo / Document</label>
                <label 
                  className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center transition-colors cursor-pointer ${
                    fileAttached ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-200 dark:border-zinc-800 hover:border-indigo-500/50 bg-zinc-50 dark:bg-zinc-950'
                  }`}
                >
                  <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => setFileAttached(e.target.files && e.target.files.length > 0 ? true : false)} />
                  {fileAttached ? (
                    <>
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                      <span className="text-emerald-400 text-sm font-medium">Document attached successfully</span>
                      <span className="text-zinc-500 dark:text-zinc-500 text-xs mt-1">Click to replace</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-zinc-600 mb-2" />
                      <span className="text-zinc-600 dark:text-zinc-400 text-sm font-medium">Click to upload photo/PDF</span>
                      <span className="text-zinc-600 text-xs mt-1">Max file size: 5MB</span>
                    </>
                  )}
                </label>
              </div>

              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-zinc-900 dark:text-white rounded-xl font-medium transition-colors shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <div className="w-5 h-5 border-2 border-zinc-300 dark:border-white/20 border-t-white rounded-full animate-spin" /> : null}
                  {isSubmitting ? 'Submitting...' : 'Submit Justification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex-1 p-8 overflow-y-auto bg-[#09090b]">
        <div className="max-w-5xl mx-auto space-y-8">
          
          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
              <div className="text-4xl font-bold text-indigo-400 mb-1">{attendanceRate}%</div>
              <div className="text-sm font-medium text-indigo-300">Overall Rate</div>
            </div>
            <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/50 rounded-2xl p-6 flex flex-col items-center justify-center">
              <div className="flex items-center gap-2 text-2xl font-bold text-emerald-400 mb-1">
                <CheckCircle2 className="w-6 h-6" /> {presentClasses}
              </div>
              <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Present</div>
            </div>
            <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/50 rounded-2xl p-6 flex flex-col items-center justify-center">
              <div className="flex items-center gap-2 text-2xl font-bold text-amber-400 mb-1">
                <Clock className="w-6 h-6" /> {lateClasses}
              </div>
              <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Late</div>
            </div>
            <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/50 rounded-2xl p-6 flex flex-col items-center justify-center">
              <div className="flex items-center gap-2 text-2xl font-bold text-red-400 mb-1">
                <XCircle className="w-6 h-6" /> {absentClasses}
              </div>
              <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Absent</div>
            </div>
          </div>

          {/* Attendance Records */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Recent Records</h2>
            </div>
            
            <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/50 rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-950/80">
                    <th className="p-5 text-xs font-semibold tracking-wider text-zinc-500 dark:text-zinc-500 uppercase border-b border-zinc-200 dark:border-zinc-800/50">Date</th>
                    <th className="p-5 text-xs font-semibold tracking-wider text-zinc-500 dark:text-zinc-500 uppercase border-b border-zinc-200 dark:border-zinc-800/50">Course</th>
                    <th className="p-5 text-xs font-semibold tracking-wider text-zinc-500 dark:text-zinc-500 uppercase border-b border-zinc-200 dark:border-zinc-800/50">Status</th>
                    <th className="p-5 text-xs font-semibold tracking-wider text-zinc-500 dark:text-zinc-500 uppercase border-b border-zinc-200 dark:border-zinc-800/50 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/30">
                  {records.map((record) => (
                    <tr key={record.id} className="hover:bg-zinc-100 dark:bg-zinc-800/20 transition-colors">
                      <td className="p-5 text-zinc-900 dark:text-white text-sm font-medium">
                        {new Date(record.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="p-5 text-zinc-300 text-sm">
                        {record.course}
                      </td>
                      <td className="p-5">
                        {record.status === 'PRESENT' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 className="w-3.5 h-3.5" /> Present</span>}
                        {record.status === 'LATE' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"><Clock className="w-3.5 h-3.5" /> Late</span>}
                        {record.status === 'ABSENT' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20"><XCircle className="w-3.5 h-3.5" /> Absent</span>}
                        {record.status === 'EXCUSED' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20"><CheckCircle2 className="w-3.5 h-3.5" /> Excused</span>}
                      </td>
                      <td className="p-5 text-right">
                        {record.status === 'ABSENT' && record.justificationStatus === 'NONE' && (
                          <button 
                            onClick={() => openJustifyModal(record.id)}
                            className="text-xs font-semibold px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg transition-colors border border-indigo-500/20"
                          >
                            Justify Absence
                          </button>
                        )}
                        {record.status === 'ABSENT' && record.justificationStatus === 'PENDING' && (
                          <span className="text-xs font-medium text-amber-500 flex items-center justify-end gap-1.5">
                            <Clock className="w-3.5 h-3.5" /> Under Review
                          </span>
                        )}
                         {record.status === 'ABSENT' && record.justificationStatus === 'REJECTED' && (
                          <span className="text-xs font-medium text-red-500 flex items-center justify-end gap-1.5">
                            <XCircle className="w-3.5 h-3.5" /> Justification Rejected
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

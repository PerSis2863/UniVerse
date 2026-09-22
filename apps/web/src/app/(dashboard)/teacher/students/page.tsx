'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Search, Filter, MoreVertical, Mail, GraduationCap, X, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';

export default function TeacherStudents() {
  const [searchTerm, setSearchTerm] = useState('');
  const [courseFilter, setCourseFilter] = useState('All');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<{type: 'profile' | 'message' | 'warning', student: any} | null>(null);
  const [modalText, setModalText] = useState('');

  const { data: students = [], isLoading } = useSWR('/courses/my-students', fetcher);

  const uniqueCourses = ['All', ...Array.from(new Set(students.map((s: any) => s.course)))];

  const filteredStudents = students.filter((s: any) => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCourse = courseFilter === 'All' || s.course === courseFilter;
    return matchesSearch && matchesCourse;
  });

  const handleAction = (type: 'profile' | 'message' | 'warning', student: any) => {
    setActionMenuOpen(null);
    setActiveModal({ type, student });
    setModalText('');
  };

  const submitModal = () => {
    if (activeModal?.type === 'message') {
      toast.success(`Message sent to ${activeModal.student.name}`);
    } else if (activeModal?.type === 'warning') {
      toast.success(`Warning issued to ${activeModal.student.name}`);
    }
    setActiveModal(null);
  };

  return (
    <>
      <Topbar title="My Students" subtitle="Manage and monitor students enrolled in your courses" />
      
      <div className="flex-1 p-8 overflow-y-auto space-y-6" onClick={() => { setActionMenuOpen(null); setShowFilterDropdown(false); }}>
        
        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="relative w-full sm:w-96" onClick={e => e.stopPropagation()}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 dark:text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search students..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <div className="relative" onClick={e => e.stopPropagation()}>
              <button onClick={() => setShowFilterDropdown(!showFilterDropdown)} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-100 dark:bg-zinc-800 transition-colors whitespace-nowrap">
                <Filter className="w-4 h-4" /> {courseFilter === 'All' ? 'Filter' : 'Filtered'}
              </button>
              {showFilterDropdown && (
                <div className="absolute right-0 top-12 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 p-2">
                  <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-500 uppercase px-3 py-2">Filter by Course</div>
                  {uniqueCourses.map(course => (
                    <button
                      key={course}
                      onClick={() => { setCourseFilter(course); setShowFilterDropdown(false); }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${courseFilter === course ? 'bg-indigo-500/10 text-indigo-400' : 'text-zinc-300 hover:bg-zinc-100 dark:bg-zinc-800'}`}
                    >
                      {course}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={(e) => { e.stopPropagation(); setShowEmailModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg hover:bg-indigo-500/20 transition-colors whitespace-nowrap">
              <Mail className="w-4 h-4" /> Email All
            </button>
          </div>
        </div>

        {/* Students Table */}
        <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden min-h-[400px] flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider bg-white dark:bg-zinc-900/80">
                  <th className="p-4">Student</th>
                  <th className="p-4">Course</th>
                  <th className="p-4">Current Grade</th>
                  <th className="p-4">Attendance</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-zinc-900 dark:text-white font-medium shadow-lg">
                          {student.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-zinc-900 dark:text-white">{student.name}</div>
                          <div className="text-sm text-zinc-500 dark:text-zinc-500">{student.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-zinc-300">
                        <GraduationCap className="w-4 h-4 text-zinc-500 dark:text-zinc-500" />
                        {student.course}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        student.grade.startsWith('A') ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                        student.grade.startsWith('B') ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                        student.grade.startsWith('C') ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                        'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {student.grade}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 max-w-[80px]">
                          <div 
                            className={`h-2 rounded-full ${
                              parseInt(student.attendance) > 90 ? 'bg-green-500' :
                              parseInt(student.attendance) > 80 ? 'bg-blue-500' :
                              parseInt(student.attendance) > 70 ? 'bg-yellow-500' : 'bg-red-500'
                            }`} 
                            style={{ width: student.attendance }}
                          ></div>
                        </div>
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">{student.attendance}</span>
                      </div>
                    </td>
                    <td className="p-4 text-right relative">
                      <button onClick={(e) => { e.stopPropagation(); setActionMenuOpen(actionMenuOpen === student.id ? null : student.id); }} className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white rounded-lg hover:bg-zinc-100 dark:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 border border-zinc-700 bg-zinc-100 dark:bg-zinc-800/50">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {actionMenuOpen === student.id && (
                        <div className="absolute right-8 top-10 w-48 bg-white dark:bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 p-2 flex flex-col gap-1 text-left" onClick={e => e.stopPropagation()}>
                          <button onClick={() => handleAction('profile', student)} className="px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-100 dark:bg-zinc-800 rounded-lg text-left">View Profile</button>
                          <button onClick={() => handleAction('message', student)} className="px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-100 dark:bg-zinc-800 rounded-lg text-left">Message Student</button>
                          <button onClick={() => handleAction('warning', student)} className="px-3 py-2 text-sm text-amber-400 hover:bg-zinc-100 dark:bg-zinc-800 rounded-lg text-left">Issue Warning</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
          {!isLoading && filteredStudents.length === 0 && (
            <div className="p-12 text-center text-zinc-500 dark:text-zinc-500">
              No students found matching your search.
            </div>
          )}
        </div>
      </div>

      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full max-w-xl rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Email All Students</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Send a message to {filteredStudents.length} students.</p>
              </div>
              <button onClick={() => setShowEmailModal(false)} className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white hover:bg-zinc-100 dark:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Subject</label>
                <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Subject line..." className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Message</label>
                <textarea rows={5} value={emailBody} onChange={e => setEmailBody(e.target.value)} placeholder="Type your message here..." className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 resize-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button onClick={() => setShowEmailModal(false)} className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white transition-colors">Cancel</button>
              <button onClick={() => { toast.success('Emails sent successfully!'); setShowEmailModal(false); }} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-zinc-900 dark:text-white shadow-lg transition-all">
                Send {filteredStudents.length} Emails
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Modals */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setActiveModal(null)}>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-start">
              <div>
                 <h2 className="text-xl font-bold text-zinc-900 dark:text-white capitalize">
                   {activeModal.type === 'profile' ? 'Student Profile' : activeModal.type === 'warning' ? 'Issue Warning' : 'Message Student'}
                 </h2>
                 <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">{activeModal.student.name} • {activeModal.student.course}</p>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white hover:bg-zinc-100 dark:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {activeModal.type === 'profile' ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-zinc-900 dark:text-white text-2xl font-medium shadow-lg">
                      {activeModal.student.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-lg font-bold text-zinc-900 dark:text-white">{activeModal.student.name}</div>
                      <div className="text-sm text-zinc-600 dark:text-zinc-400">{activeModal.student.email}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="bg-zinc-100 dark:bg-zinc-800/30 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                      <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Current Grade</div>
                      <div className="text-2xl font-bold text-zinc-900 dark:text-white">{activeModal.student.grade}</div>
                    </div>
                    <div className="bg-zinc-100 dark:bg-zinc-800/30 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                      <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Attendance</div>
                      <div className="text-2xl font-bold text-zinc-900 dark:text-white">{activeModal.student.attendance}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                   <label className="text-xs font-medium text-zinc-300 block mb-1">
                     {activeModal.type === 'warning' ? 'Warning Reason' : 'Message'}
                   </label>
                   <textarea rows={4} value={modalText} onChange={e => setModalText(e.target.value)} placeholder="Type here..." className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 resize-none" />
                </div>
              )}
            </div>

            {activeModal.type !== 'profile' && (
              <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 flex justify-end gap-3">
                <button onClick={() => setActiveModal(null)} className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white transition-colors">Cancel</button>
                <button onClick={submitModal} className={`px-5 py-2 rounded-xl text-sm font-bold text-zinc-900 dark:text-white shadow-lg transition-all ${activeModal.type === 'warning' ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}>
                  {activeModal.type === 'warning' ? 'Send Warning' : 'Send Message'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

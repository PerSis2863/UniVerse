'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Users, UserCheck, UserX, Clock, Calendar, CheckCircle2, ChevronDown, Download, Save, Filter, FileText, Check, X } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { api } from '@/lib/api';

const MOCK_JUSTIFICATIONS = [
  { id: 'J1', studentName: 'Charlie Brown', studentId: 'S003', course: 'BUS-101', date: '2026-10-24', reason: 'Medical emergency (doctor note attached)', status: 'PENDING' },
  { id: 'J2', studentName: 'Fiona Gallagher', studentId: 'S006', course: 'FIN-202', date: '2026-10-23', reason: 'Family matters out of town', status: 'PENDING' },
];

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export default function AdminAttendance() {
  const { data: courses = [] } = useSWR('/courses/admin/all', fetcher);
  
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedCourse, setSelectedCourse] = useState('');
  
  useEffect(() => {
    if (courses.length > 0 && !selectedCourse) {
      setSelectedCourse(courses[0].id);
    }
  }, [courses, selectedCourse]);

  const { data: courseData, mutate: mutateCourseData } = useSWR(
    selectedCourse ? `/attendance/course/${selectedCourse}?date=${selectedDate}` : null,
    fetcher
  );

  const [activeTab, setActiveTab] = useState<'roster' | 'justifications'>('roster');
  const [localEdits, setLocalEdits] = useState<Record<string, AttendanceStatus>>({});
  const [justifications, setJustifications] = useState(MOCK_JUSTIFICATIONS);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedJustificationPhoto, setSelectedJustificationPhoto] = useState<string | null>(null);

  const currentAttendance = useMemo(() => {
    const record: Record<string, AttendanceStatus> = {};
    if (courseData?.attendance) {
      courseData.attendance.forEach((att: any) => {
        record[att.studentId] = att.status.toLowerCase() as AttendanceStatus;
      });
    }
    return { ...record, ...localEdits };
  }, [courseData, localEdits]);

  const stats = useMemo(() => {
    const total = courseData?.enrollments?.length || 0;
    let present = 0;
    let absent = 0;
    let late = 0;
    
    courseData?.enrollments?.forEach((enrollment: any) => {
      const studentId = enrollment.student.id;
      const status = currentAttendance[studentId] || 'present';
      if (status === 'present') present++;
      if (status === 'absent') absent++;
      if (status === 'late') late++;
    });
    
    return {
      total,
      present,
      absent,
      late,
      rate: total > 0 ? Math.round(((present + late) / total) * 100) : 0
    };
  }, [currentAttendance, courseData]);

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setLocalEdits(prev => ({
      ...prev,
      [studentId]: status
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const promises = Object.entries(localEdits).map(([studentId, status]) => 
        api.post(`/attendance/course/${selectedCourse}`, {
          date: selectedDate,
          studentId,
          status: status.toUpperCase(),
        })
      );
      await Promise.all(promises);
      toast.success('Attendance records saved successfully.');
      setLocalEdits({});
      mutateCourseData();
    } catch (e: any) {
      toast.error('Failed to save attendance');
    } finally {
      setIsSaving(false);
    }
  };

  const handleJustificationAction = (id: string, action: 'APPROVE' | 'REJECT') => {
    setJustifications(prev => prev.filter(j => j.id !== id));
    toast.success(`Justification ${action === 'APPROVE' ? 'approved' : 'rejected'}.`);
  };

  const hasUnsavedChanges = Object.keys(localEdits).length > 0;
  const pendingCount = justifications.length;

  return (
    <>
      <Topbar title="Attendance Management" subtitle="Track and manage student presence across all courses" />
      
      <div className="flex-1 p-8 overflow-y-auto bg-[#09090b]">
        <div className="max-w-7xl mx-auto space-y-8">
          
          {/* Tabs */}
          <div className="flex border-b border-zinc-200 dark:border-zinc-800">
            <button 
              onClick={() => setActiveTab('roster')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'roster' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-zinc-500 dark:text-zinc-500 hover:text-zinc-300'}`}
            >
              Class Roster
            </button>
            <button 
              onClick={() => setActiveTab('justifications')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'justifications' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-zinc-500 dark:text-zinc-500 hover:text-zinc-300'}`}
            >
              Pending Justifications 
              {pendingCount > 0 && <span className="bg-indigo-500 text-zinc-900 dark:text-white text-xs px-2 py-0.5 rounded-full">{pendingCount}</span>}
            </button>
          </div>

          {activeTab === 'roster' && (
            <>
              {/* Filters & Actions Header */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-zinc-900 via-zinc-900/80 to-zinc-900 border border-zinc-200 dark:border-zinc-800/50 p-5 rounded-2xl backdrop-blur-xl">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="relative">
                    <label className="text-xs text-zinc-500 dark:text-zinc-500 uppercase tracking-wider font-semibold mb-1 block">Date</label>
                    <div className="flex items-center bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden focus-within:border-indigo-500 transition-colors">
                      <div className="pl-3 text-zinc-600 dark:text-zinc-400"><Calendar className="w-4 h-4" /></div>
                      <input 
                        type="date" 
                        value={selectedDate}
                        onChange={(e) => {
                          setSelectedDate(e.target.value);
                          setLocalEdits({});
                        }}
                        className="bg-transparent border-none text-sm text-zinc-900 dark:text-white px-3 py-2 outline-none w-40 cursor-pointer"
                      />
                    </div>
                  </div>
                  
                  <div className="relative">
                    <label className="text-xs text-zinc-500 dark:text-zinc-500 uppercase tracking-wider font-semibold mb-1 block">Course</label>
                    <div className="flex items-center bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden focus-within:border-indigo-500 transition-colors">
                      <div className="pl-3 text-zinc-600 dark:text-zinc-400"><Filter className="w-4 h-4" /></div>
                      <select 
                        value={selectedCourse} 
                        onChange={(e) => setSelectedCourse(e.target.value)}
                        className="pl-10 pr-8 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm text-zinc-900 dark:text-white outline-none focus:border-indigo-500 appearance-none"
                      >
                        {courses.map(course => (
                          <option key={course.id} value={course.id}>{course.code} - {course.name}</option>
                        ))}
                      </select>
                      <div className="pr-3 text-zinc-500 dark:text-zinc-500 pointer-events-none"><ChevronDown className="w-4 h-4" /></div>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 w-full md:w-auto mt-4 md:mt-0 pt-4 md:pt-0 border-t border-zinc-200 dark:border-zinc-800/50 md:border-none">
                  <button 
                    onClick={() => toast.info('Exporting attendance report...')}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-300 hover:text-zinc-900 dark:text-white hover:bg-zinc-700 rounded-xl text-sm font-medium transition-colors border border-zinc-700/50"
                  >
                    <Download className="w-4 h-4" /> Export CSV
                  </button>
                  
                  <button 
                    onClick={handleSave}
                    disabled={!hasUnsavedChanges || isSaving}
                    className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                      hasUnsavedChanges 
                        ? 'bg-indigo-500 hover:bg-indigo-600 text-zinc-900 dark:text-white shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:shadow-[0_0_20px_rgba(99,102,241,0.5)]' 
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-500 cursor-not-allowed border border-zinc-700/50'
                    }`}
                  >
                    {isSaving ? (
                      <div className="w-4 h-4 border-2 border-zinc-300 dark:border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>

              {/* Stats Overview */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                <div className="bg-white dark:bg-zinc-900/40 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800/50 rounded-2xl p-5 flex flex-col relative overflow-hidden group">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-colors duration-500"></div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-indigo-500/10 rounded-lg"><Users className="w-4 h-4 text-indigo-400" /></div>
                    <span className="text-zinc-600 dark:text-zinc-400 text-sm font-medium">Total Students</span>
                  </div>
                  <span className="text-3xl font-bold text-zinc-900 dark:text-white mt-1">{stats.total}</span>
                </div>
                
                <div className="bg-white dark:bg-zinc-900/40 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800/50 rounded-2xl p-5 flex flex-col relative overflow-hidden group">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-colors duration-500"></div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-emerald-500/10 rounded-lg"><UserCheck className="w-4 h-4 text-emerald-400" /></div>
                    <span className="text-zinc-600 dark:text-zinc-400 text-sm font-medium">Present</span>
                  </div>
                  <span className="text-3xl font-bold text-zinc-900 dark:text-white mt-1">{stats.present}</span>
                </div>
                
                <div className="bg-white dark:bg-zinc-900/40 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800/50 rounded-2xl p-5 flex flex-col relative overflow-hidden group">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-red-500/10 rounded-full blur-2xl group-hover:bg-red-500/20 transition-colors duration-500"></div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-red-500/10 rounded-lg"><UserX className="w-4 h-4 text-red-400" /></div>
                    <span className="text-zinc-600 dark:text-zinc-400 text-sm font-medium">Absent</span>
                  </div>
                  <span className="text-3xl font-bold text-zinc-900 dark:text-white mt-1">{stats.absent}</span>
                </div>
                
                <div className="bg-white dark:bg-zinc-900/40 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800/50 rounded-2xl p-5 flex flex-col relative overflow-hidden group">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-colors duration-500"></div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-amber-500/10 rounded-lg"><Clock className="w-4 h-4 text-amber-400" /></div>
                    <span className="text-zinc-600 dark:text-zinc-400 text-sm font-medium">Attendance Rate</span>
                  </div>
                  <div className="flex items-end gap-2 mt-1">
                    <span className="text-3xl font-bold text-zinc-900 dark:text-white">{stats.rate}%</span>
                    <span className="text-sm font-medium text-emerald-400 mb-1">+2.4%</span>
                  </div>
                </div>
              </div>

              {/* Main Roster Table */}
              <div className="bg-white dark:bg-zinc-900/40 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800/50 rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-zinc-200 dark:border-zinc-800/50 flex justify-between items-center bg-white dark:bg-zinc-900/30">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Class Roster</h2>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">Mark attendance for {courses.find((c: any) => c.id === selectedCourse)?.code}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-medium">
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div> <span className="text-zinc-600 dark:text-zinc-400">Present</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500"></div> <span className="text-zinc-600 dark:text-zinc-400">Absent</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div> <span className="text-zinc-600 dark:text-zinc-400">Late</span></div>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800">
                        <th className="text-left p-4 text-sm font-medium text-zinc-500 dark:text-zinc-500">Student Name</th>
                        <th className="text-right p-4 text-sm font-medium text-zinc-500 dark:text-zinc-500">Attendance Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/50">
                      {courseData?.enrollments?.map((enrollment: any) => {
                        const student = enrollment.student;
                        const status = currentAttendance[student.id] || 'present';
                        
                        return (
                          <tr key={student.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-semibold text-sm">
                                  {student.name.charAt(0)}
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-zinc-900 dark:text-white">{student.name}</div>
                                  <div className="text-xs text-zinc-500 dark:text-zinc-500">{student.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex justify-end gap-1.5 sm:gap-2">
                                <button
                                  onClick={() => handleStatusChange(student.id, 'present')}
                                  className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                                    status === 'present' 
                                      ? 'bg-emerald-500/15 text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.15)] border border-emerald-500/20' 
                                      : 'text-zinc-500 dark:text-zinc-500 hover:text-zinc-300 hover:bg-white dark:bg-zinc-900'
                                  }`}
                                >
                                  Present
                                </button>
                                <button
                                  onClick={() => handleStatusChange(student.id, 'absent')}
                                  className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                                    status === 'absent' 
                                      ? 'bg-red-500/15 text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.15)] border border-red-500/20' 
                                      : 'text-zinc-500 dark:text-zinc-500 hover:text-zinc-300 hover:bg-white dark:bg-zinc-900'
                                  }`}
                                >
                                  Absent
                                </button>
                                <button
                                  onClick={() => handleStatusChange(student.id, 'late')}
                                  className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                                    status === 'late' 
                                      ? 'bg-amber-500/15 text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.15)] border border-amber-500/20' 
                                      : 'text-zinc-500 dark:text-zinc-500 hover:text-zinc-300 hover:bg-white dark:bg-zinc-900'
                                  }`}
                                >
                                  Late
                                </button>
                                <button
                                  onClick={() => handleStatusChange(student.id, 'excused')}
                                  className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                                    status === 'excused' 
                                      ? 'bg-blue-500/15 text-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.15)] border border-blue-500/20' 
                                      : 'text-zinc-500 dark:text-zinc-500 hover:text-zinc-300 hover:bg-white dark:bg-zinc-900'
                                  }`}
                                >
                                  Excused
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                
                {hasUnsavedChanges && (
                  <div className="bg-indigo-500/10 border-t border-indigo-500/20 p-4 px-6 flex items-center justify-between">
                    <span className="text-sm font-medium text-indigo-400">You have unsaved attendance changes.</span>
                    <button 
                      onClick={handleSave}
                      className="px-4 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-zinc-900 dark:text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
                    >
                      Save Now
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'justifications' && (
            <div className="bg-white dark:bg-zinc-900/40 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800/50 rounded-2xl overflow-hidden shadow-2xl p-6">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-6">Pending Student Justifications</h2>
              
              {justifications.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                  <h3 className="text-zinc-900 dark:text-white font-medium">All caught up!</h3>
                  <p className="text-zinc-600 dark:text-zinc-400 text-sm">There are no pending absent justifications to review.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {justifications.map((justification) => (
                    <div key={justification.id} className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-zinc-900 dark:text-white">{justification.studentName}</span>
                          <span className="text-xs text-zinc-500 dark:text-zinc-500 font-mono">{justification.studentId}</span>
                          <span className="text-xs px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-300 rounded-md">{justification.course}</span>
                          <span className="text-xs px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-300 rounded-md">{justification.date}</span>
                        </div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">"{justification.reason}"</p>
                        <button 
                          onClick={() => setSelectedJustificationPhoto(justification.id)}
                          className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" /> View Attached Photo/Document
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-3 shrink-0">
                        <button 
                          onClick={() => handleJustificationAction(justification.id, 'REJECT')}
                          className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-sm font-medium transition-colors border border-red-500/20"
                        >
                          <X className="w-4 h-4" /> Reject
                        </button>
                        <button 
                          onClick={() => handleJustificationAction(justification.id, 'APPROVE')}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-lg text-sm font-medium transition-colors border border-emerald-500/20"
                        >
                          <Check className="w-4 h-4" /> Approve
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Document Viewer Modal */}
      {selectedJustificationPhoto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Attached Document</h3>
              <button 
                onClick={() => setSelectedJustificationPhoto(null)}
                className="text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 flex flex-col items-center justify-center bg-white dark:bg-zinc-900/50 min-h-[400px]">
              {/* Dummy Image placeholder */}
              <div className="w-full h-64 bg-zinc-100 dark:bg-zinc-800 rounded-lg border border-zinc-700 flex items-center justify-center flex-col text-zinc-500 dark:text-zinc-500">
                <FileText className="w-12 h-12 mb-3 opacity-50" />
                <p>Medical_Certificate.pdf</p>
                <span className="text-xs mt-2 text-zinc-600">Document viewer simulated</span>
              </div>
            </div>
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 flex justify-end">
              <button 
                onClick={() => setSelectedJustificationPhoto(null)}
                className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-700 text-zinc-900 dark:text-white text-sm font-medium rounded-lg transition-colors"
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

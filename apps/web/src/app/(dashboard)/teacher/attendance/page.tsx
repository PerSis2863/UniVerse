'use client';
import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { CheckCircle2, XCircle, Clock, Users, Calendar } from 'lucide-react';
import { toast } from 'sonner';

import useSWR from 'swr';
import { api } from '@/lib/api';

export default function TeacherAttendance() {
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const { data: coursesData } = useSWR('/courses/my', async (url) => {
    const res = await api.get(url);
    return res.data;
  });

  const courses = coursesData || [];

  // Default to first course if none selected
  if (courses.length > 0 && !selectedCourse) {
    setSelectedCourse(courses[0].id);
  }

  const { data: attendanceData, mutate } = useSWR(
    selectedCourse ? `/attendance/course/${selectedCourse}?date=${currentDate}` : null,
    async (url) => {
      const res = await api.get(url);
      return res.data;
    }
  );

  const currentStudents = attendanceData?.enrollments?.map((e: any) => e.student) || [];
  
  // Transform attendance array into a map for easy lookup
  const currentCourseAttendance = (attendanceData?.attendance || []).reduce((acc: any, curr: any) => {
    acc[curr.studentId] = curr.status;
    return acc;
  }, {});

  const handleMarkAttendance = async (studentId: string, status: string) => {
    try {
      await api.post(`/attendance/course/${selectedCourse}`, {
        date: currentDate,
        studentId,
        status
      });
      mutate();
      toast.success('Attendance updated');
    } catch (e) {
      toast.error('Failed to update attendance');
    }
  };

  const presentCount = Object.values(currentCourseAttendance).filter((s: any) => s === 'PRESENT').length;
  const lateCount = Object.values(currentCourseAttendance).filter((s: any) => s === 'LATE').length;
  const absentCount = Object.values(currentCourseAttendance).filter((s: any) => s === 'ABSENT').length;
  const totalStudents = currentStudents.length;

  return (
    <>
      <Topbar title="Attendance Management" subtitle="Take attendance for your classes today" />
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-8">
          
          {/* Course Selector & Stats */}
          <div className="flex flex-col md:flex-row gap-6">
            <div className="card flex-1">
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">Select Course</label>
              <select 
                className="w-full bg-white/[0.05] border border-zinc-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
              >
                {courses.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                ))}
              </select>
              
              <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between text-sm text-zinc-600 dark:text-zinc-400 gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4"/> 
                  <input type="date" value={currentDate} onChange={(e) => setCurrentDate(e.target.value)} className="bg-transparent border-none outline-none text-zinc-900 dark:text-white cursor-pointer" />
                </div>
                <div className="flex items-center gap-2"><Users className="w-4 h-4"/> {totalStudents} Students</div>
              </div>
            </div>
            
            <div className="card flex-1 flex items-center justify-around text-center">
              <div>
                <div className="text-3xl font-bold text-emerald-400 mb-1">{presentCount}</div>
                <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Present</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-amber-400 mb-1">{lateCount}</div>
                <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Late</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-red-400 mb-1">{absentCount}</div>
                <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Absent</div>
              </div>
            </div>
          </div>

          {/* Roster */}
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="border-b border-white/[0.05] bg-white/[0.02]">
                  <th className="p-4 text-xs font-semibold tracking-wider text-zinc-600 dark:text-zinc-400 uppercase">Student Name</th>
                  <th className="p-4 text-xs font-semibold tracking-wider text-zinc-600 dark:text-zinc-400 uppercase">Email</th>
                  <th className="p-4 text-xs font-semibold tracking-wider text-zinc-600 dark:text-zinc-400 uppercase text-right">Mark Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {currentStudents.map((student: any) => {
                  
                  return (
                    <tr key={student.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="p-4 text-zinc-900 dark:text-white text-sm font-medium">
                        {student.name}
                      </td>
                      <td className="p-4 text-zinc-600 dark:text-zinc-400 text-sm">
                        {student.email}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleMarkAttendance(student.id, 'PRESENT')}
                            className={`p-2 rounded-md border transition-all ${
                              status === 'PRESENT' 
                                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
                                : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:border-emerald-500/50 hover:text-emerald-400 hover:bg-emerald-500/10'
                            }`}
                            title="Mark Present"
                          >
                            <CheckCircle2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleMarkAttendance(student.id, 'LATE')}
                            className={`p-2 rounded-md border transition-all ${
                              status === 'LATE' 
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' 
                                : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:border-amber-500/50 hover:text-amber-400 hover:bg-amber-500/10'
                            }`}
                            title="Mark Late"
                          >
                            <Clock className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleMarkAttendance(student.id, 'ABSENT')}
                            className={`p-2 rounded-md border transition-all ${
                              status === 'ABSENT' 
                                ? 'bg-red-500/20 border-red-500/50 text-red-400' 
                                : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:border-red-500/50 hover:text-red-400 hover:bg-red-500/10'
                            }`}
                            title="Mark Absent"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {currentStudents.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-zinc-600 dark:text-zinc-400">
                      No students enrolled in this course yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

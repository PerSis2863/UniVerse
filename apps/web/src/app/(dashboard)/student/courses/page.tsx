'use client';
import { useState, useEffect } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { api } from '@/lib/api';
import { BookOpen, Users, FileText, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export default function StudentCourses() {
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/courses/my')
      .then(res => setEnrollments(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Topbar title="My Courses" subtitle="Manage and access your enrolled courses" />
      <div className="flex-1 p-8 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          </div>
        ) : enrollments.length === 0 ? (
          <div className="card text-center py-12">
            <BookOpen className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">No courses yet</h2>
            <p className="text-zinc-400">You haven't been enrolled in any courses.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {enrollments.map((enr) => {
              const course = enr.course;
              return (
                <Link href={`/student/courses/${course.id}`} key={course.id}>
                  <div className="card p-0 overflow-hidden group cursor-pointer border border-white/[0.05] hover:border-indigo-500/50 transition-all flex flex-col h-full">
                    <div className="h-32 p-6 flex flex-col justify-end relative" style={{ backgroundColor: course.color || '#6366f1' }}>
                      <div className="absolute top-4 right-4 text-4xl opacity-50 group-hover:opacity-100 transition-opacity group-hover:scale-110 duration-300">
                        {course.emoji || '📚'}
                      </div>
                      <div className="bg-black/40 backdrop-blur-sm inline-block px-3 py-1 rounded-full text-xs font-medium text-white w-max mb-2">
                        {course.code}
                      </div>
                      <h2 className="text-xl font-bold text-white drop-shadow-md truncate">{course.name}</h2>
                    </div>
                    <div className="p-5 flex-1 flex flex-col">
                      <p className="text-sm text-zinc-400 line-clamp-2 mb-4 flex-1">
                        {course.description || 'No description provided.'}
                      </p>
                      
                      <div className="flex items-center justify-between mt-auto">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                            {course.teacher?.avatar ? (
                              <img src={course.teacher.avatar} alt="Teacher" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs font-medium text-white">{course.teacher?.name?.charAt(0)}</span>
                            )}
                          </div>
                          <div className="text-xs">
                            <p className="text-white font-medium">{course.teacher?.name}</p>
                            <p className="text-zinc-500">Instructor</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="px-5 py-3 border-t border-white/[0.05] bg-white/[0.02] flex items-center justify-between">
                      <div className="flex items-center gap-4 text-xs text-zinc-400">
                        <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5"/> {course._count?.materials || 0} Materials</span>
                        <span className="flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5"/> {course._count?.quizzes || 0} Quizzes</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-indigo-400 transition-colors" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

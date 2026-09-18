'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Topbar } from '@/components/layout/Topbar';
import { ArrowLeft, BookOpen, FileText, Loader2, Users } from 'lucide-react';

export default function CourseDetail() {
  const params = useParams();
  const router = useRouter();
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;
    
    api.get(`/courses/${params.id}`)
      .then(res => {
        setCourse(res.data);
      })
      .catch(err => {
        console.error(err);
        router.push('/student/courses');
      })
      .finally(() => setLoading(false));
  }, [params.id, router]);

  if (loading) {
    return (
      <>
        <Topbar title="Loading Course..." />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      </>
    );
  }

  if (!course) return null;

  return (
    <>
      <Topbar 
        title={course.name} 
        subtitle={course.code} 
        leftNode={
          <button onClick={() => router.push('/student/courses')} className="mr-4 p-2 hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-zinc-400" />
          </button>
        }
      />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-8">
          
          <div className="rounded-2xl overflow-hidden relative" style={{ backgroundColor: course.color || '#6366f1' }}>
            <div className="absolute top-8 right-8 text-8xl opacity-30 pointer-events-none">
              {course.emoji || '📚'}
            </div>
            <div className="p-10 relative z-10 bg-gradient-to-t from-black/60 to-transparent">
              <div className="bg-white/20 backdrop-blur-md inline-block px-4 py-1.5 rounded-full text-sm font-semibold text-white mb-4">
                {course.code}
              </div>
              <h1 className="text-4xl font-bold text-white mb-4">{course.name}</h1>
              <p className="text-zinc-200 max-w-2xl text-lg">{course.description || 'Welcome to this course. Access materials, quizzes, and track your progress here.'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-400" /> Recent Materials
                </h3>
                <div className="text-center py-10 bg-zinc-800/30 rounded-lg border border-dashed border-zinc-700">
                  <p className="text-zinc-500">No materials have been uploaded yet.</p>
                </div>
              </div>

              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-indigo-400" /> Upcoming Quizzes
                </h3>
                <div className="text-center py-10 bg-zinc-800/30 rounded-lg border border-dashed border-zinc-700">
                  <p className="text-zinc-500">No upcoming quizzes scheduled.</p>
                </div>
              </div>

            </div>
            
            <div className="space-y-6">
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                <h3 className="font-semibold text-white mb-4">Instructor</h3>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center overflow-hidden">
                    {course.teacher?.avatar ? (
                      <img src={course.teacher.avatar} alt="Teacher" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-lg font-bold text-indigo-400">{course.teacher?.name?.charAt(0)}</span>
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-white">{course.teacher?.name}</div>
                    <div className="text-sm text-zinc-400">Course Instructor</div>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                <h3 className="font-semibold text-white mb-4">Course Info</h3>
                <div className="space-y-4">
                  <div>
                    <div className="text-sm text-zinc-500 mb-1">Status</div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 text-xs font-medium">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      Active
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-zinc-500 mb-1">Credits</div>
                    <div className="text-zinc-300">3 Credits</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

'use client';
import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { toast } from 'sonner';
import { BookOpen, Clock, PlayCircle, MoreHorizontal, GraduationCap } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const courses = [
  { id: 1, title: 'Strategic Management', professor: 'Dr. Michael Porter', progress: 65, nextClass: 'Today, 2:00 PM', color: 'from-blue-500 to-indigo-500', bg: 'bg-blue-500/10', text: 'text-blue-500' },
  { id: 2, title: 'Corporate Finance', professor: 'Prof. Aswath Damodaran', progress: 42, nextClass: 'Tomorrow, 10:00 AM', color: 'from-fuchsia-500 to-pink-500', bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-500' },
  { id: 3, title: 'Marketing Analytics', professor: 'Dr. Philip Kotler', progress: 88, nextClass: 'Wed, 1:00 PM', color: 'from-emerald-500 to-teal-500', bg: 'bg-emerald-500/10', text: 'text-emerald-500' },
  { id: 4, title: 'Organizational Behavior', professor: 'Prof. Adam Grant', progress: 15, nextClass: 'Thu, 9:00 AM', color: 'from-amber-500 to-orange-500', bg: 'bg-amber-500/10', text: 'text-amber-500' },
];

const pastCourses = [
  { id: 5, title: 'Introduction to Microeconomics', professor: 'Dr. Paul Krugman', grade: 'A', completed: 'Spring 2025', color: 'from-purple-500 to-violet-500', bg: 'bg-purple-500/10', text: 'text-purple-500' },
  { id: 6, title: 'Financial Accounting', professor: 'Prof. Mary Barth', grade: 'A-', completed: 'Fall 2024', color: 'from-cyan-500 to-blue-500', bg: 'bg-cyan-500/10', text: 'text-cyan-500' },
  { id: 7, title: 'Business Ethics', professor: 'Dr. R. Edward Freeman', grade: 'B+', completed: 'Fall 2024', color: 'from-rose-500 to-red-500', bg: 'bg-rose-500/10', text: 'text-rose-500' },
];

export default function CoursesPage() {
  const [activeTab, setActiveTab] = useState<'current' | 'past'>('current');

  return (
    <>
      <Topbar title="My Courses" subtitle="Manage your current semester classes and materials." />
      <div className="flex-1 p-8 space-y-8 overflow-y-auto">
        
        {/* Continue Learning Banner */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-indigo-500/5 dark:bg-indigo-500/10 p-8 flex flex-col md:flex-row items-center gap-8"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
          
          <div className="flex-1 space-y-4 relative z-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-bold border border-indigo-500/20">
              <PlayCircle className="w-3.5 h-3.5" /> Continue Learning
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-white">
              Strategic Management
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              Module 4: Competitive Advantage. You're almost done with this section!
            </p>
            <div className="pt-2">
              <button 
                onClick={() => toast.success('Resuming Module 4: Competitive Advantage')}
                className="btn-primary"
              >
                Resume Module
              </button>
            </div>
          </div>
          
          <div className="w-full md:w-1/3 bg-white dark:bg-zinc-900/50 rounded-2xl p-6 border border-zinc-200 dark:border-white/[0.06] shadow-xl relative z-10">
            <div className="flex justify-between items-end mb-2">
              <span className="font-semibold text-zinc-900 dark:text-white text-lg">65%</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Course Progress</span>
            </div>
            <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: '65%' }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full"
              />
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex items-center gap-4 border-b border-zinc-200 dark:border-white/[0.06] pb-px">
          <button 
            onClick={() => setActiveTab('current')}
            className={cn(
              "px-4 py-2 border-b-2 font-semibold text-sm transition-colors",
              activeTab === 'current' 
                ? "border-indigo-500 text-indigo-600 dark:text-indigo-400" 
                : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            )}
          >
            Current Semester
          </button>
          <button 
            onClick={() => setActiveTab('past')}
            className={cn(
              "px-4 py-2 border-b-2 font-semibold text-sm transition-colors",
              activeTab === 'past' 
                ? "border-indigo-500 text-indigo-600 dark:text-indigo-400" 
                : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            )}
          >
            Past Courses
          </button>
        </div>

        {/* Course Grid */}
        {activeTab === 'current' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {courses.map((course, i) => (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 }}
                key={course.id}
                className="card-hover group cursor-pointer"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", course.bg, course.text)}>
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <button className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-400 transition-colors">
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                </div>
                
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-1 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors">
                  {course.title}
                </h3>
                <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 mb-6">
                  <GraduationCap className="w-4 h-4" /> {course.professor}
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">Progress</span>
                      <span className="font-semibold text-zinc-900 dark:text-white">{course.progress}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${course.progress}%` }}
                        transition={{ duration: 1, delay: i * 0.1 }}
                        className={cn("h-full rounded-full bg-gradient-to-r", course.color)}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-zinc-100 dark:border-white/[0.06]">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      <Clock className="w-3.5 h-3.5" /> Next: {course.nextClass}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {pastCourses.map((course, i) => (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 }}
                key={course.id}
                className="card-hover group cursor-pointer"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", course.bg, course.text)}>
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <button className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-400 transition-colors">
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                </div>
                
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-1 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors">
                  {course.title}
                </h3>
                <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 mb-6">
                  <GraduationCap className="w-4 h-4" /> {course.professor}
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between pt-4 border-t border-zinc-100 dark:border-white/[0.06]">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      <Clock className="w-3.5 h-3.5" /> Completed: {course.completed}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm font-bold text-zinc-900 dark:text-white">
                      Grade: <span className={course.text}>{course.grade}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

      </div>
    </>
  );
}

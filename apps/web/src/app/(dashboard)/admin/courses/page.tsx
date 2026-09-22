'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Plus, Edit2, Trash2, X, BookOpen, Users, FileText, LayoutGrid } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import api from '@/lib/api';

export default function AdminCoursesPage() {
  const { data: courses = [], mutate: mutateCourses } = useSWR('/courses/admin/all', fetcher);
  const { data: teachers = [] } = useSWR('/users?role=TEACHER', fetcher);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '', code: '', teacherId: '', emoji: '📚', color: '#6366f1', description: ''
  });

  const handleOpenModal = (id: string | null = null) => {
    if (id) {
      const item = courses.find((c: any) => c.id === id);
      if (item) setFormData({ name: item.name, code: item.code, teacherId: item.teacherId, emoji: item.emoji || '📚', color: item.color || '#6366f1', description: item.description || '' });
      setEditingId(id);
    } else {
      setFormData({ name: '', code: '', teacherId: '', emoji: '📚', color: '#6366f1', description: '' });
      setEditingId(null);
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.patch(`/courses/${editingId}`, formData);
        toast.success('Course updated successfully');
      } else {
        await api.post('/courses', formData);
        toast.success('New course created');
      }
      setIsModalOpen(false);
      mutateCourses();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'An error occurred');
    }
  };
  
  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this course?")) {
      try {
        await api.delete(`/courses/${id}`);
        toast.success('Course deleted');
        mutateCourses();
      } catch (error: any) {
        toast.error('Failed to delete course');
      }
    }
  };

  return (
    <>
      <Topbar 
        title="Courses Management" 
        subtitle="Create, edit, and manage university courses"
        rightNode={
          <button 
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-zinc-900 dark:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Create Course
          </button>
        }
      />
      
      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">{editingId ? 'Edit Course' : 'Create New Course'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white p-2 rounded-lg hover:bg-zinc-100 dark:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Course Name</label>
                  <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} type="text" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. Intro to Psychology" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Course Code</label>
                  <input required value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} type="text" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. PSY101" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Primary Instructor</label>
                  <select required value={formData.teacherId} onChange={e => setFormData({...formData, teacherId: e.target.value})} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors">
                    <option value="" disabled>Select an instructor</option>
                    {teachers.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Emoji icon</label>
                    <input required value={formData.emoji} onChange={e => setFormData({...formData, emoji: e.target.value})} type="text" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors" placeholder="🧠" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Cover Color</label>
                    <input required value={formData.color} onChange={e => setFormData({...formData, color: e.target.value})} type="color" className="w-full h-10 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-1 py-1 cursor-pointer outline-none focus:border-indigo-500 transition-colors" />
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Description</label>
                  <textarea required value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={3} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors resize-none" placeholder="Brief overview of the course syllabus..." />
                </div>
              </div>
              
              <div className="pt-4 flex justify-end gap-3 border-t border-zinc-200 dark:border-zinc-800 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-zinc-900 dark:text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors shadow-lg shadow-indigo-500/20">
                  Save Course
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex-1 p-8 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
        <div className="max-w-7xl mx-auto space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course: any) => (
              <div key={course.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden flex flex-col group">
                <div className="h-24 p-6 relative flex items-center justify-between" style={{ backgroundColor: course.color || '#6366f1' }}>
                  <div className="bg-black/40 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium text-white">
                    {course.code}
                  </div>
                  <div className="text-4xl">{course.emoji || '📚'}</div>
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">{course.name}</h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 mb-4 flex-1">
                    {course.description}
                  </p>
                  
                  <div className="flex items-center gap-2 mb-4">
                    <Users className="w-4 h-4 text-zinc-500 dark:text-zinc-500" />
                    <span className="text-sm text-zinc-600 dark:text-zinc-300">{course.teacher?.name || 'Unassigned'}</span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-zinc-600 dark:text-zinc-400 p-3 bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 mb-4">
                    <div className="flex flex-col gap-1 items-center flex-1 border-r border-zinc-200 dark:border-zinc-800">
                      <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5"/> Materials</span>
                      <span className="text-zinc-900 dark:text-white font-medium text-sm">{course._count?.materials || 0}</span>
                    </div>
                    <div className="flex flex-col gap-1 items-center flex-1">
                      <span className="flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5"/> Quizzes</span>
                      <span className="text-zinc-900 dark:text-white font-medium text-sm">{course._count?.quizzes || 0}</span>
                    </div>
                  </div>
                </div>
                
                <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 flex justify-end gap-2">
                  <button 
                    onClick={() => handleOpenModal(course.id)}
                    className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors inline-flex items-center justify-center"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(course.id)}
                    className="p-2 text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors inline-flex items-center justify-center"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </>
  );
}

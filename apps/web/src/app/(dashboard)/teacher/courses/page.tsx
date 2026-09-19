'use client';
import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { BookOpen, Users, FileText, ChevronRight, Edit, Trash2, Plus, X, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

const INITIAL_COURSES = [
  { id: '1', code: 'CS101', name: 'Introduction to Computer Science', description: 'A fundamental course on programming and computer science.', emoji: '💻', color: '#6366f1', _count: { enrollments: 45, materials: 12 } },
  { id: '2', code: 'CS201', name: 'Data Structures and Algorithms', description: 'Advanced programming concepts focusing on data structures.', emoji: '🧠', color: '#10b981', _count: { enrollments: 38, materials: 8 } },
  { id: '3', code: 'BUS101', name: 'Introduction to Business', description: 'Core principles of modern business management.', emoji: '💼', color: '#f59e0b', _count: { enrollments: 120, materials: 15 } },
  { id: '4', code: 'FIN201', name: 'Corporate Finance', description: 'Financial analysis and decision making.', emoji: '📈', color: '#3b82f6', _count: { enrollments: 85, materials: 22 } },
  { id: '5', code: 'MKT301', name: 'Digital Marketing Strategy', description: 'Marketing in the digital age.', emoji: '🎯', color: '#ec4899', _count: { enrollments: 64, materials: 18 } },
  { id: '6', code: 'PHY101', name: 'General Physics', description: 'Mechanics, heat, and sound.', emoji: '⚛️', color: '#8b5cf6', _count: { enrollments: 60, materials: 15 } }
];

export default function TeacherCourses() {
  const router = useRouter();
  const [courses, setCourses] = useState(INITIAL_COURSES);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<any>(null);
  const [showDetailsModal, setShowDetailsModal] = useState<any>(null);
  
  const [formData, setFormData] = useState({ code: '', name: '', description: '', emoji: '📚', color: '#6366f1' });

  const handleCreate = () => {
    if (!formData.name || !formData.code) {
      toast.error('Code and Name are required.');
      return;
    }
    setCourses([...courses, { id: Date.now().toString(), ...formData, _count: { enrollments: 0, materials: 0 } }]);
    setShowCreateModal(false);
    setFormData({ code: '', name: '', description: '', emoji: '📚', color: '#6366f1' });
    toast.success('Course created successfully!');
  };

  const handleEdit = () => {
    setCourses(courses.map(c => c.id === showEditModal.id ? { ...c, ...formData } : c));
    setShowEditModal(null);
    toast.success('Course updated successfully!');
  };

  const openEdit = (course: any) => {
    setFormData({ code: course.code, name: course.name, description: course.description, emoji: course.emoji, color: course.color });
    setShowEditModal(course);
  };

  const handleDelete = (id: string) => {
    setCourses(courses.filter(c => c.id !== id));
    toast.success('Course deleted.');
  };

  return (
    <>
      <Topbar title="My Courses" subtitle="Manage your created courses" />
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="flex justify-end mb-6">
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-zinc-900 dark:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20"
          >
            <Plus className="w-4 h-4" /> Create Course
          </button>
        </div>

        {courses.length === 0 ? (
          <div className="card text-center py-12">
            <BookOpen className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">No courses yet</h2>
            <p className="text-zinc-600 dark:text-zinc-400">You haven't created any courses.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <div key={course.id} className="card p-0 overflow-hidden group border border-white/[0.05] hover:border-indigo-500/50 transition-all flex flex-col h-full relative cursor-pointer" onClick={() => setShowDetailsModal(course)}>
                
                {/* Actions Overlay */}
                <div className="absolute top-4 right-4 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(course)} className="p-2 bg-black/60 hover:bg-black text-zinc-300 hover:text-zinc-900 dark:text-white rounded-md backdrop-blur-md transition-colors">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(course.id)} className="p-2 bg-black/60 hover:bg-red-500/80 text-zinc-300 hover:text-zinc-900 dark:text-white rounded-md backdrop-blur-md transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-col h-full">
                  <div className="h-32 p-6 flex flex-col justify-end relative" style={{ backgroundColor: course.color || '#6366f1' }}>
                    <div className="absolute top-4 left-4 text-4xl opacity-50 group-hover:opacity-100 transition-opacity group-hover:scale-110 duration-300">
                      {course.emoji || '📚'}
                    </div>
                    <div className="bg-black/40 backdrop-blur-sm inline-block px-3 py-1 rounded-full text-xs font-medium text-zinc-900 dark:text-white w-max mb-2">
                      {course.code}
                    </div>
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white drop-shadow-md truncate">{course.name}</h2>
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 mb-4 flex-1">
                      {course.description || 'No description provided.'}
                    </p>
                    
                    <div className="flex items-center justify-between mt-auto">
                      <div className="flex items-center gap-2">
                         <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400">
                          Active
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="px-5 py-3 border-t border-white/[0.05] bg-white/[0.02] flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs text-zinc-600 dark:text-zinc-400">
                      <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5"/> {course._count?.enrollments || 0} Students</span>
                      <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5"/> {course._count?.materials || 0} Materials</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-indigo-400 transition-colors" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Course Details Modal */}
      {showDetailsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowDetailsModal(null)}>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="h-32 p-6 flex flex-col justify-end relative" style={{ backgroundColor: showDetailsModal.color || '#6366f1' }}>
               <button onClick={() => setShowDetailsModal(null)} className="absolute top-4 right-4 p-1.5 bg-black/40 hover:bg-black/60 rounded-lg text-zinc-900 dark:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
              <div className="absolute top-4 left-4 text-4xl opacity-50">
                {showDetailsModal.emoji || '📚'}
              </div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white drop-shadow-md z-10">{showDetailsModal.name}</h2>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-8 flex-1">
              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Description</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{showDetailsModal.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                   <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-indigo-400" /> Enrolled Students</h3>
                   <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-3 bg-zinc-100 dark:bg-zinc-800/30 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800/50">
                           <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">
                             ST
                           </div>
                           <div>
                             <div className="text-sm font-medium text-zinc-900 dark:text-white">Student {i}</div>
                             <div className="text-xs text-zinc-500 dark:text-zinc-500">student{i}@universe.edu</div>
                           </div>
                        </div>
                      ))}
                      <button 
                        onClick={() => {
                          setShowDetailsModal(null);
                          router.push('/teacher/students');
                          toast.success('Navigated to student management');
                        }}
                        className="w-full py-2 text-xs font-medium text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-lg transition-colors cursor-pointer"
                      >
                        View All {showDetailsModal._count?.enrollments} Students
                      </button>
                   </div>
                </div>
                <div>
                   <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-emerald-400" /> Recent Materials</h3>
                   <div className="space-y-3">
                      {['Syllabus.pdf', 'Lecture1_Slides.pdf', 'Assignment1.docx'].map((file, i) => (
                        <div key={i} className="flex items-center gap-3 bg-zinc-100 dark:bg-zinc-800/30 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800/50">
                           <FileText className="w-4 h-4 text-emerald-500" />
                           <div className="text-sm text-zinc-300 truncate">{file}</div>
                        </div>
                      ))}
                      <button 
                        onClick={() => {
                          setShowDetailsModal(null);
                          router.push('/teacher/knowledge');
                          toast.success('Navigated to knowledge hub');
                        }}
                        className="w-full py-2 text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-colors cursor-pointer"
                      >
                        Manage Materials
                      </button>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full max-w-lg rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{showEditModal ? 'Edit Course' : 'Create New Course'}</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Fill in the details for this course.</p>
              </div>
              <button onClick={() => { setShowCreateModal(false); setShowEditModal(null); }} className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white hover:bg-zinc-100 dark:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs font-medium text-zinc-300 block mb-1">Course Code *</label>
                  <input type="text" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} placeholder="e.g. CS101" className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1">Emoji</label>
                  <input type="text" value={formData.emoji} onChange={e => setFormData({...formData, emoji: e.target.value})} className="w-20 px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 text-center" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Course Name *</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Introduction to Computer Science" className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Description</label>
                <textarea rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="What is this course about?" className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Theme Color</label>
                <input type="color" value={formData.color} onChange={e => setFormData({...formData, color: e.target.value})} className="w-full h-10 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none" />
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button onClick={() => { setShowCreateModal(false); setShowEditModal(null); }} className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white transition-colors">Cancel</button>
              <button onClick={showEditModal ? handleEdit : handleCreate} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-zinc-900 dark:text-white shadow-lg flex items-center gap-2 transition-all">
                <Upload className="w-4 h-4" /> {showEditModal ? 'Save Changes' : 'Create Course'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

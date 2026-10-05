'use client';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { confirmDialog } from '@/components/ui/Dialogs';
import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Plus, Search, FileText, CheckCircle2, PlayCircle, MoreVertical, Clock, Filter, Check, Trash2, Edit, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { fetcher, api } from '@/lib/fetcher';
import { QuizManager } from '@/components/quizzes/QuizManager';
import { OfflineQuizReview } from '@/components/quizzes/OfflineQuizReview';

export default function TeacherQuizzes() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const { data: quizzes = [], isLoading: loadingQuizzes, mutate: mutateQuizzes } = useSWR('/quizzes/teacher/my-quizzes', fetcher);
  const { data: courses = [], isLoading: loadingCourses } = useSWR('/courses/my', fetcher);
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newQuiz, setNewQuiz] = useState({ title: '', courseId: '', timeLimit: 30 });
  const [managing, setManaging] = useState<string | null>(null);

  const filteredQuizzes = quizzes.filter((q: any) => {
    const matchesSearch = q.title.toLowerCase().includes(searchTerm.toLowerCase()) || q.course.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || q.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateQuiz = async () => {
    if (!newQuiz.title || !newQuiz.courseId) {
      toast.error('Title and Course are required');
      return;
    }
    try {
      const { data: created } = await api.post('/quizzes', newQuiz);
      await mutateQuizzes();
      setShowCreateModal(false);
      setNewQuiz({ title: '', courseId: '', timeLimit: 30 });
      toast.success('Draft created — now add your questions');
      if (created?.id) setManaging(created.id);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to create quiz');
    }
  };

  const handleDeleteQuiz = async (id: string) => {
    if (!(await confirmDialog({ title: 'Delete this quiz?', message: 'Its questions and student submissions will be removed too.', destructive: true }))) return;
    try {
      await api.delete(`/quizzes/${id}`);
      await mutateQuizzes();
      toast.success('Quiz deleted.');
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to delete quiz');
    }
  };

  const getStatusStyle = (status: string) => {
    switch(status) {
      case 'PUBLISHED': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'DRAFT': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'CLOSED': return 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20';
      default: return 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20';
    }
  };

  return (
    <>
      <Topbar title="Quizzes & Assessments" subtitle="Manage course evaluations" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto space-y-6">
        <OfflineQuizReview />

        {/* Actions */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div className="flex gap-4 items-center w-full md:w-auto">
            <div className="relative flex-1 md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 dark:text-zinc-400" />
              <input 
                type="text" 
                placeholder="Search quizzes..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:text-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 hidden sm:block"
            >
              <option value="All">All Status</option>
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Drafts</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="btn-primary w-full md:w-auto"
          >
            <Plus className="w-4 h-4" /> Create New Quiz
          </button>
        </div>

        {/* Quizzes List */}
        {loadingQuizzes ? (
          <div className="flex-1 flex items-center justify-center min-h-[400px]">
            <ContentSkeleton variant="grid" />
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredQuizzes.map((quiz: any) => (
            <div key={quiz.id} className="card p-0 flex flex-col group hover:border-indigo-500/50 transition-colors">
              <div className="p-6 pb-4">
                <div className="flex justify-between items-start mb-4">
                  <span className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${getStatusStyle(quiz.status)}`}>
                    {quiz.status === 'PUBLISHED' ? 'Published' : quiz.status === 'CLOSED' ? 'Closed' : 'Draft'}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => setManaging(quiz.id)} aria-label="Edit quiz" className="p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded transition-colors bg-zinc-100 dark:bg-zinc-800/0 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDeleteQuiz(quiz.id)} className="p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-red-400 rounded transition-colors bg-zinc-100 dark:bg-zinc-800/0 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-1 leading-tight">{quiz.title}</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">{quiz.course}</p>
                
                <div className="grid grid-cols-2 gap-4 mb-2">
                  <div className="flex items-center gap-2 text-sm text-zinc-300">
                    <FileText className="w-4 h-4 text-indigo-400" /> {quiz.questions} Qs
                  </div>
                  <div className="flex items-center gap-2 text-sm text-zinc-300">
                    <Clock className="w-4 h-4 text-amber-400" /> {quiz.timeLimit}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-zinc-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {quiz.submissions} Subs
                  </div>
                  <div className="flex items-center gap-2 text-sm text-zinc-300">
                    <PlayCircle className="w-4 h-4 text-purple-400" /> Due: {quiz.dueDate}
                  </div>
                </div>
              </div>
              
              <div className="mt-auto p-4 border-t border-zinc-200 dark:border-zinc-800/50 bg-white dark:bg-zinc-900/30">
                <button 
                  onClick={() => setManaging(quiz.id)}
                  className="w-full py-2 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Manage Quiz
                </button>
              </div>
            </div>
          ))}
          {filteredQuizzes.length === 0 && (
            <div className="col-span-full p-12 text-center text-zinc-500 dark:text-zinc-500 bg-white dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800">
              {quizzes.length === 0 ? 'No quizzes yet. Create a draft, add questions, then publish it to your students.' : 'No quizzes match your search.'}
            </div>
          )}
        </div>
        )}
      </div>

      {managing && <QuizManager quizId={managing} onClose={() => setManaging(null)} onChanged={() => mutateQuizzes()} />}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="sheet-in tone-panel border border-zinc-200 dark:border-zinc-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Create New Quiz</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Set up a new assessment for your students.</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Quiz Title</label>
                <input 
                  type="text" 
                  value={newQuiz.title}
                  onChange={e => setNewQuiz({...newQuiz, title: e.target.value})}
                  className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500" 
                  placeholder="e.g. Midterm Exam" 
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Select Course</label>
                <select 
                  value={newQuiz.courseId}
                  onChange={e => setNewQuiz({...newQuiz, courseId: e.target.value})}
                  className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  disabled={loadingCourses}
                >
                  <option value="">Select a course...</option>
                  {courses.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs font-medium text-zinc-300 block mb-1">Time Limit</label>
                  <select 
                    value={newQuiz.timeLimit}
                    onChange={e => setNewQuiz({...newQuiz, timeLimit: parseInt(e.target.value)})}
                    className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value={15}>15 mins</option>
                    <option value={30}>30 mins</option>
                    <option value={45}>45 mins</option>
                    <option value={60}>60 mins</option>
                    <option value={90}>90 mins</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 flex justify-end gap-3">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">Cancel</button>
              <button onClick={handleCreateQuiz} className="btn-primary">
                <Check className="w-4 h-4" /> Create Draft
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

'use client';
import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Plus, Search, FileText, CheckCircle2, PlayCircle, MoreVertical, Clock, Filter, Check, Trash2, Edit, X } from 'lucide-react';
import { toast } from 'sonner';

const MOCK_QUIZZES = [
  { id: '1', title: 'React Basics', course: 'Introduction to Computer Science', questions: 15, timeLimit: '30 mins', status: 'Active', submissions: 24, dueDate: '2023-11-01' },
  { id: '2', title: 'Data Structures Midterm', course: 'Data Structures and Algorithms', questions: 30, timeLimit: '60 mins', status: 'Draft', submissions: 0, dueDate: '2023-11-15' },
  { id: '3', title: 'Business Ethics', course: 'Introduction to Business', questions: 10, timeLimit: '20 mins', status: 'Active', submissions: 45, dueDate: '2023-10-25' },
  { id: '4', title: 'Financial Modeling', course: 'Corporate Finance', questions: 25, timeLimit: '45 mins', status: 'Completed', submissions: 80, dueDate: '2023-10-10' },
  { id: '5', title: 'Digital Marketing Channels', course: 'Digital Marketing Strategy', questions: 15, timeLimit: '30 mins', status: 'Active', submissions: 12, dueDate: '2023-11-05' },
];

export default function TeacherQuizzes() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [quizzes, setQuizzes] = useState(MOCK_QUIZZES);
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newQuiz, setNewQuiz] = useState({ title: '', course: '', questions: 10, timeLimit: '30 mins' });

  const filteredQuizzes = quizzes.filter(q => {
    const matchesSearch = q.title.toLowerCase().includes(searchTerm.toLowerCase()) || q.course.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || q.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateQuiz = () => {
    if (!newQuiz.title || !newQuiz.course) {
      toast.error('Title and Course are required');
      return;
    }
    setQuizzes([{
      id: Date.now().toString(),
      ...newQuiz,
      status: 'Draft',
      submissions: 0,
      dueDate: 'No date set'
    }, ...quizzes]);
    setShowCreateModal(false);
    setNewQuiz({ title: '', course: '', questions: 10, timeLimit: '30 mins' });
    toast.success('Quiz created as draft!');
  };

  const getStatusStyle = (status: string) => {
    switch(status) {
      case 'Active': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'Draft': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'Completed': return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
      default: return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
    }
  };

  return (
    <>
      <Topbar title="Quizzes & Assessments" subtitle="Manage course evaluations" />
      <div className="flex-1 p-8 overflow-y-auto space-y-6">
        
        {/* Actions */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div className="flex gap-4 items-center w-full md:w-auto">
            <div className="relative flex-1 md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input 
                type="text" 
                placeholder="Search quizzes..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 hidden sm:block"
            >
              <option value="All">All Status</option>
              <option value="Active">Active</option>
              <option value="Draft">Drafts</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center w-full md:w-auto gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Create New Quiz
          </button>
        </div>

        {/* Quizzes List */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredQuizzes.map((quiz) => (
            <div key={quiz.id} className="card p-0 flex flex-col group hover:border-indigo-500/50 transition-colors">
              <div className="p-6 pb-4">
                <div className="flex justify-between items-start mb-4">
                  <span className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${getStatusStyle(quiz.status)}`}>
                    {quiz.status}
                  </span>
                  <div className="flex gap-1">
                    <button className="p-1.5 text-zinc-400 hover:text-white rounded transition-colors bg-zinc-800/0 hover:bg-zinc-800">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => setQuizzes(quizzes.filter(q => q.id !== quiz.id))} className="p-1.5 text-zinc-400 hover:text-red-400 rounded transition-colors bg-zinc-800/0 hover:bg-zinc-800">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <h3 className="text-xl font-bold text-white mb-1 leading-tight">{quiz.title}</h3>
                <p className="text-sm text-zinc-400 mb-6">{quiz.course}</p>
                
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
              
              <div className="mt-auto p-4 border-t border-zinc-800/50 bg-zinc-900/30">
                <button 
                  onClick={() => toast.success(`Managing ${quiz.title}`)}
                  className="w-full py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Manage Quiz
                </button>
              </div>
            </div>
          ))}
          {filteredQuizzes.length === 0 && (
            <div className="col-span-full p-12 text-center text-zinc-500 bg-zinc-900/50 rounded-2xl border border-zinc-800">
              No quizzes match your search.
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-white">Create New Quiz</h2>
                <p className="text-sm text-zinc-400 mt-1">Set up a new assessment for your students.</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
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
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500" 
                  placeholder="e.g. Midterm Exam" 
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Select Course</label>
                <select 
                  value={newQuiz.course}
                  onChange={e => setNewQuiz({...newQuiz, course: e.target.value})}
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Select a course...</option>
                  <option value="Introduction to Computer Science">Introduction to Computer Science</option>
                  <option value="Data Structures and Algorithms">Data Structures and Algorithms</option>
                  <option value="Introduction to Business">Introduction to Business</option>
                  <option value="Corporate Finance">Corporate Finance</option>
                  <option value="Digital Marketing Strategy">Digital Marketing Strategy</option>
                </select>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs font-medium text-zinc-300 block mb-1">Number of Questions</label>
                  <input 
                    type="number" 
                    value={newQuiz.questions}
                    onChange={e => setNewQuiz({...newQuiz, questions: parseInt(e.target.value) || 0})}
                    className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500" 
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-zinc-300 block mb-1">Time Limit</label>
                  <select 
                    value={newQuiz.timeLimit}
                    onChange={e => setNewQuiz({...newQuiz, timeLimit: e.target.value})}
                    className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="15 mins">15 mins</option>
                    <option value="30 mins">30 mins</option>
                    <option value="45 mins">45 mins</option>
                    <option value="60 mins">60 mins</option>
                    <option value="90 mins">90 mins</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 flex justify-end gap-3">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleCreateQuiz} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition-all flex items-center gap-2">
                <Check className="w-4 h-4" /> Create Draft
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

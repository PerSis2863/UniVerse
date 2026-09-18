'use client';

import { Topbar } from '@/components/layout/Topbar';
import { HelpCircle, Clock, Plus, Edit2, Trash2, X, Save, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

type Quiz = {
  id: string;
  title: string;
  subject: string;
  duration: number;
  questions: number;
};

const INITIAL_QUIZZES: Quiz[] = [
  { id: '1', title: 'Calculus Midterm Review', subject: 'Mathematics', duration: 45, questions: 20 },
  { id: '2', title: 'Quantum Mechanics Basics', subject: 'Physics', duration: 30, questions: 15 },
  { id: '3', title: 'Data Structures - Trees & Graphs', subject: 'Computer Science', duration: 60, questions: 25 },
  { id: '4', title: 'World History: WW2', subject: 'History', duration: 45, questions: 30 },
];

export default function AdminQuizzesPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>(INITIAL_QUIZZES);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    subject: '',
    duration: 30,
    questions: 10,
  });

  const handleOpenModal = (quiz?: Quiz) => {
    if (quiz) {
      setEditingQuiz(quiz);
      setFormData({
        title: quiz.title,
        subject: quiz.subject,
        duration: quiz.duration,
        questions: quiz.questions,
      });
    } else {
      setEditingQuiz(null);
      setFormData({
        title: '',
        subject: '',
        duration: 30,
        questions: 10,
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingQuiz(null);
  };

  const handleSave = () => {
    if (!formData.title || !formData.subject) {
      toast.error('Please fill in all required fields.');
      return;
    }

    if (editingQuiz) {
      setQuizzes(quizzes.map(q => q.id === editingQuiz.id ? { ...q, ...formData } : q));
      toast.success('Quiz updated successfully.');
    } else {
      const newQuiz: Quiz = {
        id: Math.random().toString(36).substring(7),
        ...formData,
      };
      setQuizzes([...quizzes, newQuiz]);
      toast.success('New quiz created successfully.');
    }
    handleCloseModal();
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this quiz?')) {
      setQuizzes(quizzes.filter(q => q.id !== id));
      toast.success('Quiz deleted successfully.');
    }
  };

  const filteredQuizzes = quizzes.filter(q => 
    q.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    q.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <Topbar title="Quizzes Management" subtitle="Create and manage assessments for students" />
      
      <div className="flex-1 p-8 overflow-y-auto bg-[#09090b]">
        <div className="max-w-6xl mx-auto space-y-6">
          
          {/* Header Actions */}
          <div className="flex flex-col sm:flex-row justify-between gap-4 items-center">
            <div className="relative w-full sm:w-96">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search quizzes by title or subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
              />
            </div>
            
            <button
              onClick={() => handleOpenModal()}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-colors w-full sm:w-auto justify-center"
            >
              <Plus className="w-4 h-4" />
              Create New Quiz
            </button>
          </div>

          {/* Quizzes List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredQuizzes.map((quiz) => (
              <div key={quiz.id} className="card p-6 flex flex-col hover:border-indigo-500/50 transition-colors group relative">
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                  <button 
                    onClick={() => handleOpenModal(quiz)}
                    className="p-1.5 bg-zinc-800 hover:bg-indigo-500/20 text-zinc-400 hover:text-indigo-400 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(quiz.id)}
                    className="p-1.5 bg-zinc-800 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 w-max mb-4">
                  {quiz.subject}
                </div>
                <h4 className="text-lg font-bold text-white mb-2 pr-16">{quiz.title}</h4>
                <div className="flex flex-wrap gap-4 text-sm text-zinc-400 mt-auto">
                  <span className="flex items-center gap-1.5"><Clock className="w-4 h-4"/> {quiz.duration} mins</span>
                  <span className="flex items-center gap-1.5"><HelpCircle className="w-4 h-4"/> {quiz.questions} Questions</span>
                </div>
              </div>
            ))}
            
            {filteredQuizzes.length === 0 && (
              <div className="col-span-full py-12 text-center border border-dashed border-zinc-800 rounded-2xl">
                <p className="text-zinc-500">No quizzes found matching your criteria.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f111a] border border-white/[0.05] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-white/[0.05] flex items-center justify-between bg-white/[0.02]">
              <h2 className="text-lg font-semibold text-white">
                {editingQuiz ? 'Edit Quiz' : 'Create New Quiz'}
              </h2>
              <button 
                onClick={handleCloseModal}
                className="text-zinc-400 hover:text-white transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Quiz Title <span className="text-rose-500">*</span></label>
                <input 
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                  placeholder="e.g. Calculus Midterm Review"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Subject <span className="text-rose-500">*</span></label>
                <input 
                  type="text"
                  value={formData.subject}
                  onChange={e => setFormData({...formData, subject: e.target.value})}
                  className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                  placeholder="e.g. Mathematics"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Duration (mins)</label>
                  <input 
                    type="number"
                    value={formData.duration}
                    onChange={e => setFormData({...formData, duration: parseInt(e.target.value) || 0})}
                    className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                    min="1"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Number of Questions</label>
                  <input 
                    type="number"
                    value={formData.questions}
                    onChange={e => setFormData({...formData, questions: parseInt(e.target.value) || 0})}
                    className="w-full bg-black/40 border border-white/[0.1] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                    min="1"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-white/[0.05] bg-white/[0.02] flex justify-end gap-3">
              <button 
                onClick={handleCloseModal}
                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {editingQuiz ? 'Save Changes' : 'Create Quiz'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

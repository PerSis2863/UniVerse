'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Search, Mail, Filter, Building2, MapPin, X, Send } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const MOCK_DIRECTORY = [
  { id: 1, name: 'Alice Johnson', major: 'B.S. Computer Science', year: 'Junior', location: 'Campus Dorms', email: 'alice.j@universe.edu', avatar: 'A' },
  { id: 2, name: 'Bob Smith', major: 'B.A. Business Admin', year: 'Senior', location: 'Off-Campus', email: 'bob.s@universe.edu', avatar: 'B' },
  { id: 3, name: 'Charlie Davis', major: 'B.S. Engineering', year: 'Sophomore', location: 'Campus Dorms', email: 'charlie.d@universe.edu', avatar: 'C' },
  { id: 4, name: 'Diana Prince', major: 'B.S. Physics', year: 'Freshman', location: 'Campus Dorms', email: 'diana.p@universe.edu', avatar: 'D' },
  { id: 5, name: 'Evan Wright', major: 'B.A. Graphic Design', year: 'Junior', location: 'Off-Campus', email: 'evan.w@universe.edu', avatar: 'E' },
  { id: 6, name: 'Fiona Gallagher', major: 'B.S. Mathematics', year: 'Senior', location: 'Off-Campus', email: 'fiona.g@universe.edu', avatar: 'F' },
];

export default function StudentDirectory() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeModal, setActiveModal] = useState<'filter' | 'chat' | null>(null);
  
  // Filters
  const [filterYear, setFilterYear] = useState('');
  const [filterLocation, setFilterLocation] = useState('');

  // Chat
  const [activeStudent, setActiveStudent] = useState<typeof MOCK_DIRECTORY[0] | null>(null);
  const [chatHistory, setChatHistory] = useState<{sender: 'me' | 'peer', text: string}[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, isTyping]);

  const handleSendMessage = () => {
    if (!currentMessage.trim()) return;
    
    setChatHistory(prev => [...prev, { sender: 'me', text: currentMessage }]);
    setCurrentMessage('');
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      const responses = [
        "Hey! Great to hear from you.",
        "Yes, I'm taking that class too!",
        "I'm currently at the library, what's up?",
        "Sure, I'd love to collaborate on that.",
        "Let me check my schedule and get back to you."
      ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      setChatHistory(prev => [...prev, { sender: 'peer', text: randomResponse }]);
    }, 1500);
  };

  const filteredStudents = MOCK_DIRECTORY.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          s.major.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesYear = filterYear ? s.year === filterYear : true;
    const matchesLocation = filterLocation ? s.location === filterLocation : true;
    return matchesSearch && matchesYear && matchesLocation;
  });

  return (
    <>
      <Topbar title="Student Directory" subtitle="Find and connect with peers across the university" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 dark:text-zinc-400" />
              <input 
                type="text" 
                placeholder="Search by name, major, or year..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:text-zinc-500 focus:outline-none focus:border-indigo-500 transition-all shadow-sm"
              />
            </div>
            <button onClick={() => setActiveModal('filter')} className="flex items-center gap-2 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:bg-zinc-800 text-zinc-300 px-6 py-3 rounded-xl transition-colors whitespace-nowrap font-medium">
              <Filter className="w-4 h-4" /> Filters
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredStudents.map((student) => (
              <div key={student.id} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors group">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-xl font-bold text-indigo-400 shadow-sm flex-shrink-0 group-hover:scale-105 transition-transform">
                    {student.avatar}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white truncate">{student.name}</h3>
                    <div className="text-sm font-medium text-indigo-400 truncate">{student.major}</div>
                  </div>
                </div>

                <div className="space-y-2 mb-6">
                  <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <Building2 className="w-4 h-4 text-zinc-500 dark:text-zinc-500 flex-shrink-0" />
                    <span>{student.year}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <MapPin className="w-4 h-4 text-zinc-500 dark:text-zinc-500 flex-shrink-0" />
                    <span>{student.location}</span>
                  </div>
                </div>

                <button onClick={() => { setActiveStudent(student); setChatHistory([]); setActiveModal('chat'); }} className="w-full py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                  <Mail className="w-4 h-4" /> Message
                </button>
              </div>
            ))}
          </div>
          
          {filteredStudents.length === 0 && (
            <div className="p-12 text-center bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <div className="text-zinc-600 dark:text-zinc-400 text-lg">No students found matching your search.</div>
            </div>
          )}

        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {activeModal === 'filter' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setActiveModal(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-[#0d1117] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-white/[0.02]">
                <h2 className="text-xl font-bold text-white">Filter Directory</h2>
                <button onClick={() => setActiveModal(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">Year</label>
                  <select 
                    value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 px-4 text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
                  >
                    <option value="">Any Year</option>
                    <option value="Freshman">Freshman</option>
                    <option value="Sophomore">Sophomore</option>
                    <option value="Junior">Junior</option>
                    <option value="Senior">Senior</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">Location</label>
                  <select 
                    value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 px-4 text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
                  >
                    <option value="">Any Location</option>
                    <option value="Campus Dorms">Campus Dorms</option>
                    <option value="Off-Campus">Off-Campus</option>
                  </select>
                </div>
                <button onClick={() => setActiveModal(null)} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors">
                  Apply Filters
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {activeModal === 'chat' && activeStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setActiveModal(null)}
            />
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
              className="relative w-full max-w-lg h-[600px] bg-[#0d1117] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold">
                    {activeStudent.avatar}
                  </div>
                  <div>
                    <div className="font-bold text-white">{activeStudent.name}</div>
                    <div className="text-xs text-indigo-400">{activeStudent.major}</div>
                  </div>
                </div>
                <button onClick={() => setActiveModal(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div ref={chatScrollRef} className="flex-1 p-4 overflow-y-auto space-y-4">
                <div className="text-center text-xs text-zinc-500 mb-6">This is the beginning of your conversation with {activeStudent.name}</div>
                {chatHistory.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${msg.sender === 'me' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-zinc-800 text-zinc-200 rounded-bl-none'}`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-zinc-800 text-zinc-400 rounded-2xl rounded-bl-none px-4 py-2 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}
              </div>
              
              <div className="p-4 border-t border-zinc-800 bg-white/[0.01]">
                <div className="flex items-center gap-2">
                  <input 
                    type="text"
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type a message..."
                    className="flex-1 bg-white/[0.05] border border-zinc-700 rounded-full px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button 
                    onClick={handleSendMessage}
                    disabled={!currentMessage.trim()}
                    className="p-2 rounded-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white transition-colors"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

'use client';

import { Topbar } from '@/components/layout/Topbar';
import { LifeBuoy, FileText, MessageCircle, Phone, ChevronRight, Search, Send, Book, Wifi, Laptop, X, CheckCircle2, HelpCircle } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const FAQS = [
  { q: "How do I access my course materials?", a: "Navigate to the 'My Courses' tab, select your course, and click on the 'Materials' section." },
  { q: "What should I do if I miss a quiz deadline?", a: "Please contact your instructor directly through the 'Messages' system to discuss an extension." },
  { q: "How is my attendance calculated?", a: "Attendance is automatically tracked when you join live virtual sessions or check in physically using the mobile app." },
  { q: "Where can I find my official transcript?", a: "Transcripts can be requested through the 'Grades' tab. Click the 'Request Official Transcript' button at the top right." }
];

export default function StudentSupport() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Ticket form state
  const [ticketCategory, setTicketCategory] = useState('Technical Issue');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject.trim() || !ticketDescription.trim()) {
      toast.error('Please fill out all fields before submitting.');
      return;
    }
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      const ticketId = `TKT-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      toast.success(`Ticket submitted successfully! Your Ticket ID is ${ticketId}. We will contact you soon.`);
      setTicketSubject('');
      setTicketDescription('');
    }, 1500);
  };

  const handleCloseModal = () => {
    setActiveModal(null);
  };

  return (
    <>
      <Topbar title="Help & Support" subtitle="Get assistance with your courses, account, and campus technology" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-12">
          
          {/* Search Hero */}
          <div className="bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 rounded-2xl p-12 text-center">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">How can we help you today?</h2>
            <div className="relative max-w-2xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-600 dark:text-zinc-400" />
              <input 
                type="text" 
                placeholder="Search for articles, tutorials, and FAQs..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white dark:bg-zinc-900/80 border border-zinc-700 rounded-xl text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-lg shadow-xl"
              />
            </div>
          </div>

          {/* Quick Links */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div onClick={() => router.push('/student/knowledge-hub')} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 hover:border-indigo-500/50 transition-colors cursor-pointer group shadow-lg">
              <div className="w-12 h-12 bg-indigo-500/10 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <FileText className="w-6 h-6 text-indigo-400" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">Knowledge Base</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Browse our comprehensive guides and tutorials.</p>
            </div>
            
            <div onClick={() => router.push('/student/inbox?chatWith=IT%20Support')} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 hover:border-indigo-500/50 transition-colors cursor-pointer group shadow-lg">
              <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <MessageCircle className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">Live Chat</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Chat directly with a support representative.</p>
            </div>

            <div onClick={() => setActiveModal('library')} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 hover:border-indigo-500/50 transition-colors cursor-pointer group shadow-lg">
              <div className="w-12 h-12 bg-amber-500/10 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Book className="w-6 h-6 text-amber-400" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">Library Portal</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Access academic research databases and request loans.</p>
            </div>

            <div onClick={() => setActiveModal('guide')} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 hover:border-indigo-500/50 transition-colors cursor-pointer group shadow-lg">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Wifi className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">Campus Wi-Fi</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Instructions for connecting your devices to eduroam.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            
            {/* FAQs */}
            <div>
              <h3 className="text-xl font-semibold text-zinc-900 dark:text-white mb-6 flex items-center gap-2">
                <LifeBuoy className="w-5 h-5 text-indigo-400" /> Frequently Asked Questions
              </h3>
              <div className="space-y-4">
                {FAQS.map((faq, i) => (
                  <div key={i} className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800/50 rounded-lg p-5">
                    <h4 className="font-medium text-zinc-200 mb-2">{faq.q}</h4>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{faq.a}</p>
                  </div>
                ))}
              </div>
              <button className="mt-4 text-indigo-400 hover:text-indigo-300 text-sm font-medium flex items-center gap-1 transition-colors">
                View all FAQs <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Contact Form */}
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8">
              <h3 className="text-xl font-semibold text-zinc-900 dark:text-white mb-6">Submit a Ticket (IT Helpdesk)</h3>
              <form className="space-y-4" onSubmit={handleSubmitTicket}>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Issue Category</label>
                  <select 
                    value={ticketCategory}
                    onChange={(e) => setTicketCategory(e.target.value)}
                    className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors appearance-none"
                  >
                    <option>Technical Issue</option>
                    <option>Network & Wi-Fi</option>
                    <option>Account / Billing</option>
                    <option>Course Material Missing</option>
                    <option>Other</option>
                  </select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Subject</label>
                  <input 
                    type="text" 
                    placeholder="Brief description of the issue" 
                    value={ticketSubject}
                    onChange={(e) => setTicketSubject(e.target.value)}
                    className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors" 
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Description</label>
                  <textarea 
                    rows={4} 
                    placeholder="Please provide as much detail as possible..." 
                    value={ticketDescription}
                    onChange={(e) => setTicketDescription(e.target.value)}
                    className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  ></textarea>
                </div>

                <button 
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-zinc-900 dark:text-white px-6 py-3 rounded-lg font-medium transition-colors mt-2"
                >
                  {isSubmitting ? 'Submitting...' : <><Send className="w-4 h-4" /> Send Ticket</>}
                </button>
              </form>
            </div>
          </div>

        </div>
      </div>

      <AnimatePresence>
        {activeModal === 'guide' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0d1117] border border-zinc-800 w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[70vh]"
            >
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/30 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                    <FileText className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-bold text-white">Connecting to eduroam Wi-Fi</h2>
                </div>
                <button onClick={handleCloseModal} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-8 overflow-y-auto space-y-8 bg-zinc-950">
                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-white">Step 1: Select the Network</h3>
                  <p className="text-zinc-400">Open your device's Wi-Fi settings and select the network named <strong>eduroam</strong> from the list of available networks.</p>
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-white">Step 2: Enter Credentials</h3>
                  <p className="text-zinc-400">When prompted, enter your full university email address and your password.</p>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 font-mono text-sm text-zinc-300">
                    <div>Username: your.name@university.edu</div>
                    <div>Password: [Your University Password]</div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-white">Step 3: Accept the Certificate</h3>
                  <p className="text-zinc-400">If your device prompts you to accept or trust a certificate (usually named <code>radius.university.edu</code>), please accept it to proceed.</p>
                </div>
                
                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                  <p className="text-indigo-300 text-sm">
                    <strong>Need Help?</strong> If you are still unable to connect after following these steps, please use the Live Chat or Submit a Ticket from the main services page.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {activeModal === 'library' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0d1117] border border-zinc-800 w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[80vh]"
            >
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/30 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                    <Book className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-bold text-white">Library Portal</h2>
                </div>
                <button onClick={handleCloseModal} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-8 overflow-y-auto space-y-8 bg-zinc-950 flex-1">
                {/* Search Bar */}
                <div className="relative max-w-2xl mx-auto mt-4">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-zinc-500" />
                  </div>
                  <input 
                    type="text" 
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-indigo-500 text-lg shadow-lg"
                    placeholder="Search books, articles, journals, and more..."
                  />
                  <button 
                    onClick={() => toast.success('Search results loaded.')}
                    className="absolute inset-y-2 right-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 rounded-xl font-medium transition-colors">
                    Search
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-8">
                  <div onClick={() => toast.success('Loading your active loans...')} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-indigo-500/50 cursor-pointer transition-colors text-center">
                    <Book className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
                    <h3 className="font-semibold text-white mb-1">My Loans</h3>
                    <p className="text-sm text-zinc-400">View and renew borrowed items.</p>
                  </div>
                  <div onClick={() => toast.success('Connecting to academic databases...')} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-indigo-500/50 cursor-pointer transition-colors text-center">
                    <Laptop className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
                    <h3 className="font-semibold text-white mb-1">Databases</h3>
                    <p className="text-sm text-zinc-400">Access academic research databases.</p>
                  </div>
                  <div onClick={() => {
                    handleCloseModal();
                    router.push('/student/inbox?chatWith=Librarian');
                  }} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-indigo-500/50 cursor-pointer transition-colors text-center">
                    <HelpCircle className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
                    <h3 className="font-semibold text-white mb-1">Ask a Librarian</h3>
                    <p className="text-sm text-zinc-400">Get research help from library staff.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

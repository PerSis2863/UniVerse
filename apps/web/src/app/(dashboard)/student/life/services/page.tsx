'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Laptop, Wifi, Book, HelpCircle, ChevronRight, X, Send, MessageSquare, Bot, User, CheckCircle2, Search, FileText, Phone, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ServicesPage() {
  const [activeModal, setActiveModal] = useState<string | null>(null);
  
  // Chat state
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { role: 'bot', text: 'Hi there! I am the IT Support virtual assistant. How can I help you today?' }
  ]);
  const [isTyping, setIsTyping] = useState(false);

  // Ticket state
  const [ticketCategory, setTicketCategory] = useState('');
  const [ticketProblem, setTicketProblem] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ticketSubmitted, setTicketSubmitted] = useState(false);

  // Contact state
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubmitted, setContactSubmitted] = useState(false);

  const services = [
    {
      id: 'helpdesk',
      title: 'IT Helpdesk',
      icon: Laptop,
      desc: 'Get help with your laptop, software installations, or account access.',
      action: 'Submit a ticket',
      onClick: () => setActiveModal('ticket')
    },
    {
      id: 'wifi',
      title: 'Campus Wi-Fi',
      icon: Wifi,
      desc: 'Instructions for connecting your devices to eduroam and campus networks.',
      action: 'View guide',
      onClick: () => setActiveModal('guide')
    },
    {
      id: 'library',
      title: 'Library Services',
      icon: Book,
      desc: 'Access online databases, request interlibrary loans, or print documents.',
      action: 'Library portal',
      onClick: () => setActiveModal('library')
    },
    {
      id: 'general',
      title: 'General Support',
      icon: HelpCircle,
      desc: 'Not sure where to go? Start here for general inquiries.',
      action: 'Contact support',
      onClick: () => setActiveModal('contact')
    }
  ];

  const handleSendChat = () => {
    if (!chatMessage.trim()) return;
    
    // Add user message
    setChatHistory(prev => [...prev, { role: 'user', text: chatMessage }]);
    setChatMessage('');
    setIsTyping(true);

    // Simulate bot response
    setTimeout(() => {
      setChatHistory(prev => [...prev, { 
        role: 'bot', 
        text: 'I understand you are having an issue. Let me transfer you to a live support agent who can assist you further. Please hold on for a moment.' 
      }]);
      setIsTyping(false);
    }, 1500);
  };

  const handleSubmitTicket = () => {
    if (!ticketCategory || !ticketProblem.trim()) {
      toast.error('Please fill out all fields before submitting.');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setTicketSubmitted(true);
    }, 1500);
  };

  const handleSubmitContact = () => {
    if (!contactSubject.trim() || !contactMessage.trim()) {
      toast.error('Please fill out all fields.');
      return;
    }
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setContactSubmitted(true);
    }, 1500);
  };

  const handleCloseModal = () => {
    setActiveModal(null);
    setTimeout(() => {
      // Reset states after animation
      setTicketSubmitted(false);
      setTicketCategory('');
      setTicketProblem('');
      setContactSubject('');
      setContactMessage('');
      setContactSubmitted(false);
      setChatHistory([{ role: 'bot', text: 'Hi there! I am the IT Support virtual assistant. How can I help you today?' }]);
    }, 300);
  };

  return (
    <>
      <Topbar title="Using My Services" subtitle="Guides and support for campus technology" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-8 mb-8 text-center">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Need immediate technical assistance?</h2>
            <p className="text-indigo-200/80 mb-6 max-w-lg mx-auto">
              Our IT support team is available 24/7 to help you resolve any issues with your university account or devices.
            </p>
            <div className="flex justify-center gap-4">
              <button 
                onClick={() => toast.promise(
                  new Promise((resolve) => setTimeout(resolve, 1000)),
                  { loading: 'Dialing IT Support...', success: 'Call connected.', error: 'Call failed' }
                )} 
                className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                Call IT Support
              </button>
              <button 
                onClick={() => setActiveModal('chat')} 
                className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <MessageSquare className="w-4 h-4" /> Live Chat
              </button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {services.map((service, i) => (
              <div 
                key={i} 
                onClick={service.onClick} 
                className="bg-white dark:bg-[#0d1117] border border-zinc-200 dark:border-white/[0.08] rounded-2xl p-6 group cursor-pointer hover:border-indigo-500/50 hover:bg-white/[0.02] transition-colors shadow-lg"
              >
                <div className="w-12 h-12 bg-zinc-100 dark:bg-white/[0.05] rounded-xl flex items-center justify-center mb-4 text-zinc-600 dark:text-zinc-400 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition-colors">
                  <service.icon className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-zinc-900 dark:text-white mb-2">{service.title}</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">{service.desc}</p>
                <div className="flex items-center text-sm font-medium text-indigo-500 dark:text-indigo-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">
                  {service.action} <ChevronRight className="w-4 h-4 ml-1" />
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      <AnimatePresence>
        {activeModal === 'chat' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0d1117] border border-zinc-800 w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[600px]"
            >
              {/* Chat Header */}
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/30 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-[#0d1117] rounded-full"></span>
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">IT Support Live Chat</h2>
                    <p className="text-xs text-zinc-400">Usually replies in a few minutes</p>
                  </div>
                </div>
                <button onClick={handleCloseModal} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatHistory.map((msg, idx) => (
                  <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-indigo-400'}`}>
                      {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div className={`px-4 py-2.5 rounded-2xl max-w-[75%] text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-zinc-800/50 border border-zinc-700/50 text-zinc-200 rounded-tl-sm'}`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                
                {isTyping && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-zinc-800 text-indigo-400">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="px-4 py-3 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 rounded-tl-sm flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce"></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <div className="p-4 border-t border-zinc-800 bg-zinc-900/30 shrink-0">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSendChat(); }}
                  className="flex gap-2 relative"
                >
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="Type your message..."
                    className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 pl-4 pr-12 text-white focus:outline-none focus:border-indigo-500 text-sm"
                  />
                  <button 
                    type="submit"
                    disabled={!chatMessage.trim() || isTyping}
                    className="absolute right-2 top-1.5 p-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg transition-colors flex items-center justify-center"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}

        {activeModal === 'ticket' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0d1117] border border-zinc-800 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/30">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                    <Laptop className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-bold text-white">Submit a Ticket</h2>
                </div>
                <button onClick={handleCloseModal} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-8">
                {ticketSubmitted ? (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6">
                    <div className="w-16 h-16 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Ticket Submitted</h3>
                    <p className="text-zinc-400 text-sm mb-6">Your issue has been forwarded to the IT Support admin team. You will receive an email update shortly.</p>
                    <button onClick={handleCloseModal} className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2.5 rounded-xl font-medium transition-colors w-full">
                      Close
                    </button>
                  </motion.div>
                ) : (
                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-400">Issue Category</label>
                      <select 
                        value={ticketCategory}
                        onChange={(e) => setTicketCategory(e.target.value)}
                        className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 px-4 text-white focus:outline-none focus:border-indigo-500 appearance-none [color-scheme:dark] text-sm"
                      >
                        <option value="" disabled>Select a category...</option>
                        <option value="software">Software Installation</option>
                        <option value="hardware">Hardware Repair</option>
                        <option value="account">Account & Password Access</option>
                        <option value="network">Network & Wi-Fi</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-400">Problem Description</label>
                      <textarea 
                        value={ticketProblem}
                        onChange={(e) => setTicketProblem(e.target.value)}
                        placeholder="Please specify what the problems are in detail..."
                        rows={5}
                        className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 px-4 text-white focus:outline-none focus:border-indigo-500 text-sm resize-none"
                      />
                    </div>

                    <button 
                      onClick={handleSubmitTicket}
                      disabled={isSubmitting}
                      className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors mt-2 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-70"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          Submitting...
                        </>
                      ) : (
                        'Submit Ticket to Admin'
                      )}
                    </button>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>
        )}

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
                  <button className="absolute inset-y-2 right-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 rounded-xl font-medium transition-colors">
                    Search
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-8">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-indigo-500/50 cursor-pointer transition-colors text-center">
                    <Book className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
                    <h3 className="font-semibold text-white mb-1">My Loans</h3>
                    <p className="text-sm text-zinc-400">View and renew borrowed items.</p>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-indigo-500/50 cursor-pointer transition-colors text-center">
                    <Laptop className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
                    <h3 className="font-semibold text-white mb-1">Databases</h3>
                    <p className="text-sm text-zinc-400">Access academic research databases.</p>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-indigo-500/50 cursor-pointer transition-colors text-center">
                    <HelpCircle className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
                    <h3 className="font-semibold text-white mb-1">Ask a Librarian</h3>
                    <p className="text-sm text-zinc-400">Get research help from library staff.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {activeModal === 'contact' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0d1117] border border-zinc-800 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/30">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                    <Mail className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-bold text-white">Contact Support</h2>
                </div>
                <button onClick={handleCloseModal} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-8">
                {contactSubmitted ? (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6">
                    <div className="w-16 h-16 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Message Sent</h3>
                    <p className="text-zinc-400 text-sm mb-6">Thank you for reaching out. A support representative will get back to you shortly.</p>
                    <button onClick={handleCloseModal} className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2.5 rounded-xl font-medium transition-colors w-full">
                      Close
                    </button>
                  </motion.div>
                ) : (
                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-400">Subject</label>
                      <input 
                        type="text"
                        value={contactSubject}
                        onChange={(e) => setContactSubject(e.target.value)}
                        placeholder="Briefly describe your inquiry..."
                        className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 px-4 text-white focus:outline-none focus:border-indigo-500 text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-400">Message</label>
                      <textarea 
                        value={contactMessage}
                        onChange={(e) => setContactMessage(e.target.value)}
                        placeholder="How can we help you?"
                        rows={5}
                        className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl py-3 px-4 text-white focus:outline-none focus:border-indigo-500 text-sm resize-none"
                      />
                    </div>

                    <div className="pt-2">
                      <button 
                        onClick={handleSubmitContact}
                        disabled={isSubmitting}
                        className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-70"
                      >
                        {isSubmitting ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            Sending...
                          </>
                        ) : (
                          'Send Message'
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

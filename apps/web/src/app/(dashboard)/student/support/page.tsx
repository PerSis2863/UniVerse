'use client';

import { Topbar } from '@/components/layout/Topbar';
import { LifeBuoy, FileText, MessageCircle, Phone, ChevronRight, Search, Send } from 'lucide-react';
import { useState } from 'react';

const FAQS = [
  { q: "How do I access my course materials?", a: "Navigate to the 'My Courses' tab, select your course, and click on the 'Materials' section." },
  { q: "What should I do if I miss a quiz deadline?", a: "Please contact your instructor directly through the 'Messages' system to discuss an extension." },
  { q: "How is my attendance calculated?", a: "Attendance is automatically tracked when you join live virtual sessions or check in physically using the mobile app." },
  { q: "Where can I find my official transcript?", a: "Transcripts can be requested through the 'Grades' tab. Click the 'Request Official Transcript' button at the top right." }
];

export default function StudentSupport() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <>
      <Topbar title="Help & Support" subtitle="Get assistance with your courses and account" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-12">
          
          {/* Search Hero */}
          <div className="bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 rounded-2xl p-12 text-center">
            <h2 className="text-2xl font-bold text-white mb-4">How can we help you today?</h2>
            <div className="relative max-w-2xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
              <input 
                type="text" 
                placeholder="Search for articles, tutorials, and FAQs..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-zinc-900/80 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-lg shadow-xl"
              />
            </div>
          </div>

          {/* Quick Links */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:border-indigo-500/50 transition-colors cursor-pointer group">
              <div className="w-12 h-12 bg-indigo-500/10 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <FileText className="w-6 h-6 text-indigo-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Knowledge Base</h3>
              <p className="text-sm text-zinc-400">Browse our comprehensive guides and tutorials for using the platform.</p>
            </div>
            
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:border-indigo-500/50 transition-colors cursor-pointer group">
              <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <MessageCircle className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Live Chat</h3>
              <p className="text-sm text-zinc-400">Chat directly with a support representative. Available 9AM - 5PM EST.</p>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:border-indigo-500/50 transition-colors cursor-pointer group">
              <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Phone className="w-6 h-6 text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">IT Helpdesk</h3>
              <p className="text-sm text-zinc-400">Having technical issues? Contact the university IT helpdesk directly.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            
            {/* FAQs */}
            <div>
              <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <LifeBuoy className="w-5 h-5 text-indigo-400" /> Frequently Asked Questions
              </h3>
              <div className="space-y-4">
                {FAQS.map((faq, i) => (
                  <div key={i} className="bg-zinc-900/30 border border-zinc-800/50 rounded-lg p-5">
                    <h4 className="font-medium text-zinc-200 mb-2">{faq.q}</h4>
                    <p className="text-sm text-zinc-400 leading-relaxed">{faq.a}</p>
                  </div>
                ))}
              </div>
              <button className="mt-4 text-indigo-400 hover:text-indigo-300 text-sm font-medium flex items-center gap-1 transition-colors">
                View all FAQs <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Contact Form */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8">
              <h3 className="text-xl font-semibold text-white mb-6">Submit a Ticket</h3>
              <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">Issue Category</label>
                  <select className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors appearance-none">
                    <option>Technical Issue</option>
                    <option>Account / Billing</option>
                    <option>Course Material Missing</option>
                    <option>Other</option>
                  </select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">Subject</label>
                  <input type="text" placeholder="Brief description of the issue" className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors" />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">Description</label>
                  <textarea rows={4} placeholder="Please provide as much detail as possible..." className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"></textarea>
                </div>

                <button className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium transition-colors mt-2">
                  <Send className="w-4 h-4" /> Send Ticket
                </button>
              </form>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

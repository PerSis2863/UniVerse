'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Info, Megaphone, FileText, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';

export default function StudentInformation() {
  const handleLinkClick = (e: React.MouseEvent, docName: string) => {
    e.preventDefault();
    toast.info(`Opening ${docName}...`);
  };

  return (
    <>
      <Topbar title="Information" subtitle="Latest updates and resources from the university" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-8">
          
          {/* Announcements Banner */}
          <div className="bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-xl p-6 flex items-start gap-4">
            <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
              <Megaphone className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2">Campus Closure Notice</h3>
              <p className="text-zinc-300 leading-relaxed">
                Please be advised that the main library will be closed this weekend (Oct 15-16) for scheduled maintenance. 
                Online resources remain fully accessible.
              </p>
              <div className="mt-3 text-sm text-zinc-500">Posted on October 12, 2026 by Administration</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Quick Links */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" /> Important Resources
              </h3>
              
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
                <a href="#" onClick={(e) => handleLinkClick(e, 'Student Handbook')} className="block p-4 hover:bg-zinc-800/50 transition-colors">
                  <div className="font-medium text-white mb-1">Student Handbook 2026-2027</div>
                  <div className="text-sm text-zinc-400">Rules, policies, and code of conduct.</div>
                </a>
                <a href="#" onClick={(e) => handleLinkClick(e, 'Academic Calendar')} className="block p-4 hover:bg-zinc-800/50 transition-colors">
                  <div className="font-medium text-white mb-1">Academic Calendar</div>
                  <div className="text-sm text-zinc-400">Term dates, holidays, and exam schedules.</div>
                </a>
                <a href="#" onClick={(e) => handleLinkClick(e, 'Campus Map')} className="block p-4 hover:bg-zinc-800/50 transition-colors">
                  <div className="font-medium text-white mb-1">Campus Map</div>
                  <div className="text-sm text-zinc-400">Interactive map for buildings and facilities.</div>
                </a>
                <a href="#" onClick={(e) => handleLinkClick(e, 'Health & Wellness Center')} className="block p-4 hover:bg-zinc-800/50 transition-colors">
                  <div className="font-medium text-white mb-1">Health & Wellness Center</div>
                  <div className="text-sm text-zinc-400">Medical services, counseling, and emergencies.</div>
                </a>
              </div>
            </div>

            {/* Upcoming Events */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-indigo-400" /> Upcoming University Events
              </h3>
              
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-5">
                <div className="flex gap-4 cursor-pointer hover:bg-zinc-800/30 p-2 -mx-2 rounded-lg transition-colors" onClick={(e) => handleLinkClick(e, 'Career Fair Details')}>
                  <div className="w-14 h-14 bg-zinc-800 rounded-lg flex flex-col items-center justify-center flex-shrink-0 border border-zinc-700">
                    <span className="text-xs font-medium text-zinc-400 uppercase">Oct</span>
                    <span className="text-xl font-bold text-white">18</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-1">Career Fair 2026</h4>
                    <p className="text-sm text-zinc-400 mb-1">Main Student Center • 10:00 AM - 4:00 PM</p>
                    <p className="text-xs text-zinc-500">Connect with top employers for internships and full-time roles.</p>
                  </div>
                </div>

                <div className="flex gap-4 cursor-pointer hover:bg-zinc-800/30 p-2 -mx-2 rounded-lg transition-colors" onClick={(e) => handleLinkClick(e, 'Guest Lecture Details')}>
                  <div className="w-14 h-14 bg-zinc-800 rounded-lg flex flex-col items-center justify-center flex-shrink-0 border border-zinc-700">
                    <span className="text-xs font-medium text-zinc-400 uppercase">Oct</span>
                    <span className="text-xl font-bold text-white">25</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-1">Guest Lecture: Tech Ethics</h4>
                    <p className="text-sm text-zinc-400 mb-1">Auditorium A • 2:00 PM - 3:30 PM</p>
                    <p className="text-xs text-zinc-500">Join Dr. Sarah Jenkins for a talk on AI and Ethics.</p>
                  </div>
                </div>

                <div className="flex gap-4 cursor-pointer hover:bg-zinc-800/30 p-2 -mx-2 rounded-lg transition-colors" onClick={(e) => handleLinkClick(e, 'Workshop Details')}>
                  <div className="w-14 h-14 bg-zinc-800 rounded-lg flex flex-col items-center justify-center flex-shrink-0 border border-zinc-700">
                    <span className="text-xs font-medium text-zinc-400 uppercase">Nov</span>
                    <span className="text-xl font-bold text-white">02</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-1">Midterm Preparation Workshop</h4>
                    <p className="text-sm text-zinc-400 mb-1">Library Study Hall • 5:00 PM - 7:00 PM</p>
                    <p className="text-xs text-zinc-500">Learn effective study strategies and time management.</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}

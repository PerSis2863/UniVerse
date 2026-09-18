'use client';

import { Topbar } from '@/components/layout/Topbar';
import { LinkIcon, ExternalLink, Globe, Smartphone, Monitor } from 'lucide-react';

const LINKS = [
  {
    category: 'Academic Tools',
    icon: Monitor,
    items: [
      { name: 'Canvas LMS', url: 'https://canvas.instructure.com', desc: 'Main learning management system for assignments.' },
      { name: 'University Library Proxy', url: '#', desc: 'Access research papers and journals from off-campus.' },
      { name: 'CodeGrade', url: '#', desc: 'Submit computer science assignments for autograding.' }
    ]
  },
  {
    category: 'Student Life & Help',
    icon: Globe,
    items: [
      { name: 'IT Helpdesk Portal', url: '#', desc: 'Submit tech support tickets for campus Wi-Fi or accounts.' },
      { name: 'Housing Portal', url: '#', desc: 'Manage your on-campus housing and meal plans.' },
      { name: 'Campus Recreation', url: '#', desc: 'Book gym times, intramural sports, and fitness classes.' }
    ]
  },
  {
    category: 'Mobile Apps',
    icon: Smartphone,
    items: [
      { name: 'Campus Maps (iOS/Android)', url: '#', desc: 'Navigate campus buildings and find classrooms.' },
      { name: 'DineOnCampus', url: '#', desc: 'Check dining hall menus and operating hours.' }
    ]
  }
];

export default function StudentLinks() {
  return (
    <>
      <Topbar title="Apps & Links" subtitle="Useful external resources and university portals" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-8">
          
          <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-xl p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <LinkIcon className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">University Directory of Services</h3>
              <p className="text-sm text-zinc-400">These links are managed by the administration. For issues with these external portals, please contact the IT Helpdesk.</p>
            </div>
          </div>

          <div className="space-y-8">
            {LINKS.map((section, i) => (
              <div key={i} className="space-y-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <section.icon className="w-5 h-5 text-indigo-400" /> {section.category}
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {section.items.map((item, j) => (
                    <a key={j} href={item.url} target="_blank" rel="noopener noreferrer" className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 hover:border-zinc-600 hover:bg-zinc-800/50 transition-all group flex flex-col h-full">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium text-white group-hover:text-indigo-400 transition-colors">{item.name}</h4>
                        <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-indigo-400 transition-colors flex-shrink-0" />
                      </div>
                      <p className="text-sm text-zinc-400 mt-auto">{item.desc}</p>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </>
  );
}

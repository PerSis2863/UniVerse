'use client';

import { Topbar } from '@/components/layout/Topbar';
import { usePathname, useRouter } from 'next/navigation';
import { Mail, Book, MapPin, Building2, Download, ExternalLink, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

type Resource = {
  id: string;
  title: string;
  type: string;
  category: string;
  size?: string;
  url?: string;
  date: string;
};

// Mock data to simulate shared resources from the user
const MOCK_SHARED_RESOURCES: Resource[] = [
  { id: '1', title: 'Intro to Algorithms Notes', category: 'Computer Science', type: 'PDF', size: '1.2 MB', date: new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0] },
  { id: '2', title: 'Machine Learning Study Guide', category: 'Computer Science', type: 'Document', size: '3.4 MB', date: new Date(Date.now() - 86400000 * 5).toISOString().split('T')[0] },
  { id: '3', title: 'Calculus Cheat Sheet', category: 'General', type: 'PDF', size: '0.8 MB', date: new Date(Date.now() - 86400000 * 12).toISOString().split('T')[0] },
];

export default function StudentProfile() {
  const pathname = usePathname();
  const router = useRouter();
  const id = pathname.split('/').pop() || 'Unknown User';
  const userName = decodeURIComponent(id);

  const [sharedResources, setSharedResources] = useState<Resource[]>([]);

  useEffect(() => {
    // In a real application, we would fetch the shared resources for this specific user.
    // For now, we'll just use the mock data to represent what a shared hub looks like.
    setSharedResources(MOCK_SHARED_RESOURCES);
  }, [userName]);

  const handleDownload = (resource: Resource) => {
    if (resource.type === 'Link' && resource.url) {
      window.open(resource.url, '_blank');
      return;
    }
    toast.success(`Downloading ${resource.title}...`);
  };

  const handleMessage = () => {
    router.push(`/student/inbox?chatWith=${encodeURIComponent(userName)}`);
  };

  return (
    <>
      <Topbar title={`${userName}'s Profile`} subtitle="View profile and shared resources" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-8">
          
          {/* Profile Header */}
          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 flex flex-col md:flex-row gap-8 items-start md:items-center relative overflow-hidden">
            <div className="absolute top-0 right-0 p-32 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
            
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-4xl font-bold text-indigo-400 shadow-sm shrink-0 z-10">
              {userName.charAt(0)}
            </div>
            
            <div className="flex-1 z-10">
              <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">{userName}</h1>
              <p className="text-lg text-indigo-400 font-medium mb-4">Student at UniVerse</p>
              
              <div className="flex flex-wrap gap-4 text-sm text-zinc-600 dark:text-zinc-400">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" /> B.S. Computer Science
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Campus Dorms
                </div>
              </div>
            </div>
            
            <div className="flex shrink-0 gap-3 w-full md:w-auto mt-4 md:mt-0 z-10">
              <button 
                onClick={handleMessage}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-medium transition-colors shadow-lg shadow-indigo-500/20"
              >
                <Mail className="w-4 h-4" /> Message
              </button>
            </div>
          </div>

          {/* Shared Knowledge Hub */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4">
              <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
                <Book className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Shared Knowledge Hub</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Resources {userName} has shared publicly with others.</p>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800/50">
                {sharedResources.length === 0 ? (
                  <div className="p-12 text-center text-zinc-500">
                    This user hasn't shared any resources yet.
                  </div>
                ) : (
                  sharedResources.map((resource) => (
                    <div key={resource.id} className="p-5 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors group">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-zinc-100 dark:bg-white/[0.04] flex items-center justify-center text-zinc-400 group-hover:bg-indigo-500/10 group-hover:text-indigo-400 transition-colors shrink-0">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="text-base font-semibold text-zinc-900 dark:text-white mb-1 group-hover:text-indigo-400 transition-colors">{resource.title}</h4>
                          <div className="flex items-center gap-3 text-xs text-zinc-500">
                            <span className="bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 rounded-md font-medium text-zinc-700 dark:text-zinc-300">{resource.category}</span>
                            <span>{resource.type}</span>
                            {resource.size && <span>• {resource.size}</span>}
                            <span>• Added {resource.date}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <button 
                          onClick={() => handleDownload(resource)}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors border border-transparent dark:hover:border-indigo-500/20"
                        >
                          {resource.type === 'Link' ? (
                            <><ExternalLink className="w-4 h-4" /> Open Link</>
                          ) : (
                            <><Download className="w-4 h-4" /> Download</>
                          )}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

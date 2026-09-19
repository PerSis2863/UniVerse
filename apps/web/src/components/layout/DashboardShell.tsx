'use client';
import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Menu } from 'lucide-react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { PageTransition } from './PageTransition';
import { AIStudyAssistant } from '@/components/ui/AIStudyAssistant';

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between px-4 h-16 border-b border-white/[0.06] bg-[#09090b] sticky top-0 z-30">
          <UniverseLogo size="sm" showText={true} animated={false} />
          <button onClick={() => setSidebarOpen(true)} className="p-2 -mr-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white">
            <Menu className="w-6 h-6" />
          </button>
        </header>

        <main className="flex-1 flex flex-col min-w-0">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <AIStudyAssistant />
    </div>
  );
}

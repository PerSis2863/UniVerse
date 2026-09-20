'use client';
import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Menu, LayoutDashboard, BookOpen, GraduationCap, MessageSquare, MoreHorizontal } from 'lucide-react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';
import { PageTransition } from './PageTransition';
import { AIStudyAssistant } from '@/components/ui/AIStudyAssistant';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { useAuthStore } from '@/store/auth';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface DashboardShellProps {
  children: React.ReactNode;
}

function MobileBottomNav({ role }: { role: string }) {
  const pathname = usePathname();
  const isStudent = role === 'STUDENT';
  const base = isStudent ? '/student' : role === 'TEACHER' ? '/teacher' : '/admin';

  const items = isStudent ? [
    { href: '/student', label: 'Home', icon: LayoutDashboard },
    { href: '/student/courses', label: 'Courses', icon: BookOpen },
    { href: '/student/grades', label: 'Grades', icon: GraduationCap },
    { href: '/student/inbox', label: 'Messages', icon: MessageSquare },
    { href: '/student/settings', label: 'More', icon: MoreHorizontal },
  ] : [
    { href: `${base}`, label: 'Home', icon: LayoutDashboard },
    { href: `${base}/courses`, label: 'Courses', icon: BookOpen },
    { href: `${base}/grades`, label: 'Grades', icon: GraduationCap },
    { href: `${base}/inbox`, label: 'Messages', icon: MessageSquare },
    { href: `${base}/students`, label: 'More', icon: MoreHorizontal },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#09090b]/95 backdrop-blur-xl border-t border-zinc-200 dark:border-white/[0.06] pb-safe">
      <div className="flex items-center justify-around px-2 py-2">
        {items.map((item) => {
          const isActive = pathname === item.href || (item.href !== base && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all relative",
                isActive ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-500 dark:text-zinc-500"
              )}
            >
              {isActive && (
                <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-indigo-500" />
              )}
              <item.icon className={cn("w-5 h-5 transition-transform", isActive && "scale-110")} />
              <span className={cn("text-[10px] font-medium", isActive && "font-bold")}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuthStore();

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

        <main className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <AIStudyAssistant />
      <CommandPalette role={user?.role} />
      {user && <MobileBottomNav role={user.role} />}
    </div>
  );
}

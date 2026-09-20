'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Search, LayoutDashboard, BookOpen, GraduationCap, MessageSquare,
  Trophy, Clock, FileText, Users, BrainCircuit, Globe2,
  ChevronRight, Sparkles, Command
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  category: string;
  keywords?: string[];
}

const STUDENT_COMMANDS: CommandItem[] = [
  { id: 'dashboard', label: 'Dashboard', description: 'Your main overview', href: '/student', icon: LayoutDashboard, category: 'Pages' },
  { id: 'courses', label: 'My Courses', description: 'View all enrolled courses', href: '/student/courses', icon: BookOpen, category: 'Pages' },
  { id: 'grades', label: 'Grades & Transcript', description: 'View your academic performance', href: '/student/grades', icon: GraduationCap, category: 'Pages' },
  { id: 'quizzes', label: 'Quizzes', description: 'Take and review quizzes', href: '/student/quizzes', icon: BrainCircuit, category: 'Pages' },
  { id: 'inbox', label: 'Messages', description: 'View and send messages', href: '/student/inbox', icon: MessageSquare, category: 'Pages' },
  { id: 'calendar', label: 'Timetable', description: 'View class schedule', href: '/student/calendar', icon: Clock, category: 'Pages' },
  { id: 'attendance', label: 'Attendance', description: 'Check attendance records', href: '/student/attendance', icon: FileText, category: 'Pages' },
  { id: 'community', label: 'Community', description: 'Connect with students', href: '/student/community', icon: Users, category: 'Pages' },
  { id: 'impact', label: 'Social Impact Projects', href: '/student/impact/projects', icon: Globe2, category: 'Pages' },
  { id: 'knowledge', label: 'Knowledge Hub', href: '/student/knowledge-hub', icon: BrainCircuit, category: 'Pages' },
  { id: 'skills', label: 'Skills & Badges', href: '/student/skills', icon: Trophy, category: 'Pages' },
  { id: 'personal', label: 'Personal Data', href: '/student/administrative/personal', icon: FileText, category: 'Administrative', keywords: ['profile', 'info'] },
  { id: 'documents', label: 'School Documents', href: '/student/administrative/documents', icon: FileText, category: 'Administrative' },
  { id: 'accounting', label: 'Accounting & Fees', href: '/student/administrative/accounting', icon: FileText, category: 'Administrative', keywords: ['fees', 'payment', 'tuition'] },
];

const TEACHER_COMMANDS: CommandItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/teacher', icon: LayoutDashboard, category: 'Pages' },
  { id: 'courses', label: 'My Courses', href: '/teacher/courses', icon: BookOpen, category: 'Pages' },
  { id: 'grades', label: 'Grades', href: '/teacher/grades', icon: GraduationCap, category: 'Pages' },
  { id: 'students', label: 'Students', href: '/teacher/students', icon: Users, category: 'Pages' },
  { id: 'inbox', label: 'Messages', href: '/teacher/inbox', icon: MessageSquare, category: 'Pages' },
];

function fuzzyMatch(str: string, pattern: string): boolean {
  const s = str.toLowerCase();
  const p = pattern.toLowerCase();
  if (s.includes(p)) return true;
  let si = 0, pi = 0;
  while (si < s.length && pi < p.length) {
    if (s[si] === p[pi]) pi++;
    si++;
  }
  return pi === p.length;
}

export function CommandPalette({ role = 'STUDENT' }: { role?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentItems, setRecentItems] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const commands = role === 'TEACHER' ? TEACHER_COMMANDS : STUDENT_COMMANDS;

  useEffect(() => {
    try {
      const stored = localStorage.getItem('universe_recent_commands');
      if (stored) setRecentItems(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const filtered = query.trim()
    ? commands.filter(cmd =>
        fuzzyMatch(cmd.label, query) ||
        fuzzyMatch(cmd.description ?? '', query) ||
        (cmd.keywords ?? []).some(k => fuzzyMatch(k, query))
      )
    : commands.filter(cmd => recentItems.includes(cmd.id)).slice(0, 5).length > 0
      ? commands.filter(cmd => recentItems.includes(cmd.id)).slice(0, 5)
      : commands.slice(0, 6);

  const grouped: Record<string, CommandItem[]> = {};
  for (const cmd of filtered) {
    if (!grouped[cmd.category]) grouped[cmd.category] = [];
    grouped[cmd.category].push(cmd);
  }

  const flatList = Object.values(grouped).flat();

  const navigate = useCallback((cmd: CommandItem) => {
    if (!cmd.href) return;
    const updated = [cmd.id, ...recentItems.filter(r => r !== cmd.id)].slice(0, 8);
    setRecentItems(updated);
    try { localStorage.setItem('universe_recent_commands', JSON.stringify(updated)); } catch {}
    setIsOpen(false);
    router.push(cmd.href);
  }, [recentItems, router]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, flatList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (flatList[selectedIndex]) navigate(flatList[selectedIndex]);
    }
  };

  useEffect(() => { setSelectedIndex(0); }, [query]);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.97 }}
            transition={{ type: 'spring', damping: 30, stiffness: 400 }}
            className="fixed top-[12%] left-1/2 -translate-x-1/2 w-full max-w-xl z-[210] px-4"
          >
            <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-zinc-200 dark:border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-200 dark:border-white/[0.06]">
                <Search className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search pages, courses, features..."
                  className="flex-1 bg-transparent text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none text-base"
                />
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-zinc-500">ESC</kbd>
              </div>

              <div className="max-h-[380px] overflow-y-auto p-2">
                {flatList.length === 0 ? (
                  <div className="py-10 text-center text-zinc-500">
                    <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No results for &quot;{query}&quot;</p>
                  </div>
                ) : (
                  Object.entries(grouped).map(([category, items]) => (
                    <div key={category} className="mb-3">
                      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                        {!query.trim() ? '⏱ Quick Access' : category}
                      </div>
                      {items.map(cmd => {
                        const globalIndex = flatList.indexOf(cmd);
                        const isSelected = globalIndex === selectedIndex;
                        return (
                          <motion.button
                            key={cmd.id}
                            whileHover={{ x: 2 }}
                            onClick={() => navigate(cmd)}
                            onMouseEnter={() => setSelectedIndex(globalIndex)}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left",
                              isSelected
                                ? "bg-indigo-500/10 border border-indigo-500/20"
                                : "hover:bg-zinc-100 dark:hover:bg-white/[0.04] border border-transparent"
                            )}
                          >
                            <div className={cn(
                              "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                              isSelected ? "bg-indigo-500/20 text-indigo-500" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                            )}>
                              <cmd.icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={cn("text-sm font-semibold truncate", isSelected ? "text-indigo-700 dark:text-indigo-400" : "text-zinc-900 dark:text-white")}>
                                {cmd.label}
                              </div>
                              {cmd.description && (
                                <div className="text-xs text-zinc-500 dark:text-zinc-500 truncate">{cmd.description}</div>
                              )}
                            </div>
                            <ChevronRight className={cn("w-4 h-4 flex-shrink-0 opacity-0 transition-opacity", isSelected && "opacity-100 text-indigo-500")} />
                          </motion.button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              <div className="px-4 py-2.5 border-t border-zinc-200 dark:border-white/[0.06] flex items-center justify-between bg-zinc-50/80 dark:bg-zinc-900/80">
                <div className="flex items-center gap-3 text-[10px] text-zinc-400">
                  <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-zinc-200 dark:bg-zinc-700 rounded font-mono">↑↓</kbd> navigate</span>
                  <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-zinc-200 dark:bg-zinc-700 rounded font-mono">↵</kbd> open</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <Command className="w-3 h-3" />
                  <span>K to toggle</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

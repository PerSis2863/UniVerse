'use client';
import { Bell, Search, Plus } from 'lucide-react';
import { useAuthStore } from '@/store/auth';

interface TopbarProps {
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
  rightNode?: React.ReactNode;
  leftNode?: React.ReactNode;
}

export function Topbar({ title, subtitle, action, rightNode, leftNode }: TopbarProps) {
  const { user } = useAuthStore();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <header className="sticky top-0 z-30 bg-[#09090b]/80 backdrop-blur-xl border-b border-white/[0.06] px-8 h-16 flex items-center justify-between">
      <div className="flex items-center gap-4">
        {leftNode}
        <div>
          <h1 className="font-bold text-white text-lg leading-tight">{title}</h1>
          {subtitle && <p className="text-xs text-zinc-500">{subtitle ?? `${greeting}, ${user?.name?.split(' ')[0]}!`}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {rightNode}
        <button className="btn-ghost p-2 relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500" />
        </button>
        {action && (
          <button onClick={action.onClick} className="btn-primary flex items-center gap-2 text-sm py-2">
            <Plus className="w-3.5 h-3.5" />
            {action.label}
          </button>
        )}
      </div>
    </header>
  );
}

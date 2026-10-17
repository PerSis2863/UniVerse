'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { CalendarDays, CalendarPlus, FileText, KanbanSquare, MessageSquarePlus, QrCode, Sparkles, Table2, type LucideIcon } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { haptic } from '@/lib/haptics';

// The phone tab bar's "+" (Stage 5 · Q8): start a message, a document, a spreadsheet, a task board,
// a call or (students and teachers, Q12) an event on the calendar, ask the AI assistant, or scan a
// QR code, from anywhere.

const QrScanSheet = dynamic(() => import('./QrScanSheet'), { ssr: false });

export function QuickCreate({ base, onClose }: { base: string; onClose: () => void }) {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const go = (href: string) => { haptic('tap'); onClose(); router.push(href); };
  const items: { label: string; icon: LucideIcon; tone: string; run: () => void }[] = [
    { label: 'Message', icon: MessageSquarePlus, tone: 'from-sky-500 to-indigo-500', run: () => go(`${base}/inbox?new=chat`) },
    { label: 'Document', icon: FileText, tone: 'from-indigo-500 to-violet-500', run: () => go('/docs?new=doc') },
    { label: 'Spreadsheet', icon: Table2, tone: 'from-emerald-500 to-teal-500', run: () => go('/docs?new=sheet') },
    { label: 'Task board', icon: KanbanSquare, tone: 'from-amber-500 to-orange-500', run: () => go('/tasks?new=1') },
    { label: 'Call', icon: CalendarPlus, tone: 'from-rose-500 to-pink-500', run: () => go('/calls?schedule=1') },
    ...(base === '/student' || base === '/teacher' ? [{ label: 'Event', icon: CalendarDays, tone: 'from-teal-500 to-emerald-600', run: () => go(`${base}/calendar?new=1`) }] : []),
    { label: 'Ask AI', icon: Sparkles, tone: 'from-fuchsia-500 to-purple-500', run: () => { haptic('tap'); onClose(); window.dispatchEvent(new CustomEvent('universe:open-assistant')); } },
    { label: 'Scan QR', icon: QrCode, tone: 'from-zinc-600 to-zinc-800', run: () => { haptic('tap'); setScanning(true); } },
  ];
  if (scanning) return <QrScanSheet onClose={() => { setScanning(false); onClose(); }} />;
  return (
    <Sheet title="Quick create" onClose={onClose}>
      <div className="grid grid-cols-4 gap-1.5">
        {items.map((it) => (
          <button key={it.label} type="button" onClick={it.run} className="pressable flex flex-col items-center gap-2 px-1 py-3 rounded-2xl hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
            <span className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${it.tone} text-white flex items-center justify-center shadow-md`}><it.icon className="w-5 h-5" /></span>
            <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{it.label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

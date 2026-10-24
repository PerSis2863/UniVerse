'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { CalendarPlus, FileText, KanbanSquare, Megaphone, MessageSquarePlus, QrCode, Sparkles, Table2, type LucideIcon } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { haptic } from '@/lib/haptics';
import { inboxFor } from '@/lib/business';
import { useAuthStore } from '@/store/auth';

// The phone tab bar's "+" (Stage 5 · Q8): start a message, a document, a spreadsheet, a task board,
// a call or a Trace campaign, ask the AI assistant, or scan a QR code (a product passport), from anywhere.

const QrScanSheet = dynamic(() => import('./QrScanSheet'), { ssr: false });

export function QuickCreate({ onClose }: { base?: string; onClose: () => void }) {
  const router = useRouter();
  const inbox = inboxFor(useAuthStore((s) => s.user?.role));
  const [scanning, setScanning] = useState(false);
  const go = (href: string) => { haptic('tap'); onClose(); router.push(href); };
  const items: { label: string; icon: LucideIcon; tone: string; run: () => void }[] = [
    { label: 'Message', icon: MessageSquarePlus, tone: 'from-indigo-600 to-fuchsia-600', run: () => go(`${inbox}?new=chat`) },
    { label: 'Document', icon: FileText, tone: 'from-indigo-500 to-violet-500', run: () => go('/docs?new=doc') },
    { label: 'Spreadsheet', icon: Table2, tone: 'from-indigo-400 to-indigo-600', run: () => go('/docs?new=sheet') },
    { label: 'Task board', icon: KanbanSquare, tone: 'from-fuchsia-400 to-fuchsia-600', run: () => go('/tasks?new=1') },
    { label: 'Call', icon: CalendarPlus, tone: 'from-rose-500 to-pink-500', run: () => go('/calls?schedule=1') },
    { label: 'Campaign', icon: Megaphone, tone: 'from-pink-500 to-fuchsia-600', run: () => go('/trace/campaigns') },
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

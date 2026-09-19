import { useState } from 'react';
import { motion } from 'framer-motion';
import { PenTool, Square, Circle, Type, Eraser, Undo, Redo, Download, Share2, MousePointer2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function CollaborationWhiteboard() {
  const [activeTool, setActiveTool] = useState('pen');

  const tools = [
    { id: 'select', icon: MousePointer2, label: 'Select (V)' },
    { id: 'pen', icon: PenTool, label: 'Pen (P)' },
    { id: 'square', icon: Square, label: 'Rectangle (R)' },
    { id: 'circle', icon: Circle, label: 'Ellipse (O)' },
    { id: 'text', icon: Type, label: 'Text (T)' },
    { id: 'eraser', icon: Eraser, label: 'Eraser (E)' },
  ];

  return (
    <div className="flex flex-col h-[600px] bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden relative shadow-sm">
      {/* Toolbar */}
      <div className="h-14 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          {tools.map(tool => (
            <button
              key={tool.id}
              title={tool.label}
              onClick={() => setActiveTool(tool.id)}
              className={cn(
                "w-9 h-9 flex items-center justify-center rounded-lg transition-colors",
                activeTool === tool.id
                  ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400"
                  : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white"
              )}
            >
              <tool.icon className="w-4 h-4" />
            </button>
          ))}
          <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 mx-2" />
          <button className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><Undo className="w-4 h-4" /></button>
          <button className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><Redo className="w-4 h-4" /></button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            <div className="w-8 h-8 rounded-full border-2 border-white dark:border-zinc-900 bg-emerald-500 flex items-center justify-center text-[10px] font-bold text-white z-20">You</div>
            <div className="w-8 h-8 rounded-full border-2 border-white dark:border-zinc-900 bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white z-10">JS</div>
            <div className="w-8 h-8 rounded-full border-2 border-white dark:border-zinc-900 bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white z-0">AL</div>
          </div>
          <button onClick={() => toast.success('Sharing link copied!')} className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"><Share2 className="w-3.5 h-3.5" /> Share</button>
          <button onClick={() => toast.info('Exporting canvas...')} className="btn-primary py-1.5 px-3 text-xs flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> Export</button>
        </div>
      </div>

      {/* Canvas Area (Mockup) */}
      <div className="flex-1 relative bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-center overflow-hidden cursor-crosshair">
        {/* Collaborative Cursor Mockups */}
        <motion.div animate={{ x: [0, 50, -20, 0], y: [0, -30, 40, 0] }} transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }} className="absolute z-10 pointer-events-none">
          <MousePointer2 className="w-5 h-5 text-rose-500 fill-rose-500" style={{ transform: 'rotate(-20deg)' }} />
          <div className="bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm mt-1 whitespace-nowrap">Alice L.</div>
        </motion.div>
        <motion.div animate={{ x: [0, -80, 10, 0], y: [0, 60, -10, 0] }} transition={{ repeat: Infinity, duration: 7, ease: "easeInOut" }} className="absolute z-10 pointer-events-none" style={{ left: '60%', top: '30%' }}>
          <MousePointer2 className="w-5 h-5 text-indigo-500 fill-indigo-500" style={{ transform: 'rotate(-20deg)' }} />
          <div className="bg-indigo-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm mt-1 whitespace-nowrap">John S.</div>
        </motion.div>

        {/* Dummy Canvas Drawings */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 800 600">
          <path d="M 200 200 Q 300 100 400 200 T 600 200" stroke="currentColor" strokeWidth="4" fill="none" className="text-indigo-500" />
          <rect x="250" y="250" width="150" height="100" stroke="currentColor" strokeWidth="4" fill="none" className="text-rose-500" />
          <circle cx="500" cy="350" r="60" stroke="currentColor" strokeWidth="4" fill="none" className="text-amber-500" />
          <text x="350" y="450" fill="currentColor" className="text-zinc-800 dark:text-zinc-200 text-2xl font-bold font-sans">System Architecture</text>
        </svg>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
           <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm p-4 rounded-2xl shadow-xl text-center border border-zinc-200 dark:border-zinc-800">
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-3">
                 <PenTool className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-zinc-900 dark:text-white">Live Collaboration Engine</h3>
              <p className="text-xs text-zinc-500 mt-1 max-w-[250px]">Canvas connected via WebSockets. Start drawing to sync with other members in real-time.</p>
           </div>
        </div>
      </div>
    </div>
  );
}

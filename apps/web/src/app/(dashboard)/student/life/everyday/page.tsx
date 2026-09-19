'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Utensils, Bus, ShoppingBag, Coffee } from 'lucide-react';
import { motion } from 'framer-motion';

const modules = [
  { title: 'Campus Dining', subtitle: 'Menus and meal plans', icon: Utensils, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  { title: 'Transport', subtitle: 'Shuttle schedules and transit', icon: Bus, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { title: 'Campus Store', subtitle: 'Merch and supplies', icon: ShoppingBag, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { title: 'Cafes', subtitle: 'Coffee shops and hours', icon: Coffee, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
];

export default function EverydayLifePage() {
  return (
    <>
      <Topbar 
        title="Everyday Life" 
        subtitle="Dining, transport, and campus amenities" 
      />
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="space-y-8">
          
          {/* Top Modules */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {modules.map((mod, i) => (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 }}
                key={i}
                className="bg-[#0d1117] border border-white/[0.08] rounded-3xl p-6 flex flex-col items-center justify-center text-center hover:bg-white/[0.02] hover:border-indigo-500/30 transition-all cursor-pointer group"
              >
                <div className={`w-14 h-14 rounded-2xl ${mod.bg} ${mod.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <mod.icon className="w-7 h-7" />
                </div>
                <h3 className="font-bold text-white mb-1">{mod.title}</h3>
                <p className="text-xs text-zinc-400">{mod.subtitle}</p>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Dining Menu */}
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="space-y-4"
            >
              <h2 className="text-lg font-bold text-white">Today's Dining Menu</h2>
              <div className="bg-[#0d1117] border border-white/[0.08] rounded-3xl p-6">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/[0.06]">
                  <h3 className="font-bold text-white">Main Dining Hall</h3>
                  <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/20">
                    Open till 9 PM
                  </span>
                </div>
                <div className="space-y-4">
                  {[
                    { item: 'Grilled Salmon', type: 'Lunch/Dinner' },
                    { item: 'Vegan Pasta', type: 'Lunch/Dinner' },
                    { item: 'Salad Bar', type: 'All Day' },
                  ].map((meal, idx) => (
                    <div key={idx} className="flex justify-between items-center text-sm">
                      <span className="text-zinc-300 font-medium">{meal.item}</span>
                      <span className="text-zinc-500">{meal.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Shuttle Schedule */}
            <motion.div 
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
              className="space-y-4"
            >
              <h2 className="text-lg font-bold text-white">Shuttle Schedule</h2>
              <div className="bg-[#0d1117] border border-white/[0.08] rounded-3xl p-6">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/[0.06]">
                  <h3 className="font-bold text-white">Campus Loop (Red Line)</h3>
                  <span className="text-xs text-zinc-400 font-medium">Next in 5 min</span>
                </div>
                
                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px before:h-full before:w-0.5 before:bg-zinc-800">
                  {[
                    { stop: 'Student Union', time: 'Departed 10:15 AM', status: 'past', color: 'bg-emerald-500' },
                    { stop: 'Engineering Quad', time: 'Arriving 10:20 AM', status: 'current', color: 'bg-indigo-500', active: true },
                    { stop: 'North Dorms', time: 'Scheduled 10:28 AM', status: 'future', color: 'bg-zinc-700' },
                  ].map((stop, idx) => (
                    <div key={idx} className="relative flex items-start gap-4 z-10 pl-8">
                      <div className={`absolute left-0 w-4 h-4 rounded-full border-4 border-[#0d1117] ${stop.color} ${stop.active ? 'ring-2 ring-indigo-500/50' : ''}`} />
                      <div>
                        <div className={`text-sm font-bold ${stop.active ? 'text-white' : 'text-zinc-300'}`}>{stop.stop}</div>
                        <div className={`text-xs mt-1 ${stop.active ? 'text-indigo-400' : 'text-zinc-500'}`}>{stop.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>

        </div>
      </div>
    </>
  );
}

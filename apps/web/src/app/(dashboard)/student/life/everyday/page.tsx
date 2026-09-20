'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Utensils, Bus, ShoppingBag, Coffee, X, Map, CreditCard, Clock, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

const modules = [
  { id: 'dining', title: 'Campus Dining', subtitle: 'Menus and meal plans', icon: Utensils, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'hover:border-orange-500/50' },
  { id: 'transport', title: 'Transport', subtitle: 'Shuttle schedules and transit', icon: Bus, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'hover:border-emerald-500/50' },
  { id: 'store', title: 'Campus Store', subtitle: 'Merch and supplies', icon: ShoppingBag, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'hover:border-blue-500/50' },
  { id: 'cafes', title: 'Cafes', subtitle: 'Coffee shops and hours', icon: Coffee, color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'hover:border-yellow-500/50' },
];

export default function EverydayLifePage() {
  const [activeModal, setActiveModal] = useState<string | null>(null);

  const renderModalContent = () => {
    switch (activeModal) {
      case 'dining':
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/[0.02] border border-white/[0.05] p-6 rounded-2xl">
                <h4 className="text-zinc-400 text-sm font-medium mb-1">Meal Plan Balance</h4>
                <div className="text-3xl font-bold text-white">142 <span className="text-lg text-zinc-500 font-normal">swipes</span></div>
                <div className="mt-4 flex items-center gap-2 text-sm text-emerald-400 font-medium">
                  <CreditCard className="w-4 h-4" /> Add Dining Dollars
                </div>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.05] p-6 rounded-2xl">
                <h4 className="text-zinc-400 text-sm font-medium mb-1">Dining Dollars</h4>
                <div className="text-3xl font-bold text-white">$450.00</div>
                <div className="mt-4 text-sm text-zinc-500">Refreshes next semester</div>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Utensils className="w-5 h-5 text-orange-500" /> Main Dining Hall - Today</h3>
              <div className="space-y-3">
                {['Breakfast (7AM - 10AM)', 'Lunch (11AM - 2PM)', 'Dinner (5PM - 9PM)'].map((meal, i) => (
                  <div key={i} className="p-4 border border-zinc-800 rounded-xl flex items-center justify-between hover:bg-white/[0.02] cursor-pointer transition-colors">
                    <span className="font-medium text-zinc-200">{meal}</span>
                    <ChevronRight className="w-4 h-4 text-zinc-500" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      case 'transport':
        return (
          <div className="space-y-8">
            <div className="h-48 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
              <div className="relative flex flex-col items-center">
                <Map className="w-8 h-8 text-emerald-500 mb-2" />
                <span className="text-zinc-400 font-medium">Interactive Live Map Unavailable</span>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-4">Active Routes</h3>
              <div className="space-y-4">
                {[
                  { name: 'Red Line (Campus Loop)', status: 'On Time', next: '5 min' },
                  { name: 'Blue Line (Downtown)', status: 'Delayed', next: '12 min' },
                  { name: 'Green Line (Research Park)', status: 'On Time', next: '8 min' }
                ].map((route, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                    <div>
                      <div className="font-bold text-white">{route.name}</div>
                      <div className={`text-sm ${route.status === 'On Time' ? 'text-emerald-400' : 'text-orange-400'}`}>{route.status}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-zinc-500">Next bus</div>
                      <div className="font-bold text-white">{route.next}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      case 'store':
        return (
          <div className="space-y-6">
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
              {['Apparel', 'Textbooks', 'Supplies', 'Tech'].map((cat, i) => (
                <button key={i} className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${i === 0 ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>{cat}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { name: 'University Hoodie', price: '$45.00', img: '👕' },
                { name: 'Classic Cap', price: '$20.00', img: '🧢' },
                { name: 'Travel Mug', price: '$15.00', img: '☕' },
                { name: 'Backpack', price: '$65.00', img: '🎒' }
              ].map((item, i) => (
                <div key={i} className="border border-zinc-800 rounded-xl p-4 bg-white/[0.01] hover:bg-white/[0.03] transition-colors cursor-pointer text-center">
                  <div className="text-4xl mb-3">{item.img}</div>
                  <div className="font-bold text-white text-sm">{item.name}</div>
                  <div className="text-blue-400 text-sm font-medium mt-1">{item.price}</div>
                </div>
              ))}
            </div>
          </div>
        );
      case 'cafes':
        return (
          <div className="space-y-4">
            {[
              { name: 'Library Cafe', status: 'Very Busy', hours: 'Closes at 11 PM' },
              { name: 'Student Union Roasters', status: 'Moderate', hours: 'Closes at 8 PM' },
              { name: 'Science Building Kiosk', status: 'Quiet', hours: 'Closes at 5 PM' },
            ].map((cafe, i) => (
              <div key={i} className="flex items-center justify-between p-5 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                <div>
                  <h3 className="font-bold text-white flex items-center gap-2"><Coffee className="w-4 h-4 text-yellow-500" /> {cafe.name}</h3>
                  <div className="text-sm text-zinc-500 flex items-center gap-1 mt-1"><Clock className="w-3 h-3" /> {cafe.hours}</div>
                </div>
                <div className="text-right">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${cafe.status === 'Quiet' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : cafe.status === 'Moderate' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
                    {cafe.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  const getModalConfig = () => {
    return modules.find(m => m.id === activeModal);
  };

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
                onClick={() => setActiveModal(mod.id)}
                className={`bg-[#0d1117] border border-white/[0.08] rounded-3xl p-6 flex flex-col items-center justify-center text-center hover:bg-white/[0.02] transition-all cursor-pointer group ${mod.border}`}
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

      <AnimatePresence>
        {activeModal && getModalConfig() && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0d1117] border border-zinc-800 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/30">
                <div className="flex items-center gap-3">
                  <div className={`p-2 ${getModalConfig()?.bg} ${getModalConfig()?.color} rounded-lg`}>
                    {(() => {
                      const Icon = getModalConfig()!.icon;
                      return <Icon className="w-5 h-5" />;
                    })()}
                  </div>
                  <h2 className="text-xl font-bold text-white">{getModalConfig()?.title}</h2>
                </div>
                <button onClick={() => setActiveModal(null)} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-8 overflow-y-auto">
                {renderModalContent()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

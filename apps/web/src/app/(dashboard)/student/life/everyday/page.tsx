'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Utensils, Bus, ShoppingBag, Coffee } from 'lucide-react';

export default function EverydayLifePage() {
  const amenities = [
    { name: 'Campus Dining', icon: Utensils, desc: 'Menus and meal plans', color: 'text-orange-400', bg: 'bg-orange-500/20' },
    { name: 'Transport', icon: Bus, desc: 'Shuttle schedules and transit', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
    { name: 'Campus Store', icon: ShoppingBag, desc: 'Merch and supplies', color: 'text-blue-400', bg: 'bg-blue-500/20' },
    { name: 'Cafes', icon: Coffee, desc: 'Coffee shops and hours', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  ];

  return (
    <>
      <Topbar title="Everyday Life" subtitle="Dining, transport, and campus amenities" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            {amenities.map(item => (
              <div key={item.name} className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-xl text-center hover:border-zinc-700 transition-colors cursor-pointer">
                <div className={`w-12 h-12 ${item.bg} mx-auto rounded-full flex items-center justify-center mb-4`}>
                  <item.icon className={`w-6 h-6 ${item.color}`} />
                </div>
                <h3 className="font-semibold text-white mb-1">{item.name}</h3>
                <p className="text-xs text-zinc-400">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="font-bold text-lg text-white">Today's Dining Menu</h3>
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
                <div className="flex justify-between items-center mb-4 pb-4 border-b border-zinc-800">
                  <h4 className="font-semibold text-white">Main Dining Hall</h4>
                  <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">Open till 9 PM</span>
                </div>
                <ul className="space-y-3">
                  <li className="flex justify-between text-sm">
                    <span className="text-zinc-300">Grilled Salmon</span>
                    <span className="text-zinc-500">Lunch/Dinner</span>
                  </li>
                  <li className="flex justify-between text-sm">
                    <span className="text-zinc-300">Vegan Pasta</span>
                    <span className="text-zinc-500">Lunch/Dinner</span>
                  </li>
                  <li className="flex justify-between text-sm">
                    <span className="text-zinc-300">Salad Bar</span>
                    <span className="text-zinc-500">All Day</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-bold text-lg text-white">Shuttle Schedule</h3>
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
                 <div className="flex justify-between items-center mb-4 pb-4 border-b border-zinc-800">
                  <h4 className="font-semibold text-white">Campus Loop (Red Line)</h4>
                  <span className="text-xs font-medium text-zinc-400">Next in 5 min</span>
                </div>
                <div className="relative pl-6 space-y-6 before:absolute before:inset-y-0 before:left-[11px] before:w-[2px] before:bg-zinc-800">
                  <div className="relative">
                    <div className="absolute -left-[29px] top-1 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-zinc-900" />
                    <div className="text-sm font-medium text-white">Student Union</div>
                    <div className="text-xs text-zinc-500">Departed 10:15 AM</div>
                  </div>
                  <div className="relative">
                    <div className="absolute -left-[29px] top-1 w-3 h-3 rounded-full bg-indigo-500 ring-4 ring-zinc-900 animate-pulse" />
                    <div className="text-sm font-medium text-white">Engineering Quad</div>
                    <div className="text-xs text-indigo-400">Arriving 10:20 AM</div>
                  </div>
                  <div className="relative">
                    <div className="absolute -left-[29px] top-1 w-3 h-3 rounded-full bg-zinc-700 ring-4 ring-zinc-900" />
                    <div className="text-sm font-medium text-white">North Dorms</div>
                    <div className="text-xs text-zinc-500">Scheduled 10:28 AM</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

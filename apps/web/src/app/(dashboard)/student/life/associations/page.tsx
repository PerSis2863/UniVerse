'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Search, Users, ExternalLink, Globe } from 'lucide-react';
import { motion } from 'framer-motion';

const associations = [
  { id: 1, name: 'Computer Science Society', category: 'Academic', members: 342, description: 'The official student chapter for CS majors. We host hackathons, tech talks, and networking events.', color: 'from-blue-500 to-indigo-600', icon: '💻' },
  { id: 2, name: 'Green Campus Initiative', category: 'Sustainability', members: 128, description: 'Dedicated to making our campus carbon-neutral by 2030 through advocacy and local action.', color: 'from-emerald-500 to-teal-600', icon: '🌱' },
  { id: 3, name: 'Robotics Club', category: 'Engineering', members: 89, description: 'Build, program, and compete with autonomous robots in national collegiate competitions.', color: 'from-orange-500 to-red-600', icon: '🤖' },
  { id: 4, name: 'Debate Society', category: 'Arts & Humanities', members: 215, description: 'Fostering critical thinking and public speaking through weekly debates and workshops.', color: 'from-purple-500 to-pink-600', icon: '🎙️' },
  { id: 5, name: 'Investment Group', category: 'Business', members: 156, description: 'Learn about financial markets and manage a real student-run investment portfolio.', color: 'from-yellow-400 to-amber-600', icon: '📈' },
  { id: 6, name: 'International Students Union', category: 'Cultural', members: 450, description: 'A home away from home. Celebrating diversity and supporting international students.', color: 'from-cyan-500 to-blue-600', icon: '🌍' },
];

export default function AssociationsPage() {
  return (
    <>
      <Topbar 
        title="Associations" 
        subtitle="Discover and join student clubs" 
      />
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-8">
          
          {/* Search Bar */}
          <div className="relative group">
            <div className="absolute inset-0 bg-indigo-500/10 rounded-2xl blur-xl transition-all group-hover:bg-indigo-500/20" />
            <div className="relative flex items-center bg-[#0d1117] border border-white/[0.08] rounded-2xl p-2 shadow-2xl">
              <div className="pl-4 pr-3 text-zinc-500">
                <Search className="w-5 h-5" />
              </div>
              <input 
                type="text" 
                placeholder="Search associations..." 
                className="w-full bg-transparent border-none text-white focus:ring-0 placeholder:text-zinc-600 py-3"
              />
              <button className="px-6 py-2 rounded-xl bg-white text-black font-bold hover:scale-105 transition-transform ml-2 shrink-0">
                Search
              </button>
            </div>
          </div>

          {/* Categories */}
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {['All', 'Academic', 'Cultural', 'Engineering', 'Sustainability', 'Arts & Humanities', 'Business'].map((cat, i) => (
              <button 
                key={cat}
                className={`px-5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  i === 0 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 border border-indigo-500/50' 
                    : 'bg-white/[0.03] text-zinc-400 border border-white/[0.06] hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pt-4">
            {associations.map((club, i) => (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                key={club.id}
                className="group relative bg-[#0d1117] border border-white/[0.06] rounded-3xl p-6 hover:border-indigo-500/30 transition-all overflow-hidden flex flex-col h-full"
              >
                <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${club.color} opacity-10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:opacity-20 transition-opacity`} />
                
                <div className="flex items-start justify-between mb-4 relative z-10">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${club.color} flex items-center justify-center text-2xl shadow-lg`}>
                    {club.icon}
                  </div>
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white/[0.05] text-zinc-300 border border-white/[0.05]">
                    {club.category}
                  </span>
                </div>

                <div className="relative z-10 mb-4 flex-1">
                  <h3 className="text-xl font-bold text-white mb-2 group-hover:text-indigo-400 transition-colors">
                    {club.name}
                  </h3>
                  <p className="text-zinc-400 text-sm leading-relaxed line-clamp-3">
                    {club.description}
                  </p>
                </div>

                <div className="relative z-10 flex items-center justify-between mt-auto pt-4 border-t border-white/[0.05]">
                  <div className="flex items-center gap-1.5 text-zinc-400 text-sm">
                    <Users className="w-4 h-4" />
                    <span>{club.members}</span>
                  </div>
                  <button className="flex items-center gap-1.5 text-indigo-400 text-sm font-semibold hover:text-indigo-300 transition-colors">
                    Join <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>

        </div>
      </div>
    </>
  );
}

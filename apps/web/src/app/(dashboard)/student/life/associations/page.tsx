'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Search, Users, ExternalLink, Globe } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { RequestAssociationModal } from './RequestAssociationModal';

export default function AssociationsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const { data: associationsData, isLoading, mutate } = useSWR('/associations', fetcher);
  const { data: myMemberships, mutate: mutateMemberships } = useSWR('/associations/my-memberships', fetcher);

  const associations = associationsData || [];
  const membershipsSet = new Set(myMemberships?.map((m: any) => m.associationId) || []);

  const filteredAssociations = associations.filter((club: any) => {
    const matchesSearch = club.name.toLowerCase().includes(searchQuery.toLowerCase()) || club.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'All' || club.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const handleJoin = async (id: string, name: string) => {
    try {
      const api = (await import('@/lib/fetcher')).api;
      await api.post(`/associations/${id}/join`);
      toast.success(`Joined ${name}!`);
    } catch (e: any) {
      toast.error(e.response?.data?.message || `Failed to join ${name}`);
    }
  };

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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search associations..." 
                className="w-full bg-transparent border-none text-white focus:ring-0 placeholder:text-zinc-600 py-3"
              />
              <button 
                onClick={() => toast.success('Search results updated')}
                className="px-6 py-2 rounded-xl bg-white text-black font-bold hover:scale-105 transition-transform ml-2 shrink-0"
              >
                Search
              </button>
            </div>
          </div>
          
          <div className="flex justify-end">
            <button 
              onClick={() => setIsRequestModalOpen(true)}
              className="px-5 py-2.5 rounded-xl font-medium bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 border border-indigo-500/30 transition-colors flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Request New Association
            </button>
          </div>

          {/* Categories */}
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {['All', 'Academic', 'Cultural', 'Engineering', 'Sustainability', 'Arts & Humanities', 'Business'].map((cat) => (
              <button 
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  activeCategory === cat 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 border border-indigo-500/50' 
                    : 'bg-white/[0.03] text-zinc-400 border border-white/[0.06] hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Grid */}
          {isLoading ? (
            <div className="py-12 text-center text-zinc-500">Loading associations...</div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pt-4">
            {filteredAssociations.map((club: any, i: number) => (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                key={club.id}
                className="group relative bg-[#0d1117] border border-white/[0.06] rounded-3xl p-6 hover:border-indigo-500/30 transition-all overflow-hidden flex flex-col h-full"
              >
                <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-500 to-purple-600 opacity-10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:opacity-20 transition-opacity`} />
                
                <div className="flex items-start justify-between mb-4 relative z-10">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl shadow-lg`}>
                    ✨
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
                  <button 
                    onClick={() => handleJoin(club.id, club.name)}
                    className="flex items-center gap-1.5 text-indigo-400 text-sm font-semibold hover:text-indigo-300 transition-colors disabled:opacity-50"
                    disabled={membershipsSet.has(club.id)}
                  >
                    {membershipsSet.has(club.id) ? 'Joined' : <>Join <ExternalLink className="w-3.5 h-3.5" /></>}
                  </button>
                </div>
              </motion.div>
            ))}
            
            {filteredAssociations.length === 0 && (
              <div className="col-span-full py-12 text-center text-zinc-500">
                No associations found matching your criteria.
              </div>
            )}
          </div>
          )}

        </div>
      </div>
      
      {isRequestModalOpen && (
        <RequestAssociationModal 
          onClose={() => setIsRequestModalOpen(false)} 
          onSuccess={() => {
            setIsRequestModalOpen(false);
            mutate();
          }} 
        />
      )}
    </>
  );
}

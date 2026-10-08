'use client';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { errorMessage } from '@/lib/api';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, LIFE_TABS } from '@/components/layout/SectionTabs';
import { Search, Users, ExternalLink,  MessagesSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { authedJson } from '@/lib/authed-fetch';
import { m as motion } from 'framer-motion';
import { useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { RequestAssociationModal } from './RequestAssociationModal';
import { TabPill } from '@/components/ui/Glide';

interface Club { id: string; name: string; description: string; category: string; status: string; members?: number; _count?: { memberships?: number } }

export default function AssociationsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const { data: associationsData, isLoading, mutate } = useSWR<Club[]>('/associations', fetcher);
  const { data: myMemberships, mutate: mutateMemberships } = useSWR<{ associationId: string; role: string; association?: { communityId?: string | null } }[]>('/associations/my-memberships', fetcher);

  const associations = associationsData || [];
  const membershipsSet = new Set(myMemberships?.map((m) => m.associationId) || []);
  // A club's own space (upgrade 7): a Community with its members, made by the founder.
  const router = useRouter();
  const [making, setMaking] = useState<string | null>(null);
  const mine = (id: string) => myMemberships?.find((m) => m.associationId === id);
  const clubSpace = async (id: string) => {
    setMaking(id);
    try {
      const r = await authedJson<{ created: boolean }>(`/api/campus/clubs/${id}/space`, { method: 'POST' });
      if (r.created) toast.success('Club space created with your members. New members join it automatically.');
      void mutateMemberships();
      router.push('/student/inbox?space=communities');
    } catch (e) { toast.error((e as Error).message); } finally { setMaking(null); }
  };

  const filteredAssociations = associations.filter((club) => {
    const matchesSearch = club.name.toLowerCase().includes(searchQuery.toLowerCase()) || club.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'All' || club.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const handleJoin = async (id: string, name: string) => {
    try {
      const api = (await import('@/lib/fetcher')).api;
      await api.post(`/associations/${id}/join`);
      toast.success(`Joined ${name}!`);
    } catch (e) {
      toast.error(errorMessage(e, `Failed to join ${name}`));
    }
  };

  return (
    <>
      <Topbar 
        title="Associations" 
        subtitle="Discover and join student clubs" 
      />
      <SectionTabs tabs={LIFE_TABS} />
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-8">
          
          {/* Search Bar */}
          <div className="relative group">
            <div className="absolute inset-0 bg-indigo-500/10 rounded-2xl blur-xl transition-all group-hover:bg-indigo-500/20" />
            <div className="relative flex items-center bg-[#121830] border border-white/[0.08] rounded-2xl p-2 shadow-2xl">
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
                onClick={(e) => ((e.currentTarget.previousElementSibling as HTMLInputElement | null)?.focus())}
                className="px-6 py-2 rounded-xl bg-white text-black font-bold hover:scale-105 transition-transform ml-2 shrink-0"
              >
                Search
              </button>
            </div>
          </div>
          
          <div className="flex justify-end">
            <button 
              onClick={() => setIsRequestModalOpen(true)}
              className="px-5 py-2.5 rounded-xl font-medium bg-indigo-600/20 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-600/30 border border-indigo-500/30 transition-colors flex items-center gap-2"
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
                className={`relative isolate px-5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  activeCategory === cat 
                    ? 'border text-white border-transparent' 
                    : 'bg-white/[0.03] text-zinc-400 border border-white/[0.06] hover:bg-white/[0.06] hover:text-white'
                }`}
              >{activeCategory === cat && <TabPill id="udent-life-associations-page-0" />}
                {cat}
              </button>
            ))}
          </div>

          {/* Grid */}
          {isLoading ? (
            <ContentSkeleton variant="grid" />
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pt-4">
            {filteredAssociations.map((club, i) => (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 6) * 0.03 }}
                key={club.id}
                className="group relative bg-[#121830] border border-white/[0.06] rounded-3xl p-6 hover:border-indigo-500/30 transition-all overflow-hidden flex flex-col h-full"
              >
                <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-500 to-purple-600 opacity-10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:opacity-20 transition-opacity`} />
                
                <div className="flex items-start justify-between mb-4 relative z-10">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl shadow-lg`}>
                    ✨
                  </div>
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white/[0.05] text-zinc-600 dark:text-zinc-300 border border-white/[0.05]">
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
                    <span>{club.members ?? club._count?.memberships ?? 0}</span>
                  </div>
                  {mine(club.id)?.association?.communityId ? (
                    <button type="button" onClick={() => router.push('/student/inbox?space=communities')} className="text-sm font-semibold text-fuchsia-700 dark:text-fuchsia-400 hover:text-fuchsia-500 dark:hover:text-fuchsia-300 inline-flex items-center gap-1"><MessagesSquare className="w-4 h-4" /> Club space</button>
                  ) : mine(club.id)?.role === 'FOUNDER' && club.status === 'ACTIVE' ? (
                    <button type="button" disabled={making === club.id} onClick={() => void clubSpace(club.id)} className="text-sm font-semibold text-fuchsia-700 dark:text-fuchsia-400 hover:text-fuchsia-500 dark:hover:text-fuchsia-300 inline-flex items-center gap-1 disabled:opacity-50"><MessagesSquare className="w-4 h-4" /> Create club space</button>
                  ) : null}
                  <button 
                    onClick={() => handleJoin(club.id, club.name)}
                    className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-400 text-sm font-semibold hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors disabled:opacity-50"
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

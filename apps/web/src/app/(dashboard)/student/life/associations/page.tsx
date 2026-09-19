'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Users, Calendar, MapPin, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export default function AssociationsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [associations, setAssociations] = useState<any[]>([]);
  const [myMemberships, setMyMemberships] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAssociations();
  }, []);

  const fetchAssociations = async () => {
    try {
      const [assocRes, memRes] = await Promise.all([
        api.get('/associations'),
        api.get('/associations/my-memberships')
      ]);
      setAssociations(assocRes.data);
      setMyMemberships(new Set(memRes.data.map((m: any) => m.associationId)));
    } catch (error) {
      toast.error('Failed to load associations');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (id: string, name: string) => {
    try {
      await api.post(`/associations/${id}/join`);
      setMyMemberships(new Set([...myMemberships, id]));
      toast.success(`Joined ${name}!`);
    } catch (error) {
      toast.error('Failed to join association');
    }
  };

  const filteredAssociations = associations.filter(a => 
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <Topbar title="Associations" subtitle="Discover and join student clubs" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-600 dark:text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search associations..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {loading ? (
            <div className="text-zinc-600 dark:text-zinc-400">Loading associations...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredAssociations.map(assoc => {
                const isMember = myMemberships.has(assoc.id);
                return (
                  <div key={assoc.id} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-6 rounded-xl hover:border-zinc-700 transition-colors flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-semibold text-zinc-900 dark:text-white">{assoc.name}</h3>
                        <span className="text-xs font-medium text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-full mt-2 inline-block">
                          {assoc.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-zinc-600 dark:text-zinc-400 text-sm bg-zinc-100 dark:bg-zinc-800/50 px-3 py-1 rounded-full">
                        <Users className="w-4 h-4" /> {assoc.members}
                      </div>
                    </div>
                    
                    <div className="space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800/50 flex-1">
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">{assoc.description}</p>
                    </div>
                    
                    <button 
                      onClick={() => !isMember && handleJoin(assoc.id, assoc.name)} 
                      disabled={isMember}
                      className={`mt-6 w-full py-2 font-medium rounded-lg transition-colors ${
                        isMember 
                          ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-500 cursor-not-allowed' 
                          : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400'
                      }`}
                    >
                      {isMember ? 'Joined' : 'Join Association'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

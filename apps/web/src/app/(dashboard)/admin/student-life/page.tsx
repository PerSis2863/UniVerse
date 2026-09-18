'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Calendar, Users, MessageSquare, Plus, Edit2, Trash2, X, Save, Search, MapPin, Clock } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

type Event = { id: string; title: string; date: string; location: string; type: string };
type Club = { id: string; name: string; category: string; members: number };
type Forum = { id: string; topic: string; posts: number; lastActive: string };

const INITIAL_EVENTS: Event[] = [
  { id: '1', title: 'Tech Career Fair', date: '2026-11-15', location: 'Main Hall', type: 'Career' },
  { id: '2', title: 'Spring Festival', date: '2026-12-05', location: 'Campus Grounds', type: 'Social' },
];

const INITIAL_CLUBS: Club[] = [
  { id: '1', name: 'Robotics Society', category: 'Technology', members: 120 },
  { id: '2', name: 'Debate Club', category: 'Academic', members: 45 },
];

const INITIAL_FORUMS: Forum[] = [
  { id: '1', topic: 'Housing & Accommodation Help', posts: 342, lastActive: '2 hours ago' },
  { id: '2', topic: 'Study Groups - Fall 2026', posts: 156, lastActive: '5 mins ago' },
];

export default function AdminStudentLifePage() {
  const [activeTab, setActiveTab] = useState<'events' | 'clubs' | 'forums'>('events');
  const [searchQuery, setSearchQuery] = useState('');

  const [events, setEvents] = useState<Event[]>(INITIAL_EVENTS);
  const [clubs, setClubs] = useState<Club[]>(INITIAL_CLUBS);
  const [forums, setForums] = useState<Forum[]>(INITIAL_FORUMS);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  
  // Generic form state for simplicity
  const [formData, setFormData] = useState<any>({});

  const filteredEvents = events.filter(e => e.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredClubs = clubs.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredForums = forums.filter(f => f.topic.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleOpenModal = (item?: any) => {
    setEditingItem(item || null);
    if (item) {
      setFormData({ ...item });
    } else {
      if (activeTab === 'events') setFormData({ title: '', date: '', location: '', type: 'General' });
      if (activeTab === 'clubs') setFormData({ name: '', category: 'General', members: 0 });
      if (activeTab === 'forums') setFormData({ topic: '', posts: 0, lastActive: 'Just now' });
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (activeTab === 'events') {
      if (!formData.title) return toast.error('Title is required');
      if (editingItem) setEvents(events.map(e => e.id === editingItem.id ? { ...formData } : e));
      else setEvents([...events, { ...formData, id: Date.now().toString() }]);
    }
    else if (activeTab === 'clubs') {
      if (!formData.name) return toast.error('Name is required');
      if (editingItem) setClubs(clubs.map(c => c.id === editingItem.id ? { ...formData } : c));
      else setClubs([...clubs, { ...formData, id: Date.now().toString() }]);
    }
    else if (activeTab === 'forums') {
      if (!formData.topic) return toast.error('Topic is required');
      if (editingItem) setForums(forums.map(f => f.id === editingItem.id ? { ...formData } : f));
      else setForums([...forums, { ...formData, id: Date.now().toString() }]);
    }

    toast.success(`${activeTab === 'events' ? 'Event' : activeTab === 'clubs' ? 'Club' : 'Forum'} saved successfully.`);
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this item?')) {
      if (activeTab === 'events') setEvents(events.filter(e => e.id !== id));
      if (activeTab === 'clubs') setClubs(clubs.filter(c => c.id !== id));
      if (activeTab === 'forums') setForums(forums.filter(f => f.id !== id));
      toast.success('Deleted successfully.');
    }
  };

  return (
    <>
      <Topbar title="Student Life Management" subtitle="Manage events, clubs, and community forums" />
      
      <div className="flex-1 p-8 overflow-y-auto bg-[#09090b]">
        <div className="max-w-7xl mx-auto space-y-8">
          
          {/* Tabs */}
          <div className="flex border-b border-zinc-800">
            <button onClick={() => setActiveTab('events')} className={`px-6 py-3 text-sm font-medium border-b-2 flex items-center gap-2 ${activeTab === 'events' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
              <Calendar className="w-4 h-4" /> Events
            </button>
            <button onClick={() => setActiveTab('clubs')} className={`px-6 py-3 text-sm font-medium border-b-2 flex items-center gap-2 ${activeTab === 'clubs' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
              <Users className="w-4 h-4" /> Clubs
            </button>
            <button onClick={() => setActiveTab('forums')} className={`px-6 py-3 text-sm font-medium border-b-2 flex items-center gap-2 ${activeTab === 'forums' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
              <MessageSquare className="w-4 h-4" /> Forums
            </button>
          </div>

          <div className="flex justify-between items-center gap-4">
            <div className="relative w-96">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder={`Search ${activeTab}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button onClick={() => handleOpenModal()} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20">
              <Plus className="w-4 h-4" /> Add {activeTab === 'events' ? 'Event' : activeTab === 'clubs' ? 'Club' : 'Forum'}
            </button>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-zinc-400 uppercase bg-zinc-900/80 border-b border-zinc-800">
                <tr>
                  {activeTab === 'events' && (
                    <>
                      <th className="px-6 py-4 font-medium">Event Title</th>
                      <th className="px-6 py-4 font-medium">Date</th>
                      <th className="px-6 py-4 font-medium">Location</th>
                      <th className="px-6 py-4 font-medium">Type</th>
                    </>
                  )}
                  {activeTab === 'clubs' && (
                    <>
                      <th className="px-6 py-4 font-medium">Club Name</th>
                      <th className="px-6 py-4 font-medium">Category</th>
                      <th className="px-6 py-4 font-medium">Members</th>
                    </>
                  )}
                  {activeTab === 'forums' && (
                    <>
                      <th className="px-6 py-4 font-medium">Forum Topic</th>
                      <th className="px-6 py-4 font-medium">Posts</th>
                      <th className="px-6 py-4 font-medium">Last Active</th>
                    </>
                  )}
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
                {activeTab === 'events' && filteredEvents.map(event => (
                  <tr key={event.id} className="hover:bg-zinc-800/30">
                    <td className="px-6 py-4 font-medium text-white">{event.title}</td>
                    <td className="px-6 py-4"><span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-zinc-500"/> {event.date}</span></td>
                    <td className="px-6 py-4"><span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-zinc-500"/> {event.location}</span></td>
                    <td className="px-6 py-4"><span className="inline-flex px-2 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-400">{event.type}</span></td>
                    <td className="px-6 py-4 flex justify-end gap-2">
                      <button onClick={() => handleOpenModal(event)} className="p-1.5 text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/20 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(event.id)} className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/20 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
                {activeTab === 'clubs' && filteredClubs.map(club => (
                  <tr key={club.id} className="hover:bg-zinc-800/30">
                    <td className="px-6 py-4 font-medium text-white">{club.name}</td>
                    <td className="px-6 py-4"><span className="inline-flex px-2 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-400">{club.category}</span></td>
                    <td className="px-6 py-4"><span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-zinc-500"/> {club.members}</span></td>
                    <td className="px-6 py-4 flex justify-end gap-2">
                      <button onClick={() => handleOpenModal(club)} className="p-1.5 text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/20 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(club.id)} className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/20 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
                {activeTab === 'forums' && filteredForums.map(forum => (
                  <tr key={forum.id} className="hover:bg-zinc-800/30">
                    <td className="px-6 py-4 font-medium text-white">{forum.topic}</td>
                    <td className="px-6 py-4"><span className="flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5 text-zinc-500"/> {forum.posts}</span></td>
                    <td className="px-6 py-4"><span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-zinc-500"/> {forum.lastActive}</span></td>
                    <td className="px-6 py-4 flex justify-end gap-2">
                      <button onClick={() => handleOpenModal(forum)} className="p-1.5 text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/20 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(forum.id)} className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/20 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between">
              <h2 className="text-xl font-bold text-white">{editingItem ? 'Edit' : 'Add'} {activeTab === 'events' ? 'Event' : activeTab === 'clubs' ? 'Club' : 'Forum'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="space-y-4">
              {activeTab === 'events' && (
                <>
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">Title *</label>
                    <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">Date</label>
                    <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">Location</label>
                    <input type="text" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">Type</label>
                    <input type="text" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white" />
                  </div>
                </>
              )}
              {activeTab === 'clubs' && (
                <>
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">Name *</label>
                    <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">Category</label>
                    <input type="text" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">Members</label>
                    <input type="number" value={formData.members} onChange={e => setFormData({...formData, members: parseInt(e.target.value) || 0})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white" />
                  </div>
                </>
              )}
              {activeTab === 'forums' && (
                <>
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">Topic *</label>
                    <input type="text" value={formData.topic} onChange={e => setFormData({...formData, topic: e.target.value})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">Posts</label>
                    <input type="number" value={formData.posts} onChange={e => setFormData({...formData, posts: parseInt(e.target.value) || 0})} className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white" />
                  </div>
                </>
              )}
            </div>
            
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-zinc-400 hover:text-white">Cancel</button>
              <button onClick={handleSave} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2"><Save className="w-4 h-4" /> Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

'use client';
import { useState, useEffect } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { api } from '@/lib/api';
import { Megaphone, Edit, Trash2, Plus, Calendar, User, X, Send } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    api.get('/announcements')
      .then(res => setAnnouncements(res.data))
      .catch(() => setAnnouncements([]))
      .finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setEditTarget(null);
    setFormTitle('');
    setFormBody('');
    setShowModal(true);
  };

  const openEdit = (ann: any) => {
    setEditTarget(ann);
    setFormTitle(ann.title);
    setFormBody(ann.content || ann.body || '');
    setShowModal(true);
  };

  const handleSave = () => {
    if (!formTitle) { toast.error('Title is required.'); return; }
    if (editTarget) {
      setAnnouncements(prev => prev.map(a => a.id === editTarget.id ? { ...a, title: formTitle, content: formBody } : a));
      toast.success('Announcement updated!');
    } else {
      const newAnn = {
        id: `ann-${Date.now()}`,
        title: formTitle,
        content: formBody,
        author: { name: 'Admin' },
        createdAt: new Date().toISOString(),
        course: null,
      };
      setAnnouncements(prev => [newAnn, ...prev]);
      toast.success('Announcement published!');
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    setAnnouncements(prev => prev.filter(a => a.id !== id));
    setConfirmDelete(null);
    toast.success('Announcement deleted.');
  };

  return (
    <>
      <Topbar title="Announcements" subtitle="Manage system-wide and course-specific announcements" />
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="flex justify-end mb-6">
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20"
          >
            <Plus className="w-4 h-4" /> Create Announcement
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          </div>
        ) : announcements.length === 0 ? (
          <div className="card text-center py-12">
            <Megaphone className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">No announcements</h2>
            <p className="text-zinc-400 mb-6">There are no announcements in the system.</p>
            <button onClick={openCreate} className="mx-auto flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> Create First Announcement
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {announcements.map((ann) => (
              <div key={ann.id} className="card p-0 overflow-hidden group border border-white/[0.05] hover:border-indigo-500/50 transition-all flex flex-col h-full relative">

                {/* Actions Overlay */}
                <div className="absolute top-4 right-4 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEdit(ann)}
                    className="p-2 bg-black/60 hover:bg-indigo-600 text-zinc-300 hover:text-white rounded-md backdrop-blur-md transition-colors"
                    title="Edit"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(ann.id)}
                    className="p-2 bg-black/60 hover:bg-red-500/80 text-zinc-300 hover:text-white rounded-md backdrop-blur-md transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-6 flex flex-col relative flex-1">
                  <div className="mb-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-500/10 text-indigo-400">
                      {ann.course?.name || 'Global Announcement'}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-white mb-3">{ann.title}</h2>
                  <p className="text-sm text-zinc-400 line-clamp-3 flex-1">
                    {ann.content || ann.body || 'No content.'}
                  </p>
                </div>

                <div className="p-4 mt-auto border-t border-white/[0.05] bg-white/[0.02] flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <User className="w-3.5 h-3.5" />
                    {ann.author?.name || 'Unknown Author'}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(ann.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{editTarget ? 'Edit Announcement' : 'New Announcement'}</h2>
                <p className="text-sm text-zinc-400 mt-1">{editTarget ? 'Update the announcement details below.' : 'This will be published to all users immediately.'}</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Title *</label>
                <input type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Announcement title..." className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Content</label>
                <textarea rows={5} value={formBody} onChange={e => setFormBody(e.target.value)} placeholder="Write the full announcement body here..." className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 resize-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleSave} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg flex items-center gap-2 transition-all">
                <Send className="w-4 h-4" /> {editTarget ? 'Save Changes' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6 text-red-400" />
            </div>
            <h2 className="text-lg font-bold text-white text-center">Delete Announcement?</h2>
            <p className="text-sm text-zinc-400 text-center">This action cannot be undone. The announcement will be permanently removed.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 px-4 py-2 text-sm text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-500 rounded-xl transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

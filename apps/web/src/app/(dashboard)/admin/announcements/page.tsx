'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { Topbar } from '@/components/layout/Topbar';
import { MessagesTabs } from '@/components/layout/SectionTabs';
import { api, errorMessage } from '@/lib/api';
import { Megaphone, Edit, Trash2, Plus, Calendar, User, X, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';

interface Announcement { id: string; title: string; body?: string | null; content?: string | null; createdAt: string; author?: { name: string } | null; course?: { name: string } | null }

export default function AdminAnnouncements() {
  const { data, isLoading: loading, mutate } = useSWR<Announcement[]>('/announcements', fetcher);
  const announcements = data ?? [];
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editTarget, setEditTarget] = useState<Announcement | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);


  const openCreate = () => {
    setEditTarget(null);
    setFormTitle('');
    setFormBody('');
    setShowModal(true);
  };

  const openEdit = (ann: Announcement) => {
    setEditTarget(ann);
    setFormTitle(ann.title);
    setFormBody(ann.content || ann.body || '');
    setShowModal(true);
  };

  // Saved on the server (this page used to change only its own list, so nothing was published).
  const handleSave = async () => {
    if (!formTitle.trim()) { toast.error('Title is required.'); return; }
    if (!formBody.trim()) { toast.error('Write the announcement.'); return; }
    setSaving(true);
    try {
      if (editTarget) {
        await api.patch(`/announcements/${editTarget.id}`, { title: formTitle.trim(), body: formBody.trim() });
        toast.success('Announcement updated!');
      } else {
        await api.post('/announcements', { title: formTitle.trim(), body: formBody.trim() });
        toast.success('Announcement published!');
      }
      setShowModal(false);
      await mutate();
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the announcement.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDelete(null);
    void mutate(announcements.filter((a) => a.id !== id), { revalidate: false });
    try {
      await api.delete(`/announcements/${id}`);
      toast.success('Announcement deleted.');
    } catch (e) {
      toast.error(errorMessage(e, 'Could not delete the announcement.'));
      void mutate();
    }
  };

  return (
    <>
      <Topbar title="Announcements" subtitle="Manage system-wide and course-specific announcements" />
      <MessagesTabs />
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="flex justify-end mb-6">
          <button
            onClick={openCreate}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" /> Create Announcement
          </button>
        </div>

        {loading ? (
          <ContentSkeleton variant="list" />
        ) : announcements.length === 0 ? (
          <div className="card text-center py-12">
            <Megaphone className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">No announcements</h2>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6">There are no announcements in the system.</p>
            <button onClick={openCreate} className="btn-primary mx-auto">
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
                    className="p-2 bg-black/60 hover:bg-red-500/80 text-zinc-300 hover:text-zinc-900 dark:hover:text-white rounded-md backdrop-blur-md transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-6 flex flex-col relative flex-1">
                  <div className="mb-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-500/10 text-indigo-700 dark:text-indigo-400">
                      {ann.course?.name || 'Global Announcement'}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-3">{ann.title}</h2>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-3 flex-1">
                    {ann.content || ann.body || 'No content.'}
                  </p>
                </div>

                <div className="p-4 mt-auto border-t border-white/[0.05] bg-white/[0.02] flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                    <User className="w-3.5 h-3.5" />
                    {ann.author?.name || 'Unknown Author'}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-500">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(ann.createdAt).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="sheet-in tone-panel border border-zinc-200 dark:border-zinc-800 w-full max-w-lg rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{editTarget ? 'Edit Announcement' : 'New Announcement'}</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">{editTarget ? 'Update the announcement details below.' : 'This will be published to all users immediately.'}</p>
              </div>
              <button aria-label="Close" onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 block mb-1">Title *</label>
                <input type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Announcement title..." className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300 block mb-1">Content</label>
                <textarea rows={5} value={formBody} onChange={e => setFormBody(e.target.value)} placeholder="Write the full announcement body here..." className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 resize-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">Cancel</button>
              <button onClick={() => void handleSave()} disabled={saving} className="btn-primary">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {editTarget ? 'Save Changes' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="backdrop-in fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="sheet-in tone-panel border border-zinc-200 dark:border-zinc-800 w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6 text-red-400" />
            </div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white text-center">Delete Announcement?</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 text-center">This action cannot be undone. The announcement will be permanently removed.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors">Cancel</button>
              <button onClick={() => void handleDelete(confirmDelete)} className="btn-danger flex-1">Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

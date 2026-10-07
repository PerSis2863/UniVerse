'use client';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';

import { Topbar } from '@/components/layout/Topbar';
import { MessageSquare, Heart, Share2, Search, Filter, TrendingUp, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';

export default function StudentCommunity() {
  const [searchTerm, setSearchTerm] = useState('');
  const { data: posts, isLoading, mutate } = useSWR('/announcements', fetcher);
  const role = useAuthStore((st) => st.user?.role);
  const canPost = role === 'TEACHER' || role === 'ADMIN';
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [publishing, setPublishing] = useState(false);
  const publish = async () => {
    setPublishing(true);
    try {
      await api.post('/announcements', { title: draftTitle.trim(), body: draftBody.trim(), target: 'ALL' });
      toast.success('Announcement published');
      setDraftTitle(''); setDraftBody('');
      mutate();
    } catch {
      toast.error('Could not publish the announcement.');
    } finally {
      setPublishing(false);
    }
  };
  
  // Most active posters, computed from the real posts.
  type Contributor = { name: string; posts: number; color: string };
  const counts = new Map<string, number>();
  for (const p of Array.isArray(posts) ? posts : []) {
    const name: string | undefined = p?.author?.name;
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const COLORS = ['from-pink-500 to-rose-500', 'from-blue-500 to-cyan-500', 'from-indigo-500 to-purple-500'];
  const topContributors: Contributor[] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, n], i) => ({ name, posts: n, color: COLORS[i] }));

  const filteredPosts = (posts || []).filter((p: any) => p.title?.toLowerCase().includes(searchTerm.toLowerCase()) || p.content?.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <>
      <Topbar title="Community Forum" subtitle="Connect, share, and collaborate with your peers" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-8">
          
          {/* Main Feed */}
          <div className="flex-1 space-y-6">
            
            {/* Create Post (teachers & admins publish announcements; students discuss in Groups) */}
            {canPost ? (
              <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
                <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} maxLength={150} placeholder="Announcement title"
                  className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-900 dark:text-white placeholder:text-zinc-500 outline-none focus:border-indigo-500" />
                <textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} maxLength={5000} placeholder="Share news with your campus…"
                  className="w-full min-h-[90px] bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-900 dark:text-white placeholder:text-zinc-500 outline-none focus:border-indigo-500" />
                <div className="flex justify-end">
                  <button onClick={publish} disabled={publishing || !draftTitle.trim() || !draftBody.trim()} className="btn-primary btn-sm">
                    {publishing ? 'Publishing…' : 'Publish'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex items-center justify-between gap-4">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Campus news from your teachers and admins appears here. Want to start a discussion?</p>
                <a href="/student/groups" className="btn-primary btn-sm shrink-0">Open Groups</a>
              </div>
            )}

            {/* Posts */}
            <div className="space-y-4">
              {isLoading ? (
                <div className="text-center py-8 text-zinc-500">Loading posts...</div>
              ) : filteredPosts.length === 0 ? (
                <div className="text-center py-8 text-zinc-500">No posts found.</div>
              ) : filteredPosts.map((post: any) => (
                <div key={post.id} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                  
                  {/* Author Row */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-zinc-900 dark:text-white font-medium shadow-sm bg-gradient-to-br from-indigo-500 to-purple-500`}>
                        {post.author?.name?.charAt(0) || 'A'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-900 dark:text-white">{post.author?.name || 'Campus team'}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-400`}>Announcement</span>
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-500">{post.createdAt && new Date(post.createdAt).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-2">{post.title}</h3>
                  <p className="text-zinc-600 dark:text-zinc-300 text-sm leading-relaxed mb-4 whitespace-pre-line">{post.body ?? post.content}</p>

                  {/* Actions */}
                  <div className="flex items-center gap-6 pt-4 border-t border-zinc-200 dark:border-zinc-800/50">
                    <button onClick={() => { navigator.clipboard.writeText(`${post.title}\n\n${post.body ?? post.content ?? ''}`); toast.success('Copied to clipboard'); }} className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                      <Share2 className="w-4 h-4" /> <span className="text-sm font-medium">Copy</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

          </div>

          {/* Sidebar */}
          <div className="w-full lg:w-80 space-y-6">
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 dark:text-zinc-400" />
              <input 
                type="text" 
                placeholder="Search discussions..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:text-zinc-500 focus:outline-none focus:border-indigo-500 transition-all"
              />
            </div>

            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
              <h3 className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-white mb-4">
                <TrendingUp className="w-4 h-4 text-indigo-400" /> Trending Topics
              </h3>
              <div className="space-y-3">
                {['#CS101', '#StudyGroup', '#CampusLife', '#Hackathon2026'].map((tag, i) => (
                  <div key={i} className="flex items-center justify-between group cursor-pointer">
                    <span className="text-zinc-300 group-hover:text-indigo-400 transition-colors text-sm">{tag}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-500">{120 - (i * 15)} posts</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
              <h3 className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-white mb-4">
                <Users className="w-4 h-4 text-indigo-400" /> Top Contributors
              </h3>
              <div className="space-y-4">
                {topContributors.length === 0 && <p className="text-sm text-zinc-500">No posts yet.</p>}
                {topContributors.map((user, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${user.color} flex items-center justify-center text-zinc-900 dark:text-white text-xs font-medium`}>
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-zinc-200">{user.name}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-500">{user.posts} posts</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}

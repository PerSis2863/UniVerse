'use client';

import { Topbar } from '@/components/layout/Topbar';
import { MessageSquare, Heart, Share2, Search, Filter, TrendingUp, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const MOCK_POSTS = [
  { id: 1, author: 'Alice J.', avatar: 'A', role: 'Student', time: '2 hours ago', title: 'Study group for CS101 Midterm', content: 'Hey everyone, I am organizing a study group for the upcoming CS101 midterm. We will be meeting in the library at 5PM on Thursday. Let me know if you want to join!', likes: 12, comments: 4, tags: ['CS101', 'Study Group'] },
  { id: 2, author: 'Prof. Alan T.', avatar: 'T', role: 'Teacher', time: '5 hours ago', title: 'New resources added to Data Structures', content: 'I have uploaded some additional practice problems for trees and graphs to the course materials. Please review them before next week\'s lecture.', likes: 45, comments: 2, tags: ['Announcement', 'Data Structures'] },
  { id: 3, author: 'Charlie B.', avatar: 'C', role: 'Student', time: '1 day ago', title: 'Looking for a project partner for Web Dev', content: 'I am looking for someone to team up with for the final project in the Web Development Bootcamp. I am strong in React but need help with the backend (Node.js).', likes: 8, comments: 5, tags: ['Web Dev', 'Project'] },
];

export default function StudentCommunity() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <>
      <Topbar title="Community Forum" subtitle="Connect, share, and collaborate with your peers" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-8">
          
          {/* Main Feed */}
          <div className="flex-1 space-y-6">
            
            {/* Create Post */}
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex gap-4">
              <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex-shrink-0 flex items-center justify-center text-indigo-400 font-medium">
                ME
              </div>
              <div className="flex-1">
                <input 
                  type="text" 
                  placeholder="Start a new discussion..." 
                  className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:text-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <div className="flex justify-between items-center mt-3">
                  <div className="flex gap-2">
                    <button onClick={() => toast.success('Add Topic clicked')} className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white text-sm font-medium px-2 py-1 rounded hover:bg-zinc-100 dark:bg-zinc-800 transition-colors">Add Topic</button>
                    <button onClick={() => toast.success('Attach File clicked')} className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white text-sm font-medium px-2 py-1 rounded hover:bg-zinc-100 dark:bg-zinc-800 transition-colors">Attach File</button>
                  </div>
                  <button onClick={() => toast.success('Post submitted!')} className="bg-indigo-500 text-zinc-900 dark:text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors">Post</button>
                </div>
              </div>
            </div>

            {/* Posts */}
            <div className="space-y-4">
              {MOCK_POSTS.map((post) => (
                <div key={post.id} className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                  
                  {/* Author Row */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-zinc-900 dark:text-white font-medium shadow-sm ${
                        post.role === 'Teacher' ? 'bg-gradient-to-br from-blue-500 to-cyan-500' : 'bg-gradient-to-br from-indigo-500 to-purple-500'
                      }`}>
                        {post.avatar}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-900 dark:text-white">{post.author}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            post.role === 'Teacher' ? 'bg-blue-500/10 text-blue-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                          }`}>{post.role}</span>
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-500">{post.time}</div>
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-2">{post.title}</h3>
                  <p className="text-zinc-300 text-sm leading-relaxed mb-4">{post.content}</p>

                  {/* Tags */}
                  <div className="flex gap-2 mb-4">
                    {post.tags.map((tag, i) => (
                      <span key={i} className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-300 text-xs rounded-md">
                        #{tag}
                      </span>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-6 pt-4 border-t border-zinc-200 dark:border-zinc-800/50">
                    <button onClick={() => toast.success('Liked post!')} className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-red-400 transition-colors">
                      <Heart className="w-4 h-4" /> <span className="text-sm font-medium">{post.likes}</span>
                    </button>
                    <button onClick={() => toast.success('Viewing comments...')} className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-indigo-400 transition-colors">
                      <MessageSquare className="w-4 h-4" /> <span className="text-sm font-medium">{post.comments} Comments</span>
                    </button>
                    <button onClick={() => toast.success('Shared post!')} className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white transition-colors ml-auto">
                      <Share2 className="w-4 h-4" />
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
                {[
                  { name: 'Diana Prince', posts: 42, color: 'from-pink-500 to-rose-500' },
                  { name: 'Evan Davis', posts: 38, color: 'from-blue-500 to-cyan-500' },
                  { name: 'Alice Johnson', posts: 25, color: 'from-indigo-500 to-purple-500' }
                ].map((user, i) => (
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

'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import {
  Search, Filter, MoreVertical, UserCheck, UserX, Shield,
  GraduationCap, User, ChevronDown, X, Mail, Calendar, Trash2
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

const ROLE_FILTERS = ['All', 'STUDENT', 'TEACHER', 'ADMIN'];

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLTableDataCellElement>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await api.get('/users');
        setUsers(response.data);
      } catch (error) {
        console.error('Failed to fetch users:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const filteredUsers = useMemo(() => users.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchRole = roleFilter === 'All' || u.role === roleFilter;
    return matchSearch && matchRole;
  }), [users, searchTerm, roleFilter]);

  const handleDeactivate = (userId: string) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: 'INACTIVE' } : u));
    toast.success('User deactivated.');
    setOpenMenuId(null);
  };

  const handleActivate = (userId: string) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: 'ACTIVE' } : u));
    toast.success('User reactivated.');
    setOpenMenuId(null);
  };

  const handleDelete = (userId: string) => {
    setUsers(prev => prev.filter(u => u.id !== userId));
    setSelectedUser(null);
    setOpenMenuId(null);
    toast.success('User removed from system.');
  };

  return (
    <>
      <Topbar title="Users" subtitle="Manage all students, teachers, and administrators" />

      <div className="flex-1 p-8 overflow-y-auto space-y-6">

        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 dark:text-zinc-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto relative">
            <button
              onClick={() => setShowFilterDropdown(p => !p)}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-100 dark:bg-zinc-800 transition-colors whitespace-nowrap"
            >
              <Filter className="w-4 h-4" />
              {roleFilter === 'All' ? 'Filter by Role' : roleFilter}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showFilterDropdown && (
              <div className="absolute right-0 top-11 z-30 bg-white dark:bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-44 py-1 animate-in fade-in slide-in-from-top-2 duration-150">
                {ROLE_FILTERS.map(r => (
                  <button
                    key={r}
                    onClick={() => { setRoleFilter(r); setShowFilterDropdown(false); }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                      roleFilter === r ? 'text-indigo-400 bg-indigo-500/10' : 'text-zinc-300 hover:bg-zinc-100 dark:bg-zinc-800'
                    }`}
                  >
                    {r === 'All' ? 'All Roles' : r.charAt(0) + r.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {(searchTerm || roleFilter !== 'All') && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Showing <strong className="text-zinc-900 dark:text-white">{filteredUsers.length}</strong> of {users.length} users
          </p>
        )}

        {/* Users Table */}
        <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden min-h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-zinc-500 dark:text-zinc-500">Loading users...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider bg-white dark:bg-zinc-900/80">
                    <th className="p-4">User</th>
                    <th className="p-4">Role</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Joined</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors group">
                      <td className="p-4">
                        <button onClick={() => setSelectedUser(user)} className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-zinc-900 dark:text-white font-medium shadow-lg flex-shrink-0">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-zinc-900 dark:text-white">{user.name}</div>
                            <div className="text-sm text-zinc-500 dark:text-zinc-500">{user.email}</div>
                          </div>
                        </button>
                      </td>
                      <td className="p-4">
                        {user.role === 'ADMIN' ? (
                          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 w-fit">
                            <Shield className="w-3.5 h-3.5" /> Admin
                          </span>
                        ) : user.role === 'TEACHER' ? (
                          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 w-fit">
                            <GraduationCap className="w-3.5 h-3.5" /> Teacher
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20 w-fit">
                            <User className="w-3.5 h-3.5" /> Student
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${
                          user.status !== 'INACTIVE'
                            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                          {user.status !== 'INACTIVE' ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                          {user.status !== 'INACTIVE' ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td className="p-4 text-zinc-600 dark:text-zinc-400 text-sm">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-right relative" ref={openMenuId === user.id ? menuRef : null}>
                        <button
                          onClick={() => setOpenMenuId(openMenuId === user.id ? null : user.id)}
                          className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white rounded-lg hover:bg-zinc-100 dark:bg-zinc-800 transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {openMenuId === user.id && (
                          <div className="absolute right-4 top-12 z-30 bg-white dark:bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-44 py-1 text-left animate-in fade-in duration-150">
                            <button
                              onClick={() => { setSelectedUser(user); setOpenMenuId(null); }}
                              className="w-full px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-100 dark:bg-zinc-800 flex items-center gap-2"
                            >
                              <User className="w-3.5 h-3.5" /> View Profile
                            </button>
                            <button
                              onClick={() => { toast.success(`Email sent to ${user.email}`); setOpenMenuId(null); }}
                              className="w-full px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-100 dark:bg-zinc-800 flex items-center gap-2"
                            >
                              <Mail className="w-3.5 h-3.5" /> Send Email
                            </button>
                            {user.status !== 'INACTIVE' ? (
                              <button
                                onClick={() => handleDeactivate(user.id)}
                                className="w-full px-4 py-2 text-sm text-amber-400 hover:bg-zinc-100 dark:bg-zinc-800 flex items-center gap-2"
                              >
                                <UserX className="w-3.5 h-3.5" /> Deactivate
                              </button>
                            ) : (
                              <button
                                onClick={() => handleActivate(user.id)}
                                className="w-full px-4 py-2 text-sm text-green-400 hover:bg-zinc-100 dark:bg-zinc-800 flex items-center gap-2"
                              >
                                <UserCheck className="w-3.5 h-3.5" /> Reactivate
                              </button>
                            )}
                            <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />
                            <button
                              onClick={() => handleDelete(user.id)}
                              className="w-full px-4 py-2 text-sm text-red-400 hover:bg-red-900/20 flex items-center gap-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete User
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredUsers.length === 0 && (
                <div className="p-12 text-center text-zinc-500 dark:text-zinc-500">
                  No users found matching your filters.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* User Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">User Profile</h2>
              <button onClick={() => setSelectedUser(null)} className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white hover:bg-zinc-100 dark:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-zinc-900 dark:text-white text-2xl font-bold shadow-lg">
                  {selectedUser.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-xl font-bold text-zinc-900 dark:text-white">{selectedUser.name}</div>
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">{selectedUser.email}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl">
                  <div className="text-zinc-500 dark:text-zinc-500 text-xs mb-1">Role</div>
                  <div className="font-semibold text-zinc-900 dark:text-white">{selectedUser.role}</div>
                </div>
                <div className="p-3 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl">
                  <div className="text-zinc-500 dark:text-zinc-500 text-xs mb-1">Status</div>
                  <div className={`font-semibold ${selectedUser.status !== 'INACTIVE' ? 'text-green-400' : 'text-red-400'}`}>
                    {selectedUser.status !== 'INACTIVE' ? 'Active' : 'Inactive'}
                  </div>
                </div>
                <div className="p-3 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl col-span-2">
                  <div className="text-zinc-500 dark:text-zinc-500 text-xs mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> Member Since</div>
                  <div className="font-semibold text-zinc-900 dark:text-white">{new Date(selectedUser.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <button
                onClick={() => handleDelete(selectedUser.id)}
                className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Delete Account
              </button>
              <div className="flex gap-2">
                <button onClick={() => setSelectedUser(null)} className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white transition-colors">Close</button>
                <button
                  onClick={() => { toast.success(`Email sent to ${selectedUser.email}`); setSelectedUser(null); }}
                  className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-zinc-900 dark:text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Mail className="w-4 h-4" /> Send Email
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

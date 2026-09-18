'use client';
import { useState, useEffect } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { api } from '@/lib/api';
import { Settings, Bell, Mail, Shield, User } from 'lucide-react';

export default function StudentSettings() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    api.get('/users/me')
      .then(res => setUser(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleToggleEmail = async () => {
    if (!user) return;
    try {
      setSaving(true);
      const newValue = !user.emailNotifications;
      await api.patch('/users/me', { emailNotifications: newValue });
      setUser({ ...user, emailNotifications: newValue });
      setSuccessMsg('Settings updated successfully');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Topbar title="Settings" subtitle="Manage your account preferences" />
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-3xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Profile Section */}
              <div className="card p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Profile Details</h2>
                    <p className="text-sm text-zinc-400">Your personal information</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Full Name</label>
                    <div className="bg-white/[0.03] border border-white/[0.05] rounded-lg px-4 py-2.5 text-white">
                      {user?.name || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Email Address</label>
                    <div className="bg-white/[0.03] border border-white/[0.05] rounded-lg px-4 py-2.5 text-zinc-400">
                      {user?.email || 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Notifications Section */}
              <div className="card p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                    <Bell className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Notifications</h2>
                    <p className="text-sm text-zinc-400">Manage how we contact you</p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 text-indigo-400">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-medium text-white">Email Notifications</h3>
                      <p className="text-sm text-zinc-400">Receive announcements and updates via email.</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={user?.emailNotifications || false}
                      onChange={handleToggleEmail}
                      disabled={saving}
                    />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                  </label>
                </div>
                
                {successMsg && (
                  <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm text-center animate-in fade-in slide-in-from-top-2">
                    {successMsg}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </>
  );
}

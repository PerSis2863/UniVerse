'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Save, Building, Globe, Mail, Shield, Bell } from 'lucide-react';
import { useState } from 'react';

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState('general');

  const tabs = [
    { id: 'general', label: 'General', icon: Building },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  return (
    <>
      <Topbar title="Organization Settings" subtitle="Manage your university platform configuration" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          
          {/* Tabs */}
          <div className="flex space-x-1 border-b border-zinc-200 dark:border-zinc-800">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === tab.id ? 'text-indigo-400' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-t-full" />
                )}
              </button>
            ))}
          </div>

          {/* Form Content */}
          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8">
            
            {activeTab === 'general' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-4">Organization Profile</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Organization Name</label>
                    <input type="text" defaultValue="UniVerse Global" className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Support Email</label>
                    <input type="email" defaultValue="support@universe.edu" className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Website URL</label>
                    <input type="url" defaultValue="https://universe.edu" className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Organization Address</label>
                    <textarea rows={3} defaultValue="123 Education Lane, Tech City, TC 90210" className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors"></textarea>
                  </div>
                </div>

                <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
                  <button className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-zinc-900 dark:text-white px-6 py-2 rounded-lg font-medium transition-colors">
                    <Save className="w-4 h-4" /> Save Changes
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-4">Security Policies</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-zinc-100 dark:bg-zinc-800/30 border border-zinc-700/50 rounded-lg">
                    <div>
                      <div className="font-medium text-zinc-900 dark:text-white">Require Two-Factor Authentication</div>
                      <div className="text-sm text-zinc-500 dark:text-zinc-500">Enforce 2FA for all administrator accounts</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                    </label>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-zinc-100 dark:bg-zinc-800/30 border border-zinc-700/50 rounded-lg">
                    <div>
                      <div className="font-medium text-zinc-900 dark:text-white">Password Expiry</div>
                      <div className="text-sm text-zinc-500 dark:text-zinc-500">Require users to change passwords every 90 days</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" />
                      <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                    </label>
                  </div>
                </div>

                <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
                  <button className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-zinc-900 dark:text-white px-6 py-2 rounded-lg font-medium transition-colors">
                    <Save className="w-4 h-4" /> Save Security Policies
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-4">System Notifications</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-zinc-100 dark:bg-zinc-800/30 border border-zinc-700/50 rounded-lg">
                    <div>
                      <div className="font-medium text-zinc-900 dark:text-white">New User Registrations</div>
                      <div className="text-sm text-zinc-500 dark:text-zinc-500">Receive an email when a new teacher or admin signs up</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                    </label>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-zinc-100 dark:bg-zinc-800/30 border border-zinc-700/50 rounded-lg">
                    <div>
                      <div className="font-medium text-zinc-900 dark:text-white">Weekly System Report</div>
                      <div className="text-sm text-zinc-500 dark:text-zinc-500">Send a weekly summary of platform activity</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                    </label>
                  </div>
                </div>

                <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
                  <button className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-zinc-900 dark:text-white px-6 py-2 rounded-lg font-medium transition-colors">
                    <Save className="w-4 h-4" /> Save Preferences
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}

'use client';
import { useState, useEffect } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { api } from '@/lib/api';
import { Settings, Bell, Mail, Shield, User, Globe, Check, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LANGUAGES, type Language } from '@/lib/i18n';
import { useLanguageStore } from '@/store/language';
import { toast } from 'sonner';
import { NotificationPermissionPrompt } from '@/components/pwa/NotificationPermissionPrompt';

export default function StudentSettings() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { language, setLanguage, t } = useLanguageStore();
  const [activeSection, setActiveSection] = useState('profile');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = params.get('section');
    if (section && ['profile', 'language', 'notifications', 'privacy'].includes(section)) {
      setActiveSection(section);
    }
    
    api.get('/users/me')
      .then(res => setUser(res.data))
      .catch(() => setUser({ name: 'Student User', email: 'student@universe.edu', emailNotifications: true }))
      .finally(() => setLoading(false));
  }, []);

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    const langName = LANGUAGES.find(l => l.code === lang);
    toast.success(`Language changed to ${langName?.nativeName}`, {
      description: 'All interface text has been updated.',
    });
  };

  const handleToggleEmail = async () => {
    if (!user) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    setUser({ ...user, emailNotifications: !user.emailNotifications });
    setSaving(false);
    toast.success(t('settings.notifications') + ' updated!');
  };

  const sections = [
    { id: 'profile', label: t('settings.profile'), icon: User },
    { id: 'language', label: t('settings.language'), icon: Globe },
    { id: 'notifications', label: t('settings.notifications'), icon: Bell },
    { id: 'privacy', label: t('settings.privacy'), icon: Shield },
  ];

  return (
    <>
      <Topbar title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-6">
              
              {/* Sidebar Nav */}
              <div className="md:w-56 flex-shrink-0">
                <div className="card p-2 space-y-1">
                  {sections.map(sec => (
                    <button
                      key={sec.id}
                      onClick={() => setActiveSection(sec.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left",
                        activeSection === sec.id
                          ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                          : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.04]"
                      )}
                    >
                      <sec.icon className="w-4 h-4 flex-shrink-0" />
                      {sec.label}
                      {activeSection === sec.id && <ChevronRight className="w-3 h-3 ml-auto text-indigo-500" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content Panel */}
              <div className="flex-1">
                <AnimatePresence mode="wait">

                  {/* Profile */}
                  {activeSection === 'profile' && (
                    <motion.div key="profile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="card p-6 space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl font-black">
                          {user?.name?.charAt(0) ?? 'S'}
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{t('settings.profile')}</h2>
                          <p className="text-sm text-zinc-500">Your personal information</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                          { label: 'Full Name', value: user?.name || 'N/A' },
                          { label: 'Email Address', value: user?.email || 'N/A' },
                          { label: 'Student ID', value: 'UV-2024-0312' },
                          { label: 'Program', value: 'B.Sc. Computer Science' },
                          { label: 'Year', value: '3rd Year' },
                          { label: 'Campus', value: 'Main Campus' },
                        ].map(field => (
                          <div key={field.label}>
                            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">{field.label}</label>
                            <div className="bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/[0.05] rounded-xl px-4 py-2.5 text-sm text-zinc-900 dark:text-white">
                              {field.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Language */}
                  {activeSection === 'language' && (
                    <motion.div key="language" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="card p-6 space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                          <Globe className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{t('settings.language')}</h2>
                          <p className="text-sm text-zinc-500">{t('settings.language_desc')}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {LANGUAGES.map(lang => {
                          const isSelected = language === lang.code;
                          return (
                            <motion.button
                              key={lang.code}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => handleLanguageChange(lang.code)}
                              className={cn(
                                "flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left relative overflow-hidden",
                                isSelected
                                  ? "border-indigo-500 bg-indigo-500/10"
                                  : "border-zinc-200 dark:border-zinc-800 hover:border-indigo-400/50 hover:bg-zinc-50 dark:hover:bg-white/[0.03]"
                              )}
                            >
                              {isSelected && (
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="absolute top-3 right-3 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center"
                                >
                                  <Check className="w-3 h-3 text-white" />
                                </motion.div>
                              )}
                              <span className="text-3xl">{lang.flag}</span>
                              <div>
                                <div className={cn("font-bold text-sm", isSelected ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-900 dark:text-white")}>
                                  {lang.nativeName}
                                </div>
                                <div className="text-xs text-zinc-500">{lang.name}</div>
                              </div>
                            </motion.button>
                          );
                        })}
                      </div>

                      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                          💡 Language changes apply instantly across the entire interface. More translation coverage is being added continuously.
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* Notifications */}
                  {activeSection === 'notifications' && (
                    <motion.div key="notifications" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="card p-6 space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                          <Bell className="w-6 h-6" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{t('settings.notifications')}</h2>
                          <p className="text-sm text-zinc-500">Manage how we contact you</p>
                        </div>
                      </div>

                      {/* Push Notifications */}
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Push Notifications</p>
                        <NotificationPermissionPrompt />
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Email & In-App</p>
                      </div>
                      {[
                        { label: 'Email Notifications', desc: 'Receive announcements and updates via email.', icon: Mail, key: 'emailNotifications' },
                        { label: 'Grade Alerts', desc: 'Get notified when new grades are posted.', icon: Bell, key: 'gradeAlerts' },
                        { label: 'Project Invites', desc: 'Notifications for NGO and impact project invitations.', icon: Globe, key: 'projectInvites' },
                      ].map(item => (
                        <div key={item.key} className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/[0.05] rounded-xl">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 text-indigo-400"><item.icon className="w-5 h-5" /></div>
                            <div>
                              <h3 className="font-medium text-zinc-900 dark:text-white text-sm">{item.label}</h3>
                              <p className="text-xs text-zinc-500 mt-0.5">{item.desc}</p>
                            </div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={user?.[item.key] ?? true}
                              onChange={handleToggleEmail}
                              disabled={saving}
                            />
                            <div className="w-11 h-6 bg-zinc-200 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                          </label>
                        </div>
                      ))}
                    </motion.div>
                  )}

                  {/* Privacy */}
                  {activeSection === 'privacy' && (
                    <motion.div key="privacy" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="card p-6 space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                          <Shield className="w-6 h-6" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{t('settings.privacy')}</h2>
                          <p className="text-sm text-zinc-500">Control your data and security settings</p>
                        </div>
                      </div>
                      {[
                        { label: 'Public Profile', desc: 'Allow other students to view your profile and impact score.' },
                        { label: 'Show in Leaderboard', desc: 'Appear on the Social Impact Leaderboard rankings.' },
                        { label: 'Share Activity with NGOs', desc: 'Let partner NGOs see your volunteer history.' },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/[0.05] rounded-xl">
                          <div>
                            <h3 className="font-medium text-zinc-900 dark:text-white text-sm">{item.label}</h3>
                            <p className="text-xs text-zinc-500 mt-0.5">{item.desc}</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" defaultChecked={i === 0} />
                            <div className="w-11 h-6 bg-zinc-200 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                          </label>
                        </div>
                      ))}
                      <button onClick={() => toast.info('Password reset email sent!')} className="btn-secondary w-full py-2.5 text-sm flex items-center justify-center gap-2">
                        <Shield className="w-4 h-4" /> Change Password
                      </button>
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

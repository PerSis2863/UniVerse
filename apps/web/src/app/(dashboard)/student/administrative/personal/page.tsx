'use client';

import { Topbar } from '@/components/layout/Topbar';
import { User, MapPin, Phone, Mail, Edit3, Shield, Key, X } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function PersonalData() {
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isEditContactOpen, setIsEditContactOpen] = useState(false);
  const [isEditAddressOpen, setIsEditAddressOpen] = useState(false);
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [isAddParentOpen, setIsAddParentOpen] = useState(false);

  const [parents, setParents] = useState([
    { name: 'John Doe', relation: 'Father', phone: '+1 (555) 111-2222', email: 'john.doe@email.com' }
  ]);
  const [contacts, setContacts] = useState([
    { name: 'Jane Doe', relation: 'Mother', phone: '+1 (555) 987-6543', primary: true }
  ]);

  const closeModals = () => {
    setIsEditProfileOpen(false);
    setIsEditContactOpen(false);
    setIsEditAddressOpen(false);
    setIsAddContactOpen(false);
    setIsAddParentOpen(false);
  };

  const handleSave = () => {
    toast.success('Information updated successfully');
    closeModals();
  };

  return (
    <>
      <Topbar title="Personal Data" subtitle="Manage your personal information and contact details" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          
          {/* Profile Header */}
          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 flex flex-col md:flex-row items-center md:items-start gap-8 relative">
            <button onClick={() => setIsEditProfileOpen(true)} className="absolute top-4 right-4 text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:text-white transition-colors">
              <Edit3 className="w-5 h-5" />
            </button>
            
            <div onClick={() => toast.success('Change Photo clicked')} className="w-32 h-32 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-4xl font-bold text-indigo-400 flex-shrink-0 relative group cursor-pointer">
              S
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center backdrop-blur-sm">
                <span className="text-sm font-medium text-zinc-900 dark:text-white">Change Photo</span>
              </div>
            </div>
            
            <div className="flex-1 text-center md:text-left space-y-2 mt-2">
              <h2 className="text-3xl font-bold text-zinc-900 dark:text-white">Student Name</h2>
              <div className="text-lg text-indigo-400 font-medium">B.S. Computer Science</div>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm text-zinc-600 dark:text-zinc-400 mt-2">
                <span className="flex items-center gap-1.5"><Shield className="w-4 h-4 text-zinc-500 dark:text-zinc-500" /> ID: 20249381</span>
                <span className="flex items-center gap-1.5"><Key className="w-4 h-4 text-zinc-500 dark:text-zinc-500" /> Enroll Year: 2024</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Contact Information */}
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 space-y-6">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Contact Information</h3>
                <button onClick={() => setIsEditContactOpen(true)} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">Edit</button>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-zinc-500 dark:text-zinc-500 mt-0.5" />
                  <div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-0.5">University Email</div>
                    <div className="font-medium text-zinc-900 dark:text-white">student@universe.edu</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-zinc-500 dark:text-zinc-500 mt-0.5" />
                  <div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-0.5">Personal Email</div>
                    <div className="font-medium text-zinc-900 dark:text-white">student.personal@gmail.com</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-zinc-500 dark:text-zinc-500 mt-0.5" />
                  <div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-0.5">Mobile Phone</div>
                    <div className="font-medium text-zinc-900 dark:text-white">+1 (555) 123-4567</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 space-y-6">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Addresses</h3>
                <button onClick={() => setIsEditAddressOpen(true)} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">Edit</button>
              </div>
              
              <div className="space-y-6">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-indigo-400 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-indigo-400 mb-1">Current/Term Address</div>
                    <div className="text-sm text-zinc-300 leading-relaxed">
                      123 University Campus Drive<br />
                      Dormitory A, Room 402<br />
                      Tech City, TC 90210
                    </div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-zinc-500 dark:text-zinc-500 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">Permanent Address</div>
                    <div className="text-sm text-zinc-300 leading-relaxed">
                      456 Hometown Road<br />
                      Suburbia, NY 10001
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Emergency Contact */}
            <div className="md:col-span-2 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Emergency Contacts</h3>
                <button onClick={() => setIsAddContactOpen(true)} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">+ Add Contact</button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {contacts.map((contact, i) => (
                  <div key={i} className="p-4 bg-zinc-100 dark:bg-zinc-800/30 border border-zinc-700/50 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-medium text-zinc-900 dark:text-white">{contact.name}</div>
                      {contact.primary && <span className="text-xs font-medium text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">Primary</span>}
                    </div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">Relationship: {contact.relation}</div>
                    <div className="flex items-center gap-2 text-sm text-zinc-300">
                      <Phone className="w-4 h-4 text-zinc-500 dark:text-zinc-500" /> {contact.phone}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Parents Information */}
            <div className="md:col-span-2 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Parents/Guardians Information</h3>
                <button onClick={() => setIsAddParentOpen(true)} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">+ Add Parent</button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {parents.map((parent, i) => (
                  <div key={i} className="p-4 bg-zinc-100 dark:bg-zinc-800/30 border border-zinc-700/50 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-medium text-zinc-900 dark:text-white">{parent.name}</div>
                    </div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">Relationship: {parent.relation}</div>
                    <div className="flex flex-col gap-2 text-sm text-zinc-300">
                      <span className="flex items-center gap-2"><Phone className="w-4 h-4 text-zinc-500" /> {parent.phone}</span>
                      <span className="flex items-center gap-2"><Mail className="w-4 h-4 text-zinc-500" /> {parent.email}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {(isEditProfileOpen || isEditContactOpen || isEditAddressOpen || isAddContactOpen || isAddParentOpen) && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden p-6 relative"
            >
              <button 
                onClick={closeModals}
                className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
              
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-6">
                {isEditProfileOpen && 'Edit Profile'}
                {isEditContactOpen && 'Edit Contact Information'}
                {isEditAddressOpen && 'Edit Addresses'}
                {isAddContactOpen && 'Add Emergency Contact'}
                {isAddParentOpen && 'Add Parent Information'}
              </h3>
              
              <div className="space-y-4">
                <input type="text" placeholder="Full Name or Primary Detail" className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                <input type="text" placeholder="Secondary Detail (e.g. Phone, Address)" className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                {(isAddContactOpen || isAddParentOpen) && (
                  <input type="text" placeholder="Relationship (e.g. Mother, Father)" className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                )}
                
                <button 
                  onClick={handleSave}
                  className="w-full btn-primary py-3 rounded-xl mt-4"
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

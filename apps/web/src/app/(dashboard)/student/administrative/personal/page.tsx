'use client';

import { Topbar } from '@/components/layout/Topbar';
import { User, MapPin, Phone, Mail, Edit3, Shield, Key } from 'lucide-react';
import { toast } from 'sonner';

export default function PersonalData() {
  return (
    <>
      <Topbar title="Personal Data" subtitle="Manage your personal information and contact details" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          
          {/* Profile Header */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 flex flex-col md:flex-row items-center md:items-start gap-8 relative">
            <button onClick={() => toast.success('Edit Profile clicked')} className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors">
              <Edit3 className="w-5 h-5" />
            </button>
            
            <div onClick={() => toast.success('Change Photo clicked')} className="w-32 h-32 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-4xl font-bold text-indigo-400 flex-shrink-0 relative group cursor-pointer">
              S
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center backdrop-blur-sm">
                <span className="text-sm font-medium text-white">Change Photo</span>
              </div>
            </div>
            
            <div className="flex-1 text-center md:text-left space-y-2 mt-2">
              <h2 className="text-3xl font-bold text-white">Student Name</h2>
              <div className="text-lg text-indigo-400 font-medium">B.S. Computer Science</div>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm text-zinc-400 mt-2">
                <span className="flex items-center gap-1.5"><Shield className="w-4 h-4 text-zinc-500" /> ID: 20249381</span>
                <span className="flex items-center gap-1.5"><Key className="w-4 h-4 text-zinc-500" /> Enroll Year: 2024</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Contact Information */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 space-y-6">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold text-white">Contact Information</h3>
                <button onClick={() => toast.success('Edit Contact Information clicked')} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">Edit</button>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-zinc-500 mt-0.5" />
                  <div>
                    <div className="text-sm text-zinc-400 mb-0.5">University Email</div>
                    <div className="font-medium text-white">student@universe.edu</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-zinc-500 mt-0.5" />
                  <div>
                    <div className="text-sm text-zinc-400 mb-0.5">Personal Email</div>
                    <div className="font-medium text-white">student.personal@gmail.com</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-zinc-500 mt-0.5" />
                  <div>
                    <div className="text-sm text-zinc-400 mb-0.5">Mobile Phone</div>
                    <div className="font-medium text-white">+1 (555) 123-4567</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 space-y-6">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold text-white">Addresses</h3>
                <button onClick={() => toast.success('Edit Addresses clicked')} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">Edit</button>
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
                  <MapPin className="w-5 h-5 text-zinc-500 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-zinc-400 mb-1">Permanent Address</div>
                    <div className="text-sm text-zinc-300 leading-relaxed">
                      456 Hometown Road<br />
                      Suburbia, NY 10001
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Emergency Contact */}
            <div className="md:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-xl p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-white">Emergency Contacts</h3>
                <button onClick={() => toast.success('Add Emergency Contact clicked')} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">+ Add Contact</button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-zinc-800/30 border border-zinc-700/50 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-medium text-white">Jane Doe</div>
                    <span className="text-xs font-medium text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">Primary</span>
                  </div>
                  <div className="text-sm text-zinc-400 mb-2">Relationship: Mother</div>
                  <div className="flex items-center gap-2 text-sm text-zinc-300">
                    <Phone className="w-4 h-4 text-zinc-500" /> +1 (555) 987-6543
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}

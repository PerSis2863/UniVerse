'use client';

import { Topbar } from '@/components/layout/Topbar';
import { HeartPulse, Stethoscope, CalendarPlus, Activity } from 'lucide-react';
import { toast } from 'sonner';

export default function MedicalPage() {
  return (
    <>
      <Topbar title="Medical & Disability Services" subtitle="Manage appointments and health accommodations" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-8">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Health Center */}
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 relative overflow-hidden group hover:border-pink-500/30 transition-colors">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-pink-500/5 rounded-full blur-2xl group-hover:bg-pink-500/10 transition-colors" />
              <div className="w-12 h-12 bg-pink-500/20 rounded-xl flex items-center justify-center mb-6">
                <Stethoscope className="w-6 h-6 text-pink-400" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">Campus Health Center</h2>
              <p className="text-zinc-600 dark:text-zinc-400 mb-6">Book appointments for general medical care, vaccinations, and routine checkups.</p>
              
              <button onClick={() => toast.success('Booking medical appointment...')} className="flex items-center gap-2 bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 px-4 py-2.5 rounded-lg font-medium transition-colors w-full justify-center">
                <CalendarPlus className="w-4 h-4" /> Book Appointment
              </button>
            </div>

            {/* Disability Services */}
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 relative overflow-hidden group hover:border-purple-500/30 transition-colors">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-colors" />
              <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mb-6">
                <HeartPulse className="w-6 h-6 text-purple-400" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">Disability Support</h2>
              <p className="text-zinc-600 dark:text-zinc-400 mb-6">Request academic accommodations, accessible housing, and assistive technology.</p>
              
              <button onClick={() => toast.success('Managing accommodations...')} className="flex items-center gap-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 px-4 py-2.5 rounded-lg font-medium transition-colors w-full justify-center">
                <Activity className="w-4 h-4" /> Manage Accommodations
              </button>
            </div>

          </div>

          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
            <h3 className="font-semibold text-zinc-900 dark:text-white mb-4">Upcoming Appointments</h3>
            <div className="text-center py-8 text-zinc-500 dark:text-zinc-500 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg">
              No upcoming appointments scheduled.
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

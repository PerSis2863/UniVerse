'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Users, CheckCircle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export default function JoinGroupPage({ params }: { params: { inviteCode: string } }) {
  const router = useRouter();
  const [isJoining, setIsJoining] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleJoin = async () => {
    setIsJoining(true);
    // Simulate API call to join the group
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsJoining(false);
    setHasJoined(true);
    toast.success('Successfully joined the group!');
    
    // Redirect after a short delay
    setTimeout(() => {
      router.push('/student/groups');
    }, 1500);
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4 font-sans">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden"
      >
        {/* Decorative background element */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10">
          <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-indigo-200 dark:border-indigo-500/30">
            <Users className="w-8 h-8" />
          </div>
          
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
            You've been invited!
          </h1>
          
          <p className="text-zinc-600 dark:text-zinc-400 mb-8 leading-relaxed">
            You have received an invitation to join a new study group. Collaborate on projects, share resources, and achieve your goals together.
          </p>

          <div className="bg-zinc-50 dark:bg-zinc-950/50 rounded-xl p-4 mb-8 border border-zinc-100 dark:border-zinc-800/50">
            <div className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-1">Invite Code</div>
            <div className="font-mono text-zinc-800 dark:text-zinc-300 tracking-wider">
              {params.inviteCode}
            </div>
          </div>

          {hasJoined ? (
            <div className="w-full bg-green-500 text-white rounded-xl py-3.5 flex items-center justify-center gap-2 font-semibold shadow-lg shadow-green-500/30">
              <CheckCircle className="w-5 h-5" /> Joined Successfully
            </div>
          ) : (
            <button
              onClick={handleJoin}
              disabled={isJoining}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-70 disabled:hover:bg-indigo-600 text-white rounded-xl py-3.5 flex items-center justify-center gap-2 font-semibold transition-all shadow-lg shadow-indigo-600/30"
            >
              {isJoining ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Joining...
                </div>
              ) : (
                <>
                  Accept Invitation <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          )}

          <div className="mt-6 text-center">
            <button 
              onClick={() => router.push('/student/groups')}
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              Back to Groups
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

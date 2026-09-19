'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { Loader2, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';

import { toast } from 'sonner';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const { login, isLoading } = useAuthStore();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    await login(email, password);
    const user = useAuthStore.getState().user;
    if (user) {
      toast.success('Successfully logged in!', {
        description: `Welcome back, ${user.name}`
      });
      const path = user.role === 'STUDENT' ? '/student' : user.role === 'TEACHER' ? '/teacher' : '/admin';
      router.push(path);
    } else {
      toast.error('Login failed', {
        description: 'Please check your credentials and try again.'
      });
      setError('Login failed. Please try again.');
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-black mb-2">Welcome back</h1>
        <p className="text-zinc-400">Sign in to your Universe Impact account</p>
      </div>

      {error && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-rose-900/30 border border-rose-700/30 text-rose-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Email address</label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input pl-10"
              placeholder="you@universe.edu"
              required
            />
          </div>
        </div>
        <div>
          <label className="label">Password</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input pl-10 pr-10"
              placeholder="••••••••"
              required
            />
            <button type="button" onClick={() => setShowPw(!showPw)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="submit" disabled={isLoading} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
          {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</> : 'Sign in'}
        </motion.button>
      </form>

      <div className="mt-6 text-center text-sm text-zinc-500">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-indigo-400 hover:text-indigo-300 font-medium">
          Create one
        </Link>
      </div>

      {/* Demo credentials */}
      <div className="mt-8 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <p className="text-xs text-zinc-500 font-medium mb-3 uppercase tracking-wider">Demo accounts</p>
        <div className="space-y-2">
          {[
            { role: 'Student', email: 'student@universe.edu', pw: 'student123' },
            { role: 'Teacher', email: 'teacher@universe.edu', pw: 'teacher123' },
            { role: 'Admin', email: 'admin@universe.edu', pw: 'admin123' },
          ].map(d => (
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              key={d.role} type="button" onClick={() => { setEmail(d.email); setPassword(d.pw); }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-zinc-400 group-hover:text-white">{d.role}</span>
                <span className="text-xs text-zinc-600 group-hover:text-zinc-400">{d.email}</span>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}

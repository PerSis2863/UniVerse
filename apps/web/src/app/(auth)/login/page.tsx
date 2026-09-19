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
        <p className="text-zinc-600 dark:text-zinc-400">Sign in to your Universe Impact account</p>
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
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 dark:text-zinc-500" />
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
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 dark:text-zinc-500" />
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input pl-10 pr-10"
              placeholder="••••••••"
              required
            />
            <button type="button" onClick={() => setShowPw(!showPw)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-500 hover:text-zinc-300">
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

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-200 dark:border-white/10"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white dark:bg-zinc-950 text-zinc-500">Or continue with</span>
        </div>
      </div>

      <button 
        type="button" 
        onClick={() => {
          toast.info('Google verification', { description: 'Mocking Google login...' });
          setTimeout(() => login('student@universe.edu', 'student123').then(() => {
            const user = useAuthStore.getState().user;
            if (user) {
              toast.success('Successfully logged in!');
              const path = user.role === 'STUDENT' ? '/student' : user.role === 'TEACHER' ? '/teacher' : '/admin';
              router.push(path);
            }
          }), 1000);
        }}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors font-medium text-sm"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Sign in with Google
      </button>

      <div className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-500">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-indigo-400 hover:text-indigo-300 font-medium">
          Create one
        </Link>
      </div>

      {/* Demo credentials */}
      <div className="mt-8 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <p className="text-xs text-zinc-500 dark:text-zinc-500 font-medium mb-3 uppercase tracking-wider">Demo accounts</p>
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
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:text-white">{d.role}</span>
                <span className="text-xs text-zinc-600 group-hover:text-zinc-600 dark:text-zinc-400">{d.email}</span>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}

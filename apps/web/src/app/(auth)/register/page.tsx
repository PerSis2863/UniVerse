'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { Loader2, User, Mail, Lock } from 'lucide-react';

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'STUDENT' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { register, isLoading } = useAuthStore();
  const router = useRouter();

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await register(form.name, form.email, form.password, form.role);
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Registration failed.');
    }
  };

  if (success) return (
    <div className="text-center py-8">
      <div className="w-16 h-16 rounded-full bg-green-900/30 border border-green-700/30 flex items-center justify-center mx-auto mb-4 text-3xl">🎓</div>
      <h2 className="text-2xl font-black mb-2">Account created!</h2>
      <p className="text-zinc-600 dark:text-zinc-400">Redirecting to login...</p>
    </div>
  );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-black mb-2">Create account</h1>
        <p className="text-zinc-600 dark:text-zinc-400">Join UniVerse today</p>
      </div>

      {error && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-rose-900/30 border border-rose-700/30 text-rose-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Full name</label>
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 dark:text-zinc-500" />
            <input type="text" value={form.name} onChange={set('name')} className="input pl-10" placeholder="John Doe" required />
          </div>
        </div>
        <div>
          <label className="label">Email address</label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 dark:text-zinc-500" />
            <input type="email" value={form.email} onChange={set('email')} className="input pl-10" placeholder="you@universe.edu" required />
          </div>
        </div>
        <div>
          <label className="label">Password</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 dark:text-zinc-500" />
            <input type="password" value={form.password} onChange={set('password')} className="input pl-10" placeholder="Min 8 characters" minLength={8} required />
          </div>
        </div>
        <div>
          <label className="label">I am a...</label>
          <select value={form.role} onChange={set('role')} className="input">
            <option value="STUDENT">Student</option>
            <option value="TEACHER">Teacher / Mentor</option>
            <option value="ADMIN">Partner / Organization</option>
          </select>
        </div>
        <button type="submit" disabled={isLoading} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
          {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : 'Create account'}
        </button>
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
          alert('Google OAuth verification mock flow would happen here.');
        }}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors font-medium text-sm"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Sign up with Google
      </button>

      <div className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-500">
        Already have an account?{' '}
        <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">Sign in</Link>
      </div>
    </div>
  );
}

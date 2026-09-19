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
            <option value="TEACHER">Teacher</option>
          </select>
        </div>
        <button type="submit" disabled={isLoading} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
          {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : 'Create account'}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-500">
        Already have an account?{' '}
        <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">Sign in</Link>
      </div>
    </div>
  );
}

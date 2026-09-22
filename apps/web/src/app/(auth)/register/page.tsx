'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Mail, Lock, Loader2, User } from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { auth } from '@/lib/firebase';
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, updateProfile } from 'firebase/auth';
import { api } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRegisterSuccess = async (token: string, name: string) => {
    try {
      localStorage.setItem('accessToken', token);
      
      // Make API call to register/sync user data
      const { data: user } = await api.post('/auth/register', { name });
      
      setUser({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      });

      router.push(user.role === 'STUDENT' ? '/student' : user.role === 'TEACHER' ? '/teacher' : '/admin');
    } catch (err) {
      console.error('Failed to sync user data', err);
      setError('Registration successful, but failed to setup profile. Please try logging in.');
      router.push('/login');
    }
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName: name });
      const token = await userCredential.user.getIdToken();
      await handleRegisterSuccess(token, name);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to create account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const token = await userCredential.user.getIdToken();
      await handleRegisterSuccess(token, userCredential.user.displayName || '');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to sign up with Google.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-4">
          <Sparkles className="w-3 h-3" />
          Join the Network
        </div>
        <h1 className="text-3xl font-black text-white mb-2">Create an account</h1>
        <p className="text-zinc-400 text-sm">
          Start your journey as a student, teacher, or organization.
        </p>
      </div>

      <div className="bg-[#09090b] shadow-xl border border-zinc-800 rounded-2xl p-6 sm:p-8">
        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        <button 
          type="button" 
          onClick={handleGoogleRegister}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 rounded-xl py-2.5 px-4 font-semibold text-sm transition-colors disabled:opacity-50 mb-6"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Sign up with Google
        </button>

        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-zinc-800"></div>
          <div className="text-zinc-500 text-xs font-medium uppercase">Or continue with</div>
          <div className="flex-1 h-px bg-zinc-800"></div>
        </div>

        <form onSubmit={handleEmailRegister} className="space-y-4">
          <div>
            <label className="block text-zinc-400 text-sm font-medium mb-1.5">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-zinc-900/50 border border-zinc-800 text-white placeholder:text-zinc-500 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                placeholder="John Doe"
              />
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 text-sm font-medium mb-1.5">Email address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-900/50 border border-zinc-800 text-white placeholder:text-zinc-500 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                placeholder="name@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 text-sm font-medium mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-900/50 border border-zinc-800 text-white placeholder:text-zinc-500 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                placeholder="••••••••"
                minLength={6}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl py-2.5 text-sm shadow-md transition-colors flex items-center justify-center gap-2 mt-6 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-zinc-800 text-center">
          <p className="text-zinc-400 text-sm">
            Already have an account?{' '}
            <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-zinc-600">
        By joining, you agree to our{' '}
        <Link href="#" className="text-indigo-400 hover:underline">Terms</Link>
        {' & '}
        <Link href="#" className="text-indigo-400 hover:underline">Privacy Policy</Link>.
      </p>
    </div>
  );
}

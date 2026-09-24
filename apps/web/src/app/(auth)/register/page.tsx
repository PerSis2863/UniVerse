'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Mail, Lock, Loader2, User, ArrowRight, ArrowLeft, GraduationCap, Building2, Globe, Check } from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { auth } from '@/lib/firebase';
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, updateProfile } from 'firebase/auth';
import { api } from '@/lib/api';
import { PhoneAuthFlow } from '@/components/auth/PhoneAuthFlow';

const ROLES = [
  {
    id: 'STUDENT',
    label: 'Student',
    description: 'Access courses, grades, and social impact projects',
    icon: GraduationCap,
    color: 'indigo',
    gradient: 'from-indigo-500/20 to-purple-500/20',
    border: 'border-indigo-500',
    glow: 'shadow-indigo-500/20',
  },
  {
    id: 'TEACHER',
    label: 'University Staff',
    description: 'Manage courses, students, and academic content',
    icon: Building2,
    color: 'emerald',
    gradient: 'from-emerald-500/20 to-teal-500/20',
    border: 'border-emerald-500',
    glow: 'shadow-emerald-500/20',
  },
  {
    id: 'ADMIN',
    label: 'NGO Representative',
    description: 'Post projects, collaborate with universities',
    icon: Globe,
    color: 'amber',
    gradient: 'from-amber-500/20 to-orange-500/20',
    border: 'border-amber-500',
    glow: 'shadow-amber-500/20',
  },
] as const;

export default function RegisterPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();

  const [step, setStep] = useState<'role' | 'credentials'>('role');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPhoneFlow, setShowPhoneFlow] = useState(false);

  const selectedRoleData = ROLES.find(r => r.id === selectedRole);

  const handleRegisterSuccess = async (token: string, displayName: string) => {
    try {
      localStorage.setItem('accessToken', token);
      const { data: user } = await api.post('/auth/register', { name: displayName, role: selectedRole });
      setUser({ id: user.id, name: user.name, email: user.email, role: user.role });
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
        <p className="text-zinc-400 text-sm">Start your journey as a student, teacher, or organization.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-6">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${step === 'role' ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
          {step === 'credentials' ? <Check className="w-3 h-3" /> : <span>1</span>}
          Choose Role
        </div>
        <div className="flex-1 h-px bg-zinc-800" />
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${step === 'credentials' ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
          <span>2</span>
          Create Account
        </div>
      </div>

      <div className="bg-[#09090b] shadow-xl border border-zinc-800 rounded-2xl p-6 sm:p-8">
        {error && !showPhoneFlow && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>
        )}

        {/* STEP 1: Role Selection */}
        {step === 'role' && (
          <div>
            <p className="text-zinc-400 text-sm mb-5 font-medium">I am joining as a...</p>
            <div className="space-y-3 mb-6">
              {ROLES.map((role) => {
                const Icon = role.icon;
                const isSelected = selectedRole === role.id;
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => setSelectedRole(role.id)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left group ${
                      isSelected
                        ? `${role.border} bg-gradient-to-r ${role.gradient} shadow-lg ${role.glow}`
                        : 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-600 hover:bg-zinc-900/60'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                      isSelected ? 'bg-white/10' : 'bg-zinc-800 group-hover:bg-zinc-700'
                    }`}>
                      <Icon className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-zinc-400'}`} />
                    </div>
                    <div className="flex-1">
                      <div className={`font-semibold text-sm ${isSelected ? 'text-white' : 'text-zinc-300'}`}>{role.label}</div>
                      <div className={`text-xs mt-0.5 ${isSelected ? 'text-white/70' : 'text-zinc-500'}`}>{role.description}</div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      isSelected ? 'border-white bg-white/20' : 'border-zinc-700'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={!selectedRole}
              onClick={() => setStep('credentials')}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-sm shadow-md transition-colors flex items-center justify-center gap-2"
            >
              Continue as {selectedRoleData?.label || '...'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 2: Credentials */}
        {step === 'credentials' && (
          <>
            {showPhoneFlow ? (
              <PhoneAuthFlow isRegister={true} onSuccess={handleRegisterSuccess} onCancel={() => setShowPhoneFlow(false)} />
            ) : (
              <>
                {/* Role badge */}
                {selectedRoleData && (
                  <div className={`flex items-center gap-2 p-3 rounded-xl border bg-gradient-to-r ${selectedRoleData.gradient} ${selectedRoleData.border} mb-5`}>
                    <selectedRoleData.icon className="w-4 h-4 text-white" />
                    <span className="text-white text-sm font-semibold">Signing up as {selectedRoleData.label}</span>
                    <button onClick={() => setStep('role')} className="ml-auto text-white/60 hover:text-white text-xs underline">Change</button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 mb-6">
                  <button
                    type="button"
                    onClick={handleGoogleRegister}
                    disabled={isLoading}
                    className="flex items-center justify-center gap-2 border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 rounded-xl py-2.5 px-4 font-semibold text-sm transition-colors disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Google
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPhoneFlow(true)}
                    disabled={isLoading}
                    className="flex items-center justify-center gap-2 border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 rounded-xl py-2.5 px-4 font-semibold text-sm transition-colors disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    Phone
                  </button>
                </div>

                <div className="flex items-center gap-4 mb-6">
                  <div className="flex-1 h-px bg-zinc-800" />
                  <div className="text-zinc-500 text-xs font-medium uppercase">Or with email</div>
                  <div className="flex-1 h-px bg-zinc-800" />
                </div>

                <form onSubmit={handleEmailRegister} className="space-y-4">
                  <div>
                    <label className="block text-zinc-400 text-sm font-medium mb-1.5">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
                        className="w-full bg-zinc-900/50 border border-zinc-800 text-white placeholder:text-zinc-500 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                        placeholder="John Doe" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-sm font-medium mb-1.5">Email address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-zinc-900/50 border border-zinc-800 text-white placeholder:text-zinc-500 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                        placeholder="name@example.com" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-sm font-medium mb-1.5">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-zinc-900/50 border border-zinc-800 text-white placeholder:text-zinc-500 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                        placeholder="••••••••" minLength={6} />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setStep('role')}
                      className="flex items-center justify-center gap-2 border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 rounded-xl py-2.5 px-4 font-semibold text-sm transition-colors">
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <button type="submit" disabled={isLoading}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl py-2.5 text-sm shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Account'}
                    </button>
                  </div>
                </form>

                <div className="mt-6 pt-6 border-t border-zinc-800 text-center">
                  <p className="text-zinc-400 text-sm">
                    Already have an account?{' '}
                    <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">Sign in</Link>
                  </p>
                </div>
              </>
            )}
          </>
        )}
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

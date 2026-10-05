'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Mail, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import Link from '@/components/ui/Link';
import { useAuthStore } from '@/store/auth';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, OAuthProvider, sendPasswordResetEmail } from 'firebase/auth';
import { authErrorMessage } from '@/lib/auth-errors';
import { api } from '@/lib/api';
import { PhoneAuthFlow } from '@/components/auth/PhoneAuthFlow';
import { reportSession } from '@/lib/sign-in-history';
import { EmailVerifyPanel } from '@/components/auth/EmailVerifyPanel';
import { TwoStepPanel } from '@/components/auth/TwoStepPanel';

export default function LoginPage() {
  const router = useRouter();
  const { setUser, setTokens } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPhoneFlow, setShowPhoneFlow] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null); // password account whose email isn't confirmed yet
  // Admin or owner account that still has to type the emailed sign-in code: how it signed in.
  const [twoStep, setTwoStep] = useState<{ token: string; method?: 'google' | 'password' | 'phone' | 'apple' } | null>(null);

  // Sent here by the app (?step=code) when an admin's session still needs the emailed code.
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('step')) return;
    void auth.authStateReady().then(async () => {
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      if (token) setTwoStep({ token }); // eslint-disable-line react-hooks/set-state-in-effect
    });
  }, []);

  const handleLoginSuccess = async (token: string, method?: 'google' | 'password' | 'phone' | 'apple') => {
    try {
      localStorage.setItem('accessToken', token);
      setTokens(token);
      let user;
      try {
        ({ data: user } = await api.get('/auth/me'));
      } catch (err) {
        // Email + password account that hasn't confirmed its address yet: show the verify step.
        // Admin or owner: type the emailed code first (src/server/two-step.ts).
        if ((err as { response?: { data?: { code?: string } } }).response?.data?.code === 'TWO_STEP_REQUIRED') {
          setTwoStep({ token, method });
          return;
        }
        if ((err as { response?: { data?: { code?: string } } }).response?.data?.code === 'EMAIL_NOT_VERIFIED') {
          localStorage.removeItem('accessToken');
          setVerifyEmail(auth.currentUser?.email ?? email);
          return;
        }
        throw err;
      }
      setUser({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status || 'ACTIVE',
        createdAt: user.createdAt || new Date().toISOString(),
        avatar: user.avatar,
        owner: user.owner === true,
      });
      reportSession('SIGN_IN', token.startsWith('mock-token-') ? 'demo' : method);
      // First time here (signed in with Google / Apple / phone but never registered): finish
      // registration — choose Individual / Staff / Organization and a name — before anything else.
      if (!user.onboardedAt && !user.owner) {
        router.push('/register?continue=1');
        return;
      }
      const next = new URLSearchParams(location.search).get('next');
      router.push(next && /^\/[a-z]/.test(next) ? next : user.owner ? '/console' : user.role === 'STUDENT' ? '/student' : user.role === 'TEACHER' ? '/teacher' : '/admin');
    } catch (err) {
      console.error('Failed to sync user data', err);
      setError('Login successful, but failed to retrieve user data. Please contact support.');
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const token = await userCredential.user.getIdToken();
      await handleLoginSuccess(token, 'password');
    } catch (err) {
      console.error(err);
      setError(authErrorMessage(err, 'Failed to sign in. Please check your email and password.'));
    } finally {
      setIsLoading(false);
    }
  };

  // Emails a password reset link. Firebase doesn't say whether the address has an account, so
  // the message is the same either way (no one can use this to find out who is registered).
  const handleForgotPassword = async () => {
    setError('');
    setNotice('');
    if (!email.trim()) {
      setError('Enter your email address above, then choose “Forgot password?” again.');
      return;
    }
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setNotice(`If ${email.trim()} has a UniVerse account with a password, we’ve sent it a reset link. Check your inbox and spam folder.`);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/user-not-found') setNotice(`If ${email.trim()} has a UniVerse account with a password, we’ve sent it a reset link.`);
      else setError(authErrorMessage(err, 'Couldn’t send the reset email. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const token = await userCredential.user.getIdToken();
      await handleLoginSuccess(token, 'google');
    } catch (err) {
      console.error(err);
      setError(authErrorMessage(err, 'Failed to sign in with Google.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    setIsLoading(true);
    setError('');
    try {
      const provider = new OAuthProvider('apple.com');
      const userCredential = await signInWithPopup(auth, provider);
      const token = await userCredential.user.getIdToken();
      await handleLoginSuccess(token, 'apple');
    } catch (err) {
      console.error(err);
      setError(authErrorMessage(err, 'Failed to sign in with Apple.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="w-full">
        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-4">
            <Sparkles className="w-3 h-3" />
            UniVerse Impact
          </div>
          <h1 className="text-3xl font-black text-white mb-2">Welcome back</h1>
          <p className="text-zinc-400 text-sm">Sign in to continue making an impact.</p>
        </div>

        <div className="bg-white/[0.04] backdrop-blur-xl shadow-2xl shadow-indigo-950/40 border border-white/10 rounded-2xl p-6 sm:p-8">
          {twoStep ? (
            <TwoStepPanel
              onDone={() => { const t = twoStep; setTwoStep(null); void handleLoginSuccess(t.token, t.method); }}
              onCancel={async () => { await auth.signOut().catch(() => {}); localStorage.removeItem('accessToken'); setTwoStep(null); }}
            />
          ) : verifyEmail ? (
            <EmailVerifyPanel email={verifyEmail} sendOnMount onVerified={(token) => { setVerifyEmail(null); return handleLoginSuccess(token, 'password'); }} onCancel={async () => { await auth.signOut().catch(() => {}); setVerifyEmail(null); }} />
          ) : (
          <>
          <h2 className="text-xl font-bold text-white mb-6">Sign In</h2>

          {error && !showPhoneFlow && (
            <div role="alert" className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}
          {notice && !showPhoneFlow && (
            <div role="status" className="mb-6 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-sm">
              {notice}
            </div>
          )}

          {showPhoneFlow ? (
            <PhoneAuthFlow
              isRegister={false}
              onSuccess={(token: string) => handleLoginSuccess(token, 'phone')}
              onCancel={() => setShowPhoneFlow(false)}
            />
          ) : (
            <>
              {/* Social buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 rounded-xl py-2.5 px-4 font-semibold text-sm transition-colors disabled:opacity-50"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Google
                </button>

                <button
                  type="button"
                  onClick={handleAppleLogin}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 rounded-xl py-2.5 px-4 font-semibold text-sm transition-colors disabled:opacity-50"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.19 2.31-.88 3.5-.84 1.5.05 2.78.8 3.59 2.07-3.07 1.65-2.49 5.56.76 6.92-.72 1.6-1.58 3.19-2.93 4.02zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                  </svg>
                  Apple
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowPhoneFlow(true)}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 rounded-xl py-2.5 px-4 font-semibold text-sm transition-colors disabled:opacity-50 mb-6"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Continue with Phone
              </button>

              <div className="flex items-center gap-4 mb-6">
                <div className="flex-1 h-px bg-zinc-800"></div>
                <div className="text-zinc-500 text-xs font-medium uppercase">Or continue with</div>
                <div className="flex-1 h-px bg-zinc-800"></div>
              </div>

              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div>
                  <label className="block text-zinc-400 text-sm font-medium mb-1.5">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-zinc-900/50 border border-zinc-800 text-white placeholder:text-zinc-500 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                      placeholder="name@example.com"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="login-password" className="block text-zinc-400 text-sm font-medium">Password</label>
                    <button type="button" onClick={handleForgotPassword} disabled={isLoading} className="text-xs font-medium text-indigo-400 hover:text-indigo-300 disabled:opacity-50">
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-zinc-900/50 border border-zinc-800 text-white placeholder:text-zinc-500 rounded-xl py-2.5 pl-10 pr-11 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                      placeholder="••••••••"
                    />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 inline-flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn-primary w-full mt-6"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign In'}
                </button>
              </form>

              <div className="mt-6 pt-6 border-t border-zinc-800 text-center">
                <p className="text-zinc-400 text-sm">
                  Don&apos;t have an account?{' '}
                  <Link href="/register" className="text-indigo-400 hover:text-indigo-300 font-medium">
                    Sign up
                  </Link>
                </p>
              </div>
            </>
          )}
          </>
          )}
        </div>

        {/* Demo Accounts (only when demo login is enabled for this deployment) */}
        {process.env.NEXT_PUBLIC_DEMO_LOGIN === 'true' && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-zinc-400 mb-4 text-center">Or test with demo accounts</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => handleLoginSuccess('mock-token-demo@student.com')}
              className="flex flex-col items-start p-4 rounded-xl border border-zinc-800 bg-[#1c1c1e] hover:bg-zinc-800 hover:border-zinc-700 transition-all text-left group"
            >
              <div className="font-semibold text-zinc-300 text-sm group-hover:text-white transition-colors">Demo Student</div>
              <div className="text-zinc-500 text-xs mt-1">Full access to student dashboard</div>
            </button>

            <button
              onClick={() => handleLoginSuccess('mock-token-demo@teacher.com')}
              className="flex flex-col items-start p-4 rounded-xl border border-zinc-800 bg-[#1c1c1e] hover:bg-zinc-800 hover:border-zinc-700 transition-all text-left group"
            >
              <div className="font-semibold text-zinc-300 text-sm group-hover:text-white transition-colors">Demo Teacher</div>
              <div className="text-zinc-500 text-xs mt-1">Manage classes &amp; grades</div>
            </button>

            <button
              onClick={() => handleLoginSuccess('mock-token-demo@admin.com')}
              className="flex flex-col items-start p-4 rounded-xl border border-zinc-800 bg-[#1c1c1e] hover:bg-zinc-800 hover:border-zinc-700 transition-all text-left group"
            >
              <div className="font-semibold text-zinc-300 text-sm group-hover:text-white transition-colors">Demo Admin</div>
              <div className="text-zinc-500 text-xs mt-1">System configuration</div>
            </button>

            <button
              onClick={() => handleLoginSuccess('mock-token-it-support@universe.com')}
              className="flex flex-col items-start p-4 rounded-xl border border-zinc-800 bg-[#1c1c1e] hover:bg-zinc-800 hover:border-zinc-700 transition-all text-left group"
            >
              <div className="font-semibold text-zinc-300 text-sm group-hover:text-white transition-colors">IT Support</div>
              <div className="text-zinc-500 text-xs mt-1">Helpdesk access</div>
            </button>
          </div>
        </div>
        )}
        <p className="mt-6 text-center text-xs text-zinc-600">
          <Link href="/terms" className="hover:text-indigo-400">Terms and Conditions</Link>
          {' · '}
          <Link href="/privacy" className="hover:text-indigo-400">Privacy Policy</Link>
        </p>
      </div>
    </>
  );
}

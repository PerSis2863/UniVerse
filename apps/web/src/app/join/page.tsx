'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GraduationCap, Building2, Globe, Loader2, CheckCircle2, XCircle, Sparkles } from 'lucide-react';
import Link from 'next/link';

const ROLE_DETAILS: Record<string, {
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  gradient: string;
}> = {
  STUDENT: {
    label: 'Student',
    description: 'You\'ve been invited to join as a student. Access courses, grades, and social impact projects.',
    icon: GraduationCap,
    color: 'indigo',
    gradient: 'from-indigo-500 to-purple-600',
  },
  TEACHER: {
    label: 'University Staff',
    description: 'You\'ve been invited to join as University Staff. Manage courses, students, and academic content.',
    icon: Building2,
    color: 'emerald',
    gradient: 'from-emerald-500 to-teal-600',
  },
  ADMIN: {
    label: 'NGO Representative',
    description: 'You\'ve been invited to represent an NGO. Post projects and collaborate with universities.',
    icon: Globe,
    color: 'amber',
    gradient: 'from-amber-500 to-orange-600',
  },
};

export default function JoinPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get('code');

  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid'>('loading');
  const [role, setRole] = useState<string>('');

  useEffect(() => {
    if (!code) {
      setStatus('invalid');
      return;
    }

    // Resolve the invite code
    fetch(`/api/invite?code=${code}`)
      .then(res => res.json())
      .then(data => {
        if (data.role) {
          setRole(data.role);
          setStatus('valid');
          // Store invite info for register page to pick up
          sessionStorage.setItem('inviteCode', code);
          sessionStorage.setItem('inviteRole', data.role);
        } else {
          setStatus('invalid');
        }
      })
      .catch(() => setStatus('invalid'));
  }, [code]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">Validating invite link...</p>
        </div>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Invalid Invite Link</h1>
          <p className="text-zinc-400 mb-6">This invite link is invalid or has expired. Please request a new one.</p>
          <Link href="/register" className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl px-6 py-3 transition-colors">
            Register Normally
          </Link>
        </div>
      </div>
    );
  }

  const roleData = ROLE_DETAILS[role];
  const Icon = roleData?.icon || GraduationCap;

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-4">
            <Sparkles className="w-3 h-3" />
            You're invited!
          </div>
        </div>

        {/* Role card */}
        <div className={`bg-gradient-to-br ${roleData?.gradient} p-0.5 rounded-2xl mb-6`}>
          <div className="bg-zinc-950 rounded-2xl p-6 text-center">
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${roleData?.gradient} flex items-center justify-center mx-auto mb-4`}>
              <Icon className="w-8 h-8 text-white" />
            </div>
            <div className="flex items-center justify-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-400 text-sm font-semibold">Invite Verified</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Join as {roleData?.label}</h1>
            <p className="text-zinc-400 text-sm leading-relaxed">{roleData?.description}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Link
            href={`/register?invite=${code}`}
            className={`flex items-center justify-center gap-2 w-full bg-gradient-to-r ${roleData?.gradient} text-white font-bold rounded-xl py-3 text-sm shadow-lg transition-opacity hover:opacity-90`}
          >
            Create Account as {roleData?.label}
          </Link>
          <Link
            href={`/login?invite=${code}`}
            className="flex items-center justify-center gap-2 w-full border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl py-3 text-sm font-semibold transition-colors"
          >
            Already have an account? Sign in
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Invite code: <span className="font-mono text-zinc-500">{code}</span>
        </p>
      </div>
    </div>
  );
}

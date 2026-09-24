'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, XCircle, X, ChevronRight, Shield } from 'lucide-react';

interface VerificationStatusModalProps {
  user: {
    name: string;
    email: string;
    phone?: string | null;
    status: string;
    role: string;
    studentProfile?: { university?: string | null } | null;
  };
  onClose: () => void;
}

interface StatusItem {
  label: string;
  status: 'verified' | 'pending' | 'missing';
  description: string;
  actionLabel?: string;
  actionHref?: string;
}

export function VerificationStatusModal({ user, onClose }: VerificationStatusModalProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const statusItems: StatusItem[] = [
    {
      label: 'Email Verified',
      status: user.email ? 'verified' : 'missing',
      description: user.email ? user.email : 'No email linked',
    },
    {
      label: 'Phone Verified',
      status: user.phone ? 'verified' : 'pending',
      description: user.phone ? user.phone : 'Not linked yet',
      actionLabel: user.phone ? undefined : 'Add phone',
      actionHref: '/student/settings',
    },
    {
      label: 'Account Active',
      status: user.status === 'ACTIVE' ? 'verified' : 'pending',
      description: user.status === 'ACTIVE' ? 'Account is fully active' : 'Awaiting admin approval',
    },
    ...(user.role === 'STUDENT' ? [{
      label: 'University Verified',
      status: (user.studentProfile?.university ? 'verified' : 'pending') as 'verified' | 'pending' | 'missing',
      description: user.studentProfile?.university || 'Complete your profile',
      actionLabel: user.studentProfile?.university ? undefined : 'Update profile',
      actionHref: '/student/information',
    }] : []),
  ];

  const verifiedCount = statusItems.filter(i => i.status === 'verified').length;
  const total = statusItems.length;
  const percentage = Math.round((verifiedCount / total) * 100);

  const StatusIcon = ({ status }: { status: StatusItem['status'] }) => {
    if (status === 'verified') return <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
    if (status === 'pending') return <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    return <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />;
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        visible ? 'bg-black/60 backdrop-blur-sm' : 'bg-transparent'
      }`}
      onClick={handleClose}
    >
      <div
        className={`bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-sm transition-all duration-300 ${
          visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center">
                <Shield className="w-4 h-4 text-indigo-400" />
              </div>
              <span className="text-white font-bold text-sm">Verification Status</span>
            </div>
            <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-zinc-400 text-sm">Welcome back, <span className="text-white font-semibold">{user.name.split(' ')[0]}!</span></p>

          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-zinc-500">{verifiedCount}/{total} verified</span>
              <span className={`font-semibold ${percentage === 100 ? 'text-emerald-400' : 'text-indigo-400'}`}>{percentage}% complete</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${percentage === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500'}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* Status list */}
        <div className="p-5 space-y-3">
          {statusItems.map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <StatusIcon status={item.status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{item.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                    item.status === 'verified' ? 'bg-emerald-500/20 text-emerald-400' :
                    item.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {item.status === 'verified' ? '✓' : item.status === 'pending' ? 'Pending' : 'Missing'}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 truncate">{item.description}</p>
              </div>
              {item.actionHref && (
                <a href={item.actionHref} className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium flex-shrink-0">
                  {item.actionLabel} <ChevronRight className="w-3 h-3" />
                </a>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          {percentage < 100 && (
            <p className="text-xs text-zinc-500 text-center mb-3">
              Complete your verification to unlock collaboration features
            </p>
          )}
          <button
            onClick={handleClose}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors"
          >
            {percentage === 100 ? 'Continue to Dashboard' : 'Go to Dashboard'}
          </button>
        </div>
      </div>
    </div>
  );
}

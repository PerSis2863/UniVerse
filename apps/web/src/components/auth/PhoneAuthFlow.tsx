'use client';

import { useState, useEffect } from 'react';
import { Loader2, Phone, KeyRound, ArrowLeft, User } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';

// Add the window type extension here so we don't get TS errors
declare global {
  interface Window {
    recaptchaVerifier: any;
    grecaptcha: any;
  }
}

interface PhoneAuthFlowProps {
  isRegister: boolean;
  onSuccess: (token: string, name?: string) => Promise<void>;
  onCancel: () => void;
}

type Step = 'PHONE_INPUT' | 'CODE_INPUT';

export function PhoneAuthFlow({ isRegister, onSuccess, onCancel }: PhoneAuthFlowProps) {
  const [step, setStep] = useState<Step>('PHONE_INPUT');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  useEffect(() => {
    // Initialize RecaptchaVerifier
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {
          // reCAPTCHA solved
        },
        'expired-callback': () => {
          setError('reCAPTCHA expired. Please try again.');
        }
      });
    }
  }, []);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegister && !name.trim()) {
      setError('Please enter your full name first.');
      return;
    }
    if (!phoneNumber) {
      setError('Please enter a valid phone number.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const appVerifier = window.recaptchaVerifier;
      // Firebase expects phone numbers in E.164 format (e.g. +16505551234)
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
      
      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      setConfirmationResult(confirmation);
      setStep('CODE_INPUT');
    } catch (err: any) {
      console.error('Error sending code:', err);
      // Reset reCAPTCHA on error
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.render().then(function(widgetId: any) {
          window.grecaptcha.reset(widgetId);
        });
      }
      setError(err.message || 'Failed to send SMS code. Make sure the phone number includes the country code (e.g. +1).');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) {
      setError('Please enter the verification code.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      if (!confirmationResult) throw new Error('No confirmation result found.');
      const result = await confirmationResult.confirm(code);
      const token = await result.user.getIdToken();
      await onSuccess(token, isRegister ? name : undefined);
    } catch (err: any) {
      console.error('Error verifying code:', err);
      setError(err.message || 'Invalid verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 w-full">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {step === 'PHONE_INPUT' ? (
        <form onSubmit={handleSendCode} className="space-y-4">
          {isRegister && (
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
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-zinc-400 text-sm font-medium mb-1.5">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="tel"
                required
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full bg-zinc-900/50 border border-zinc-800 text-white placeholder:text-zinc-500 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                placeholder="+1 555 123 4567"
                disabled={isLoading}
              />
            </div>
            <p className="text-zinc-500 text-xs mt-1">Include country code (e.g. +1 for US)</p>
          </div>

          <div id="recaptcha-container"></div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl py-2.5 text-sm shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Code'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleVerifyCode} className="space-y-4">
          <div>
            <label className="block text-zinc-400 text-sm font-medium mb-1.5">Verification Code</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full bg-zinc-900/50 border border-zinc-800 text-white placeholder:text-zinc-500 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors tracking-widest text-center"
                placeholder="123456"
                disabled={isLoading}
                maxLength={6}
              />
            </div>
            <p className="text-zinc-500 text-xs mt-2 text-center">
              We sent an SMS to {phoneNumber}
            </p>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={() => {
                setStep('PHONE_INPUT');
                setCode('');
              }}
              disabled={isLoading}
              className="px-4 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors disabled:opacity-50 flex items-center justify-center"
              aria-label="Go back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              type="submit"
              disabled={isLoading || code.length < 6}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl py-2.5 text-sm shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify & Continue'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

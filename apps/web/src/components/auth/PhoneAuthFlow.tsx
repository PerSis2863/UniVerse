'use client';

import { useState, useEffect } from 'react';
import { authErrorMessage } from '@/lib/auth-errors';
import { Loader2, ArrowLeft, User, Globe } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import PhoneInput, { type Country } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { OtpInput, type OtpStatus } from '@/components/ui/OtpInput';

// Add the window type extension here so we don't get TS errors
declare global {
  interface Window {
    recaptchaVerifier?: RecaptchaVerifier;
    grecaptcha?: { reset(widgetId?: number): void };
  }
}

const CustomFlag = () => (
  <Globe className="w-5 h-5 text-zinc-400" />
);

interface PhoneAuthFlowProps {
  isRegister: boolean;
  onSuccess: (token: string, name?: string) => Promise<void>;
  onCancel: () => void;
}

type Step = 'PHONE_INPUT' | 'CODE_INPUT';

export function PhoneAuthFlow({ isRegister, onSuccess, onCancel }: PhoneAuthFlowProps) {
  const [step, setStep] = useState<Step>('PHONE_INPUT');
  const [phoneNumber, setPhoneNumber] = useState('');
  // The country to start from: the browser's language region (en-IN → India), else the US. The
  // number box always shows its code (+91…), so the chosen country is visible.
  const [country] = useState(() => {
    const region = typeof navigator === 'undefined' ? '' : /-([A-Z]{2})$/i.exec(navigator.language)?.[1]?.toUpperCase();
    return (region || 'US') as Country;
  });
  const [code, setCode] = useState('');
  const [check, setCheck] = useState<OtpStatus>('idle');
  // Signed in by the code: carried on once the tick has played.
  const [token, setToken] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  useEffect(() => {
    // Clear any existing recaptcha verifier to prevent "auth/internal-error" on hot reloads
    if (window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier.clear();
      } catch {}
      window.recaptchaVerifier = undefined;
    }

    // Initialize RecaptchaVerifier
    window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA solved
      },
      'expired-callback': () => {
        setError('reCAPTCHA expired. Please try again.');
      }
    });

    return () => {
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
        } catch {}
        window.recaptchaVerifier = undefined;
      }
    };
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
      // react-phone-number-input already formats the value as E.164 (e.g. +16505551234)
      const confirmation = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
      setConfirmationResult(confirmation);
      setStep('CODE_INPUT');
    } catch (err) {
      console.error('Error sending code:', err);
      // Reset reCAPTCHA on error
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.render().then((widgetId: number) => {
          window.grecaptcha?.reset(widgetId);
        }).catch(() => {});
      }
      setError(authErrorMessage(err, 'The SMS code couldn’t be sent. Check the number and the country code, then try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  // The boxes form a ring while the code is checked; right: green and a tick, then signed in.
  const handleVerifyCode = async (value = code) => {
    if (value.length !== 6 || check !== 'idle') return;
    setIsLoading(true);
    setError('');
    setCheck('checking');
    try {
      if (!confirmationResult) throw new Error('No confirmation result found.');
      const result = await confirmationResult.confirm(value);
      setToken(await result.user.getIdToken());
      setCheck('good');
    } catch (err) {
      console.error('Error verifying code:', err);
      setError(authErrorMessage(err, 'Invalid verification code.'));
      setCheck('bad');
    }
  };
  const settled = async (s: 'good' | 'bad') => {
    if (s === 'good' && token) {
      try { await onSuccess(token, isRegister ? name : undefined); } catch (err) { setError(authErrorMessage(err, 'Could not sign you in.')); }
    } else setCode('');
    setCheck('idle');
    setIsLoading(false);
  };

  return (
    <div className="space-y-4 w-full">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {step === 'PHONE_INPUT' ? (
        <form onSubmit={handleSendCode} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-zinc-400 text-sm font-medium mb-1.5">Full Name</label>
              <div className="relative">
                <User className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-900/50 border border-zinc-800 text-white placeholder:text-zinc-500 rounded-xl py-2.5 ps-10 pe-4 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  placeholder="John Doe"
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-zinc-400 text-sm font-medium mb-1.5">Phone Number</label>
            <div className="relative phone-input-container">
              <PhoneInput
                placeholder="Enter phone number"
                value={phoneNumber}
                onChange={(value) => setPhoneNumber(value || '')}
                defaultCountry={country}
                international
                withCountryCallingCode
                countryCallingCodeEditable={false}
                flagComponent={CustomFlag}
                className="w-full bg-zinc-900/50 border border-zinc-800 text-white placeholder:text-zinc-500 rounded-xl py-2.5 px-4 text-sm focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-colors"
                disabled={isLoading}
              />
            </div>
            <style jsx global>{`
              .phone-input-container .PhoneInputInput {
                background: transparent;
                border: none;
                color: white;
                outline: none;
                font-size: 0.875rem; /* text-sm */
              }
              .phone-input-container .PhoneInputCountry {
                margin-right: 12px;
              }
              .phone-input-container .PhoneInputCountrySelectArrow {
                color: #5a6a73; /* text-zinc-500 */
              }
              .phone-input-container .PhoneInputCountryIcon--border {
                border-color: #253745; /* border-zinc-800 */
              }
              .phone-input-container .PhoneInputCountrySelect {
                background-color: #06141b;
                color: white;
              }
              .phone-input-container .PhoneInputCountrySelect option {
                background-color: #06141b;
                color: white;
              }
            `}</style>
          </div>

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
              className="btn-primary flex-1"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Code'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void handleVerifyCode(); }} className="space-y-4">
          <div>
            <p className="block text-zinc-400 text-sm font-medium mb-3 text-center">{check === 'good' ? <span className="text-emerald-300">Verified</span> : 'Verification code'}</p>
            <OtpInput value={code} onChange={setCode} onComplete={(v) => void handleVerifyCode(v)} status={check} onSettled={(st) => void settled(st)} label="Verification code" onDark autoFocus />
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
              className="btn-primary flex-1"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify & Continue'}
            </button>
          </div>
        </form>
      )}
      {/* Outside the steps: Google's invisible check keeps using this box after the code is sent, and
          crashed ("reading 'style'" of null) when it went away with the phone step. */}
      <div id="recaptcha-container" />
    </div>
  );
}

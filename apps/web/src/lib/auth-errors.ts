// Readable messages for Firebase sign-in errors (instead of "Firebase: Error (auth/…)").
const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'That email and password don’t match. Check them, or reset your password.',
  'auth/wrong-password': 'That email and password don’t match. Check them, or reset your password.',
  'auth/user-not-found': 'There’s no account with that email. Check it, or sign up.',
  'auth/invalid-email': 'That doesn’t look like a valid email address.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes, or reset your password.',
  'auth/user-disabled': 'This account has been disabled. Contact your administrator or myuniverseimpact@gmail.com.',
  'auth/network-request-failed': 'You seem to be offline. Check your connection and try again.',
  'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
  'auth/cancelled-popup-request': 'The sign-in window was closed before finishing.',
  'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.',
  'auth/account-exists-with-different-credential': 'This email already uses another sign-in method. Sign in the way you did before.',
  'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
  'auth/weak-password': 'Choose a stronger password: at least 8 characters, ideally with numbers and symbols.',
  'auth/missing-email': 'Enter your email address first.',
  'auth/invalid-phone-number': 'That phone number isn’t valid. Include the country code, e.g. +33 6 12 34 56 78.',
  'auth/invalid-verification-code': 'That code isn’t right. Check the SMS and try again.',
  'auth/code-expired': 'That code has expired. Ask for a new one.',
  'auth/quota-exceeded': 'Too many SMS codes were requested. Please try again later.',
};

export function authErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const code = (err as { code?: string } | null)?.code;
  if (code && MESSAGES[code]) return MESSAGES[code];
  const msg = (err as { message?: string } | null)?.message;
  return msg && !msg.startsWith('Firebase:') ? msg : fallback;
}

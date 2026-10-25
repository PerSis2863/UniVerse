import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithPopup, type AuthProvider, type User } from 'firebase/auth';
import { endViewAs, viewAsToken } from './view-as';

// Web App IDs look like "1:<sender id>:web:<hash>". A mis-pasted value (e.g. the project id) breaks
// Firebase with 400 INVALID_ARGUMENT, so fall back to the known-good id.
const DEFAULT_APP_ID = '1:842899663225:web:ed69380242c9e64d85a7a8';
const envAppId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim();
const appId = envAppId && /^1:\d+:web:[0-9a-f]+$/i.test(envAppId) ? envAppId : DEFAULT_APP_ID;

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyAeGcNltLMaDe0ApwprOJAB8vHvqdBpXNY',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'universe-71e68.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'universe-71e68',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'universe-71e68.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '842899663225',
  appId,
};

// Initialize Firebase only if it hasn't been initialized already
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
// A "view as" tab (owner support) must never sign the owner out of Firebase, which every tab shares.
if (viewAsToken()) auth.signOut = () => endViewAs();

// No Google Analytics: the Privacy Policy promises no third-party analytics or tracking.

type PopupResolver = { _initialize?: (a: typeof auth) => Promise<unknown> };

/**
 * Loads Google's sign-in helper (a script and a hidden frame) now. Firebase otherwise loads it
 * after the tap on "Google"/"Apple" on desktop Chrome, Edge and Firefox, and only then opens the
 * window: on a slow connection that's past the moment the browser allows a pop-up, so it's
 * blocked. Call it when a page with those buttons opens. (Safari and phones already load it early.)
 */
export function warmUpPopupSignIn() {
  // Firebase's own resolver (set by getAuth); _initialize is cached, so calling it again is free.
  const resolver = (auth as unknown as { _popupRedirectResolver?: PopupResolver })._popupRedirectResolver;
  resolver?._initialize?.(auth).catch(() => {});
}

/** Firebase's own glitch when a sign-in window answers after its request was cleaned up (a second
 * tap, or Safari noticing the window closed before its message arrived). It's thrown inside Firebase,
 * so the sign-in's own promise may never settle. */
export const isPopupGlitch = (e: unknown) => /INTERNAL ASSERTION FAILED: Pending promise was never set/i.test(String((e as { message?: string } | null)?.message ?? e));

let pending: Promise<{ user: User }> | null = null;

/**
 * Signs in with a pop-up, once at a time: a second tap while the window is open gets the same
 * result instead of a second window. If Firebase hits its glitch, it checks whether the person got
 * signed in anyway (a few seconds) instead of spinning forever.
 */
export function popupSignIn(provider: AuthProvider): Promise<{ user: User }> {
  if (pending) return pending;
  let onGlitch: (e: PromiseRejectionEvent) => void = () => {};
  const glitch = new Promise<{ user: User }>((resolve, reject) => {
    onGlitch = (e) => {
      if (!isPopupGlitch(e.reason)) return;
      e.preventDefault();
      let stop = () => {};
      const t = setTimeout(() => { stop(); reject(Object.assign(new Error('The sign-in window was interrupted. Please try again.'), { code: 'auth/popup-interrupted' })); }, 5000);
      stop = onAuthStateChanged(auth, (u) => { if (u) { clearTimeout(t); setTimeout(() => stop()); resolve({ user: u }); } });
    };
    window.addEventListener('unhandledrejection', onGlitch);
  });
  pending = Promise.race([signInWithPopup(auth, provider), glitch]).finally(() => {
    window.removeEventListener('unhandledrejection', onGlitch);
    pending = null;
  });
  return pending;
}

export { app, auth };

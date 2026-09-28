import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getAnalytics, isSupported } from 'firebase/analytics';

// Web App IDs look like "1:<sender id>:web:<hash>". A mis-pasted value (e.g. the project id) breaks
// Firebase Installations/Analytics with 400 INVALID_ARGUMENT, so fall back to the known-good id.
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
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || 'G-1WTJKL639F',
};

// Initialize Firebase only if it hasn't been initialized already
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

// Initialize Analytics only if supported (browser environment)
let analytics: any = null;
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}

export { app, auth, analytics };

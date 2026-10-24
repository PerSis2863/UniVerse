import type { Metadata, Viewport } from 'next';
import { LANGUAGE_SCRIPT } from '@/lib/language-script';
import UiTranslatorGate from '@/components/i18n/UiTranslatorGate';
import './globals.css';

import { Toaster } from 'sonner';
import ErrorMonitorBootstrap from '@/components/ErrorMonitorBootstrap';
import { MotionProvider } from '@/components/MotionProvider';
import { LightTrail } from '@/components/LightTrail';
import { ScrollMotion } from '@/components/ScrollMotion';
import { CallHost } from '@/components/call/CallHost';
import { UpdateNotifier } from '@/components/pwa/UpdateNotifier';
import { Suspense } from 'react';
import { NavProgress } from '@/components/layout/NavProgress';
import { recoveryScript } from '@/lib/recovery-script';
import { bootstrapPrefetchScript } from '@/lib/bootstrap';
import { DISPLAY_PREFS_SCRIPT } from '@/lib/display-prefs';

// Fonts: the device's own system font (San Francisco on Apple devices), set in globals.css, so no
// web font is downloaded and text matches the rest of the phone.

export const metadata: Metadata = {
  title: {
    default: 'UniVerse Impact — Global Education & Social Impact Platform',
    template: '%s | UniVerse Impact',
  },
  description: 'Connecting students, universities, and NGOs to collaborate on real-world social impact projects.',
  keywords: ['university', 'education', 'NGO', 'social impact', 'volunteering', 'students'],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'UniVerse',
  },
  formatDetection: {
    telephone: false,
  },
  // Links shared in chats and social apps show the picture (public/og.jpg, 1200 × 630).
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://universeimpact.com'),
  openGraph: {
    type: 'website',
    title: 'UniVerse Impact',
    description: 'The all-in-one university management platform.',
    siteName: 'UniVerse Impact',
    images: [{ url: '/og.jpg', width: 1200, height: 630, alt: 'UniVerse: one place for your whole campus' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'UniVerse Impact',
    description: 'The all-in-one university management platform.',
    images: ['/og.jpg'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lets the app draw under the iPhone notch / home indicator; the shell pads with safe-area insets.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7efe7' },
    { media: '(prefers-color-scheme: dark)', color: '#06141b' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Blocking script: applies .dark class before paint to prevent theme flash */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');var d=!t||t==='dark'||t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');else document.documentElement.classList.remove('dark');}catch(e){}})();` }} />
        {/* The page colour before the stylesheet arrives: a refresh in dark mode never flashes white */}
        <script dangerouslySetInnerHTML={{ __html: DISPLAY_PREFS_SCRIPT }} />
        {/* The saved language's direction (Arabic and Urdu read right to left) before paint */}
        <script dangerouslySetInnerHTML={{ __html: LANGUAGE_SCRIPT }} />
        <style dangerouslySetInnerHTML={{ __html: 'html{background:#f7efe7}html.dark{background:#06141b;color-scheme:dark}' }} />
        {/* An old tab after a deploy can ask for page files that no longer exist: load the new
            version (once), or show a Reload screen, never a blank or unstyled page. */}
        <script dangerouslySetInnerHTML={{ __html: recoveryScript }} />
        {/* Dashboards: start loading the first screen's data now, in parallel with the app's code */}
        <script dangerouslySetInnerHTML={{ __html: bootstrapPrefetchScript }} />
        {/* PWA: iOS touch icon */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2" />
      </head>
      <body className="min-h-screen antialiased" style={{ color: 'var(--text-primary)' }}>
          <ErrorMonitorBootstrap />
          <UpdateNotifier />
          <UiTranslatorGate />
          {/* UniVerse's two tones behind every page: indigo light from the top left, fuchsia from the bottom right. */}
          <div aria-hidden className="ambient-bg"><div className="ambient-bg__grid" /></div>
          <LightTrail />
          <MotionProvider>{children}<CallHost /><ScrollMotion /></MotionProvider>
          <Suspense fallback={null}><NavProgress /></Suspense>
          {/* iOS notification banners: drop in at the top, frosted, rounded. */}
          <Toaster
            position="top-center"
            offset={{ top: 16 }}
            mobileOffset={{ top: 'calc(env(safe-area-inset-top) + 8px)', left: 12, right: 12 }}
            gap={8}
            toastOptions={{
              style: { background: 'var(--toast-bg)', border: '0.5px solid var(--card-border)', borderRadius: 22, color: 'var(--text-primary)', boxShadow: '0 12px 40px -12px rgba(0,0,0,.35)', padding: '14px 16px' },
            }}
          />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from 'next';
import { Outfit, Inter } from 'next/font/google';
import './globals.css';

import { Toaster } from 'sonner';
import ErrorMonitorBootstrap from '@/components/ErrorMonitorBootstrap';
import { MotionProvider } from '@/components/MotionProvider';
import { UpdateNotifier } from '@/components/pwa/UpdateNotifier';
import { Suspense } from 'react';
import { NavProgress } from '@/components/layout/NavProgress';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

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
  openGraph: {
    type: 'website',
    title: 'UniVerse Impact',
    description: 'The all-in-one university management platform.',
    siteName: 'UniVerse Impact',
  },
  twitter: {
    card: 'summary',
    title: 'UniVerse Impact',
    description: 'The all-in-one university management platform.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lets the app draw under the iPhone notch / home indicator; the shell pads with safe-area insets.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0d13' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Blocking script: applies .dark class before paint to prevent theme flash */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');var d=!t||t==='dark'||t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');else document.documentElement.classList.remove('dark');}catch(e){}})();` }} />
        {/* PWA: iOS touch icon */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2" />
      </head>
      <body className={`${inter.variable} ${outfit.variable} min-h-screen antialiased`} style={{ backgroundColor: 'var(--background)', color: 'var(--text-primary)' }}>
          <ErrorMonitorBootstrap />
          <UpdateNotifier />
          <div aria-hidden className="ambient-bg"><div className="ambient-bg__grid" /></div>
          <MotionProvider>{children}</MotionProvider>
          <Suspense fallback={null}><NavProgress /></Suspense>
          <Toaster 
            position="bottom-right"
            mobileOffset={{ bottom: 'calc(var(--mobile-tabbar-h, 3.5rem) + env(safe-area-inset-bottom) + 12px)' }}
            gap={8}
            toastOptions={{
              // Solid background: the page's card colour is see-through in dark mode, which let text show through.
              style: { background: 'var(--toast-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)', boxShadow: '0 12px 32px -12px rgba(0,0,0,.45)' }
            }}
          />
      </body>
    </html>
  );
}

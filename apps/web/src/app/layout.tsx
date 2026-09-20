import type { Metadata } from 'next';
import { Outfit, Inter } from 'next/font/google';
import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';
import { Analytics } from "@vercel/analytics/react";
import { Toaster } from 'sonner';

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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        elements: {
          footer: "hidden",
          footerAction: "hidden",
          watermark: "hidden",
        },
        variables: {
          colorPrimary: '#6366f1',
          borderRadius: '0.75rem',
        },
      }}
    >
      <html lang="en" suppressHydrationWarning>
        <head>
          {/* Blocking script: applies .dark class before paint to prevent theme flash */}
          <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');var d=!t||t==='dark'||t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');else document.documentElement.classList.remove('dark');}catch(e){}})();` }} />
        </head>
        <body className={`${inter.variable} ${outfit.variable} min-h-screen antialiased`} style={{ backgroundColor: 'var(--background)', color: 'var(--text-primary)' }}>
            {children}
            <Toaster 
              position="bottom-right"
              toastOptions={{
                style: { background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }
              }}
            />
            <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}

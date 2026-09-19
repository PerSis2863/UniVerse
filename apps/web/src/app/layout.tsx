import type { Metadata } from 'next';
import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';

export const metadata: Metadata = {
  title: {
    default: 'UniVerse Impact — Global Education & Social Impact Platform',
    template: '%s | UniVerse Impact',
  },
  description: 'Connecting students, universities, and NGOs to collaborate on real-world social impact projects.',
  keywords: ['university', 'education', 'NGO', 'social impact', 'volunteering', 'students'],
};

import { Analytics } from "@vercel/analytics/react";
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/ThemeProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#6366f1',
          colorBackground: '#0d1424',
          borderRadius: '0.75rem',
        },
        elements: {
          card: 'bg-transparent shadow-none',
          headerTitle: 'font-black font-display text-2xl',
          headerSubtitle: 'text-zinc-400',
          socialButtonsBlockButton: 'border border-white/10 bg-white/5 hover:bg-white/10 text-white',
          formButtonPrimary: 'bg-indigo-600 hover:bg-indigo-500 text-white font-semibold',
          formFieldInput: 'bg-white/5 border border-white/10 text-white placeholder-zinc-500 focus:border-indigo-500/50',
          formFieldLabel: 'text-zinc-400 text-sm',
          footerActionLink: 'text-indigo-400 hover:text-indigo-300',
          identityPreviewEditButton: 'text-indigo-400',
          dividerLine: 'bg-white/10',
          dividerText: 'text-zinc-500',
        },
      }}
    >
      <html lang="en" suppressHydrationWarning>
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap"
            rel="stylesheet"
          />
        </head>
        <body className="min-h-screen bg-background text-foreground antialiased transition-colors duration-300">
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
            {children}
            <Toaster 
              position="bottom-right"
              toastOptions={{
                className: 'dark:bg-zinc-950 dark:border-white/10 dark:text-white bg-white border-zinc-200 text-zinc-900',
              }}
            />
            <Analytics />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}

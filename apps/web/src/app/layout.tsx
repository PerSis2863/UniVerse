import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Universe Impact — University Management Platform',
    template: '%s | Universe Impact',
  },
  description: 'A modern, full-featured university management platform for students, teachers, and administrators.',
  keywords: ['university', 'education', 'management', 'students', 'teachers'],
};

import { Analytics } from "@vercel/analytics/react";
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/ThemeProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
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
  );
}

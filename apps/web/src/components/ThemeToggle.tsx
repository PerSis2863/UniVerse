'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { applyTheme, getSavedTheme, watchSystemTheme, type Theme } from '@/lib/theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // On mount, read saved preference or default to dark
    const saved = getSavedTheme();
    setTheme(saved);
    applyTheme(saved, { animate: false });
    watchSystemTheme();
    setMounted(true);
    const sync = () => setTheme(getSavedTheme());
    window.addEventListener('universe:theme', sync);
    return () => window.removeEventListener('universe:theme', sync);
  }, []);

  const handleSet = (t: Theme, e?: React.MouseEvent) => {
    setTheme(t);
    applyTheme(t, e ? { from: { x: e.clientX, y: e.clientY } } : undefined);
    setIsOpen(false);
  };

  if (!mounted) return <div className="w-8 h-8 rounded-lg animate-pulse" style={{ background: 'var(--btn-ghost-hover-bg)' }} />;

  const icon = theme === 'dark' ? <Moon className="w-4 h-4" /> : theme === 'light' ? <Sun className="w-4 h-4" /> : <Monitor className="w-4 h-4" />;

  return (
    <div className="relative">
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="btn-ghost p-2"
        aria-label="Toggle theme"
      >
        {icon}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* backdrop to close on outside click */}
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 mt-2 w-36 rounded-xl shadow-2xl overflow-hidden z-50 border"
              style={{
                background: 'var(--card-bg)',
                borderColor: 'var(--card-border)',
                backdropFilter: 'blur(20px)',
              }}
            >
              <div className="flex flex-col p-1">
                {(['light', 'dark', 'system'] as Theme[]).map(t => (
                  <button
                    key={t}
                    onClick={(e) => handleSet(t, e)}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-all"
                    style={{
                      background: theme === t ? 'rgba(99,102,241,0.12)' : 'transparent',
                      color: theme === t ? 'var(--sidebar-item-active-color)' : 'var(--text-secondary)',
                      fontWeight: theme === t ? 600 : 400,
                    }}
                    onMouseEnter={e => { if (theme !== t) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover-bg)'; }}
                    onMouseLeave={e => { if (theme !== t) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    {t === 'light' ? <Sun className="w-4 h-4" /> : t === 'dark' ? <Moon className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                    <span className="capitalize">{t}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}




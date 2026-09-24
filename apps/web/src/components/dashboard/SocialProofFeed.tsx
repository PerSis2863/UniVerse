'use client';

import { useEffect, useState } from 'react';
import { Globe, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FeedItem {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  timeAgo: string;
}

const DEMO_FEED: FeedItem[] = [
  { id: '1', emoji: '⭐', title: 'Sarah just completed 5hrs tutoring (MIT)', subtitle: '📍 helping in Digital Literacy project', timeAgo: '2m ago' },
  { id: '2', emoji: '🎉', title: 'Green Earth hit 10K trees planted!', subtitle: '🚀 Latest milestone unlocked', timeAgo: '5m ago' },
  { id: '3', emoji: '🔥', title: 'New hackathon announced in London', subtitle: '🇬🇧 Spaces filling fast: 12/50', timeAgo: '12m ago' },
  { id: '4', emoji: '🤝', title: 'Oxford + 3 new NGOs partnering', subtitle: 'Huge expansion in UK region', timeAgo: '18m ago' },
  { id: '5', emoji: '🎖️', title: 'James unlocked "Mentor" badge', subtitle: 'Guided 15+ students to opportunities', timeAgo: '25m ago' },
  { id: '6', emoji: '🌱', title: 'Clean Water project reached 500 families', subtitle: '💧 WaterAid Kenya milestone', timeAgo: '32m ago' },
  { id: '7', emoji: '🏆', title: 'Tech4Good won Impact Award 2025', subtitle: 'Recognized for digital literacy work', timeAgo: '45m ago' },
  { id: '8', emoji: '📚', title: 'Maria completed Python certification', subtitle: '100% score on final assessment', timeAgo: '1h ago' },
];

export function SocialProofFeed() {
  const [items, setItems] = useState<FeedItem[]>(DEMO_FEED.slice(0, 5));
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // Rotate feed items every 4 seconds for a live feel
  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentIdx(prev => {
          const next = (prev + 1) % DEMO_FEED.length;
          const newItems = [];
          for (let i = 0; i < 5; i++) {
            newItems.push(DEMO_FEED[(next + i) % DEMO_FEED.length]);
          }
          setItems(newItems);
          return next;
        });
        setIsAnimating(false);
      }, 300);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="card p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <Globe className="w-3 h-3 text-emerald-500" />
        </div>
        <span className="text-zinc-900 dark:text-white font-bold text-sm">Live Impact Happening Now</span>
        <span className="relative flex h-2 w-2 ml-1">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
      </div>

      {/* Feed items */}
      <div className="space-y-2.5 relative min-h-[160px]">
        <AnimatePresence mode="popLayout">
          {items.map((item) => (
            <motion.div
              layout
              key={item.id + item.title}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 350, damping: 25 } }}
              exit={{ opacity: 0, y: -10, scale: 0.95, transition: { duration: 0.2 } }}
              className="flex items-start gap-2.5 group"
            >
              <span className="text-base flex-shrink-0 mt-0.5">{item.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-900 dark:text-zinc-200 font-medium leading-snug">{item.title}</p>
                <p className="text-[11px] text-zinc-500 leading-snug">{item.subtitle}</p>
              </div>
              <span className="text-[10px] text-zinc-500 flex-shrink-0 mt-0.5">{item.timeAgo}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-zinc-200 dark:border-white/[0.05]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-500" />
            <span className="text-[10px] text-zinc-500 font-medium">
              <span className="text-amber-600 dark:text-amber-400 font-bold">247</span> actions today
            </span>
          </div>
          <span className="text-[10px] text-zinc-500">Updates every few seconds</span>
        </div>
      </div>
    </div>
  );
}

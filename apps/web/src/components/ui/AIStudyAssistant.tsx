'use client';

import { useState, useRef, useEffect } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Bot, X, Send, Sparkles, User, Minimize2, Zap, WifiOff, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAiStore } from '@/store/ai';
import { useAuthStore } from '@/store/auth';
import { authFetch } from '@/lib/auth-token';
import Link from '@/components/ui/Link';
import { linkFor, type HelpEntry, type Role } from '@/lib/help/knowledge';
import { searchHelp, suggestions, tokens } from '@/lib/help/search';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** instant: built-in answer (works offline); saved: an earlier AI answer replayed offline */
  source?: 'instant' | 'saved' | 'ai';
  links?: { label: string; href: string }[];
  related?: HelpEntry[];
};

// Earlier AI answers, kept on this device so the same question can be answered again offline.
const CACHE_KEY = 'universe-assistant-answers';
const CACHE_MAX = 60;
const cacheKey = (q: string) => tokens(q).sort().join(' ');
function readCache(q: string): string | null {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, { a: string; t: number }>;
    return all[cacheKey(q)]?.a ?? null;
  } catch {
    return null;
  }
}
function writeCache(q: string, a: string) {
  try {
    const key = cacheKey(q);
    if (!key || a.length > 6000) return;
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, { a: string; t: number }>;
    all[key] = { a, t: Date.now() };
    const keep = Object.entries(all).sort((x, y) => y[1].t - x[1].t).slice(0, CACHE_MAX);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch {
    /* storage full or blocked: answers just aren't saved */
  }
}

export function AIStudyAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  // Settings → Help & about opens the assistant.
  useEffect(() => {
    const open = () => { setIsDismissed(false); setIsOpen(true); };
    window.addEventListener('universe:open-assistant', open);
    return () => window.removeEventListener('universe:open-assistant', open);
  }, []);
  const [isHovered, setIsHovered] = useState(false);
  const { isChatbotEnabled } = useAiStore();
  const role = useAuthStore((st) => st.user?.role) as Role | undefined;
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'assistant', content: "Hi! Ask me how to do anything on UniVerse and I'll answer instantly, even offline. For study questions, Gemini AI helps out." }
  ]);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  const quick = [...suggestions(role, 3).map((h) => h.q[0]), 'Explain Big O notation'];
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // iOS-style: tuck the floating button away while scrolling down, bring it back on scroll up.
  const [tucked, setTucked] = useState(false);
  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (Math.abs(y - lastY) > 8) {
          setTucked(y > lastY && y > 80);
          lastY = y;
        }
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const reply = (m: Omit<Message, 'id' | 'role'>) =>
    setMessages((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, role: 'assistant', ...m }]);

  const handleSend = async (text: string = inputValue) => {
    if (!text.trim()) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');

    // 1. Questions about using UniVerse: answered on the device, instantly, online or not.
    const { matches, confident } = searchHelp(text, role);
    if (confident) {
      const e = matches[0].entry;
      reply({ content: e.a, source: 'instant', links: e.links?.map((l) => ({ label: l.label, href: linkFor(l.href, role) })), related: matches.slice(1).filter((m) => m.score >= 3).map((m) => m.entry) });
      return;
    }
    const related = matches.filter((m) => m.score >= 2).map((m) => m.entry);

    // 2. Offline: replay a saved answer to the same question, or point to built-in topics.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const saved = readCache(text);
      if (saved) reply({ content: saved, source: 'saved' });
      else reply({
        content: related.length
          ? "You're offline, so I can't reach Gemini right now. These built-in answers might help:"
          : "You're offline, so I can't reach Gemini right now. I can still answer questions about using UniVerse, like the ones below, and I'll remember Gemini's answers for next time.",
        related: related.length ? related : suggestions(role, 4),
      });
      return;
    }

    // 3. Everything else: Gemini.
    setIsTyping(true);

    // Add a placeholder for streaming
    const aiMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: aiMsgId, role: 'assistant', content: '' }]);

    try {
      const res = await authFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-8), // last 8 messages for context
        }),
      });

      if (!res.ok || !res.body) {
        let msg = "Sorry, I'm having trouble connecting right now. Please try again.";
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* not JSON */ }
        const saved = readCache(text);
        setIsTyping(false);
        setMessages(prev => prev.map(m => m.id === aiMsgId ? (saved ? { ...m, content: saved, source: 'saved' } : { ...m, content: msg, related }) : m));
        return;
      }

      setIsTyping(false);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: accumulated } : m));
      }

      if (!accumulated.trim()) {
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: "I couldn't generate a response. Please try again." } : m));
      } else {
        writeCache(text, accumulated);
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, source: 'ai', related: related.slice(0, 2) } : m));
      }
    } catch {
      const saved = readCache(text);
      setIsTyping(false);
      setMessages(prev => prev.map(m => m.id === aiMsgId
        ? (saved ? { ...m, content: saved, source: 'saved' } : { ...m, content: "Sorry, I'm having trouble connecting right now. Please try again.", related })
        : m
      ));
    }
  };

  if (!isChatbotEnabled || isDismissed) return null;

  return (
    <div className={cn("fixed above-tabbar right-[max(1rem,env(safe-area-inset-right))] lg:right-6 z-[30] flex flex-col items-end gap-2 transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", tucked && !isOpen && "translate-y-24 opacity-0 pointer-events-none lg:translate-y-0 lg:opacity-100 lg:pointer-events-auto")}>
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="flex flex-col items-end gap-2"
          >
            {/* Dismiss Button - only shows on hover or mobile */}
            <button 
              onClick={() => setIsDismissed(true)}
              aria-label="Hide AI Assistant"
              className="hidden lg:flex w-7 h-7 rounded-full bg-zinc-800/80 backdrop-blur text-zinc-400 hover:text-white items-center justify-center shadow-lg transition-colors border border-zinc-700/50"
              title="Hide AI Assistant"
            >
              <X className="w-4 h-4" />
            </button>

              <motion.button
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
                exit={{ scale: 0, opacity: 0 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsOpen(true)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            aria-label="Open AI Study Assistant"
            className="w-12 h-12 lg:w-14 lg:h-14 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white shadow-xl flex items-center justify-center relative overflow-hidden group"
          >
            {/* Glow effect */}
            <div className="absolute inset-0 bg-white/20 blur-md rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <AnimatePresence mode="wait">
              {isHovered ? (
                <motion.div key="sparkles" initial={{ opacity: 0, rotate: -45 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: 45 }}>
                  <Sparkles className="w-6 h-6" />
                </motion.div>
              ) : (
                <motion.div key="bot" initial={{ opacity: 0, rotate: 45 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: -45 }}>
                  <Bot className="w-6 h-6" />
                </motion.div>
              )}
            </AnimatePresence>

            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 350, damping: 25 } }}
            exit={{ opacity: 0, y: 20, scale: 0.95, transition: { duration: 0.2 } }}
            className="absolute bottom-0 right-0 w-[calc(100vw-2rem)] max-w-[400px] h-[min(550px,calc(100dvh-10rem))] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                    Study Assistant
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  </h3>
                  <p className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                    {online ? 'Instant help · Gemini AI' : <><WifiOff className="w-3 h-3" /> Offline · built-in answers</>}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700">
              {messages.map((msg) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={msg.id} 
                  className={cn("flex items-end gap-2", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white",
                    msg.role === 'user' ? "bg-indigo-500" : "bg-gradient-to-br from-indigo-500 to-purple-600"
                  )}>
                    {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                  <div className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm whitespace-pre-wrap break-words",
                    msg.role === 'user' 
                      ? "bg-indigo-500 text-white rounded-br-sm" 
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-bl-sm"
                  )}>
                    {(msg.source === 'instant' || msg.source === 'saved') && (
                      <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                        {msg.source === 'instant' ? <><Zap className="w-3 h-3" /> Instant answer · works offline</> : <><WifiOff className="w-3 h-3" /> Saved answer</>}
                      </span>
                    )}
                    {msg.content}
                    {!!msg.links?.length && (
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {msg.links.map((l) => (
                          <Link key={l.href} href={l.href} onClick={() => setIsOpen(false)} className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/20">
                            {l.label} <ArrowUpRight className="w-3 h-3" />
                          </Link>
                        ))}
                      </span>
                    )}
                    {!!msg.related?.length && (
                      <span className="mt-2 flex flex-col items-start gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Related</span>
                        {msg.related.map((h) => (
                          <button key={h.id} type="button" onClick={() => handleSend(h.q[0])} className="text-left text-xs font-medium text-indigo-600 dark:text-indigo-300 hover:underline">
                            {h.q[0]}
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
              
              {isTyping && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-end gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-white">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="bg-zinc-100 dark:bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" />
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '0.15s' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '0.3s' }} />
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggestions */}
            {messages.length === 1 && (
              <div className="px-4 pb-2 flex flex-wrap gap-2">
                {quick.map((s, i) => (
                  <button 
                    key={i}
                    onClick={() => handleSend(s)}
                    className="text-[11px] font-medium px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 transition-colors whitespace-nowrap"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="p-4 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
              <form 
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                className="flex items-center gap-2"
              >
                <input 
                  type="text" 
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={online ? 'Ask anything…' : 'Ask how to use UniVerse…'}
                  aria-label="Message the assistant"
                  className="flex-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full px-4 py-2.5 text-sm outline-none focus:border-indigo-500 text-zinc-900 dark:text-white placeholder:text-zinc-400"
                />
                <button 
                  type="submit"
                  disabled={!inputValue.trim() || isTyping}
                  className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-600 transition-colors"
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

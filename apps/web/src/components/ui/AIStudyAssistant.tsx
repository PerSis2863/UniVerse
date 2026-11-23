'use client';

import { MathText } from '@/components/ui/MathText';
import { useState, useRef, useEffect } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Bot, X, Send, Sparkles, User, Minimize2, Zap, WifiOff, ArrowUpRight, ArrowUp, SquarePen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAiStore } from '@/store/ai';
import { useAuthStore } from '@/store/auth';
import { authFetch } from '@/lib/auth-token';
import Link from '@/components/ui/Link';
import { HELP, linkFor, type HelpEntry, type Role } from '@/lib/help/knowledge';
import { searchHelp, suggestions, tokens } from '@/lib/help/search';
import { GhidraReply, type GhidraPlan, type Settled } from '@/components/ui/GhidraReply';
import { api } from '@/lib/api';
import { localPlan, looksMultiStep, type AskTurn } from '@/lib/ask';
import { askOnDevice } from '@/lib/ghidra-device';
import { ReportAnswer } from '@/components/ui/ReportAnswer';
import { guard, guardReply } from '@/lib/ghidra-guard';

// Ghidra on every page (M423): the corner assistant. A request to do something or to see your own things ("what's due",
// "I cycled 5 km", "open Travel": src/lib/ask.ts's matcher) goes to Ghidra's actions (POST /ask) and comes back as the
// same reply as the hub's chat (GhidraReply: nothing happens without a tap). Questions about using UniVerse are answered
// on the device, instantly, even offline; anything else (study questions) goes to the AI and is kept for offline.

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** instant: built-in answer (works offline); saved: an earlier AI answer replayed offline; device: the trained
   *  Ghidra on this device (M424), when the AI couldn't answer */
  source?: 'instant' | 'saved' | 'ai' | 'device';
  links?: { label: string; href: string }[];
  related?: HelpEntry[];
  /** M423: Ghidra's reply to a request (an action to confirm, or a list of the person's own things). */
  plan?: GhidraPlan;
  settled?: Settled;
};

/** "How do I log a bike ride?" asks how, it doesn't ask Ghidra to log one. */
const asksHow = (q: string) => /^\s*(how|where|why|can i|could i|what is|what are|is there)\b/i.test(q);

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

/** `button`: false where the round button would cover the page's own box (Messages); it still opens from "+" → Ask AI. */
export function AIStudyAssistant({ button = true }: { button?: boolean }) {
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
  const guardian = useAuthStore((st) => st.user?.role === 'GUARDIAN');
  // The owner, 23 Nov (RunPod's assistant): Ghidra opens as a few suggestions over one question box, no greeting; the
  // conversation window appears once something is asked.
  const [messages, setMessages] = useState<Message[]>([]);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  const quick = ['What’s due this week?', ...suggestions(role, 1).map((h) => h.q[0]), 'Explain a topic step by step'];
  const launcher = isOpen && messages.length === 0;
  useEffect(() => {
    if (!launcher) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [launcher]);
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
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', ...m }]);

  const handleSend = async (text: string = inputValue) => {
    if (!text.trim()) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');

    // M429: someone in crisis or in danger: the safe, human answer at once, online or not (src/lib/ghidra-guard.ts).
    const danger = guard(text);
    if (danger) { reply({ content: guardReply(danger), source: 'instant' }); return; }

    // 0. Ghidra's actions (M423): your own things, or something to do, when online.
    const wish = localPlan(text).action;
    const several = looksMultiStep(text) && !asksHow(text); // M432: several parts go to Ghidra's planner
    if ((several || wish === 'my_due' || wish === 'my_green' || wish === 'my_trips' || wish === 'my_courses' || (wish !== 'answer' && !asksHow(text))) && (typeof navigator === 'undefined' || navigator.onLine)) {
      setIsTyping(true);
      const history: AskTurn[] = messages.slice(-6).filter((m) => m.content).map((m) => ({ who: m.role === 'user' ? 'me' : 'ghidra', text: m.content.slice(0, 400) }));
      try {
        const plan = (await api.post<GhidraPlan>('/ask', { text, history })).data;
        reply({ content: plan.say, plan });
      } catch {
        reply({ content: 'Sorry, I couldn’t do that right now. Please try again.' });
      } finally { setIsTyping(false); }
      return;
    }

    // 1. Questions about using UniVerse: answered on the device, instantly, online or not ("who are you?" is all
    //    small words the search skips, so Ghidra introduces itself directly).
    const me = /^\s*(who|what)\s+(are|r)\s+(you|u)\b|^\s*(hi|hello|hey)( ghidra)?[\s!.]*$/i.test(text) ? HELP.find((h) => h.id === 'ghidra') : undefined;
    if (me) { reply({ content: me.a, source: 'instant', links: me.links?.map((l) => ({ label: l.label, href: linkFor(l.href, role) })) }); return; }
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
      const device = saved ? null : await askOnDevice(text, 8000);
      if (saved) reply({ content: saved, source: 'saved' });
      else if (device) reply({ content: device, source: 'device' });
      else reply({
        content: related.length
          ? "You're offline, so I can only use my built-in answers right now. These might help:"
          : "You're offline, so I can only use my built-in answers right now. I can still answer questions about using UniVerse, like the ones below, and I remember my earlier answers for next time.",
        related: related.length ? related : suggestions(role, 4),
      });
      return;
    }

    // 3. Everything else: the AI behind Ghidra (Gemini, src/app/api/ai/route.ts); people only ever see the name Ghidra.
    setIsTyping(true);

    // Add a placeholder for streaming
    const aiMsgId = crypto.randomUUID();
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
        const device = saved ? null : await askOnDevice(text);
        setIsTyping(false);
        setMessages(prev => prev.map(m => m.id === aiMsgId ? (saved ? { ...m, content: saved, source: 'saved' } : device ? { ...m, content: device, source: 'device' } : { ...m, content: msg, related }) : m));
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
        const sofar = accumulated;
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: sofar } : m));
      }

      if (!accumulated.trim()) {
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: "I couldn't generate a response. Please try again." } : m));
      } else {
        writeCache(text, accumulated);
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, source: 'ai', related: related.slice(0, 2) } : m));
      }
    } catch {
      const saved = readCache(text);
      const device = saved ? null : await askOnDevice(text);
      setIsTyping(false);
      setMessages(prev => prev.map(m => m.id === aiMsgId
        ? (saved ? { ...m, content: saved, source: 'saved' } : device ? { ...m, content: device, source: 'device' } : { ...m, content: "Sorry, I'm having trouble connecting right now. Please try again.", related })
        : m
      ));
    }
  };

  if (!isChatbotEnabled || isDismissed) return null;

  return (
    <div className={cn("ai-fab fixed above-tabbar end-[max(1rem,env(safe-area-inset-right))] lg:end-6 z-[30] flex flex-col items-end gap-2 transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", tucked && !isOpen && "translate-y-24 opacity-0 pointer-events-none lg:translate-y-0 lg:opacity-100 lg:pointer-events-auto")}>
      <AnimatePresence>
        {launcher && (
          <motion.div
            key="launcher"
            initial="out" animate="in" exit="out"
            variants={{ in: { transition: { staggerChildren: 0.04 } }, out: { transition: { duration: 0.12 } } }}
            className="flex flex-col items-end gap-2"
          >
            <button type="button" aria-label="Close Ghidra" tabIndex={-1} onClick={() => setIsOpen(false)} className="fixed inset-0 -z-10 cursor-default" />
            {quick.map((q) => (
              <motion.button
                key={q}
                type="button"
                variants={{ out: { opacity: 0, y: 8, transition: { duration: 0.12 } }, in: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } } }}
                onClick={() => handleSend(q)}
                className="max-w-[calc(100vw-2rem)] truncate rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 shadow-sm transition-colors hover:border-indigo-500/50 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:text-white"
              >
                {q}
              </motion.button>
            ))}
            <motion.form
              variants={{ out: { opacity: 0, y: 8, transition: { duration: 0.12 } }, in: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } } }}
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="flex w-[min(26rem,calc(100vw-2rem))] items-center gap-2 rounded-xl border-2 border-indigo-500/40 bg-white p-1.5 ps-4 shadow-lg focus-within:border-indigo-500 dark:bg-zinc-900"
            >
              <input
                autoFocus
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={online ? 'Ask Ghidra anything' : 'Ask how to use UniVerse'}
                aria-label="Message Ghidra"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none outline-none focus-visible:shadow-none! focus-visible:outline-none text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-white dark:placeholder:text-zinc-400"
              />
              <button type="submit" aria-label="Send" disabled={!inputValue.trim()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white transition-colors hover:bg-indigo-600 disabled:opacity-50">
                <ArrowUp className="h-4 w-4" />
              </button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(!isOpen || launcher) && (
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            // M339 (the owner, 19 Nov): on a phone or tablet the round button sat over the page (a figure, a form's field), as
            // iPhone apps never do; there the tab bar's "+" → Ask AI opens this assistant (universe:open-assistant). Parents'
            // tab bar has no "+", so they keep the button.
            className={cn('flex flex-col items-end gap-2', !button ? 'hidden' : !guardian && 'max-lg:hidden')}
          >
            {/* Hide Ghidra (computers; only while closed) */}
            {!isOpen && <button 
              onClick={() => setIsDismissed(true)}
              aria-label="Hide Ghidra"
              className="hidden lg:flex w-7 h-7 rounded-full bg-zinc-800/80 backdrop-blur text-zinc-400 hover:text-white items-center justify-center shadow-lg transition-colors border border-zinc-700/50"
              title="Hide Ghidra"
            >
              <X className="w-4 h-4" />
            </button>}

              <motion.button
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
                exit={{ scale: 0.85, opacity: 0 }}
                whileHover={{ scale: 1.05 }}
                onClick={() => setIsOpen(!launcher)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            aria-label={launcher ? 'Close Ghidra' : 'Open Ghidra, your assistant'}
            aria-expanded={isOpen}
            className="w-12 h-12 lg:w-14 lg:h-14 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white shadow-xl flex items-center justify-center relative overflow-hidden group active:scale-[0.95]"
          >
            {/* Glow effect */}
            <div className="absolute inset-0 bg-white/20 blur-md rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <AnimatePresence mode="wait">
              {launcher ? (
                <motion.div key="close" initial={{ opacity: 0, rotate: -45 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: 45 }}>
                  <X className="w-6 h-6" />
                </motion.div>
              ) : isHovered ? (
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
        {isOpen && !launcher && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 350, damping: 25 } }}
            exit={{ opacity: 0, y: 20, scale: 0.95, transition: { duration: 0.2 } }}
            className="absolute bottom-0 end-0 w-[calc(100vw-2rem)] max-w-[400px] h-[min(550px,calc(100dvh-10rem))] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                    Ghidra
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  </h3>
                  <p className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                    {online ? 'Your UniVerse assistant' : <><WifiOff className="w-3 h-3" /> Offline · built-in answers</>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
              <button aria-label="New chat" title="New chat" onClick={() => setMessages([])}
                className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"
              >
                <SquarePen className="w-4 h-4" />
              </button>
              <button aria-label="Minimize" 
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
              </div>
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
                    msg.role === 'user' ? "bg-zinc-700" : "bg-gradient-to-br from-indigo-500 to-purple-600"
                  )}>
                    {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                  {msg.plan ? (
                    <GhidraReply plan={msg.plan} role={role ?? 'STUDENT'} settled={msg.settled} className="max-w-[80%]" onLeave={() => setIsOpen(false)}
                      onSettle={(st) => setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, settled: st } : m)))} />
                  ) : (
                  <div className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm whitespace-pre-wrap break-words",
                    msg.role === 'user' 
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded-ee-sm" 
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-es-sm"
                  )}>
                    {msg.source === 'device' && (
                      <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                        <Sparkles className="w-3 h-3" aria-hidden /> Ghidra on this device · small and still learning
                      </span>
                    )}
                    {(msg.source === 'instant' || msg.source === 'saved') && (
                      <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                        {msg.source === 'instant' ? <><Zap className="w-3 h-3" /> Instant answer · works offline</> : <><WifiOff className="w-3 h-3" /> Saved answer</>}
                      </span>
                    )}
                    {msg.role === 'user' ? msg.content : <MathText text={msg.content} />}
                    {msg.role === 'assistant' && (msg.source === 'ai' || msg.source === 'device') && msg.content && (() => {
                      const at = messages.findIndex((m) => m.id === msg.id), asked = messages.slice(0, at).reverse().find((m) => m.role === 'user');
                      return asked ? <span className="block"><ReportAnswer question={asked.content} answer={msg.content} /></span> : null;
                    })()}
                    {!!msg.links?.length && (
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {msg.links.map((l) => (
                          <Link key={l.href} href={l.href} onClick={() => setIsOpen(false)} className="inline-flex items-center gap-1 rounded-full bg-zinc-900/[0.06] px-2.5 py-1 text-xs font-semibold text-zinc-900 dark:bg-white/10 dark:text-white hover:bg-zinc-900/10 dark:hover:bg-white/15">
                            {l.label} <ArrowUpRight className="w-3 h-3" />
                          </Link>
                        ))}
                      </span>
                    )}
                    {!!msg.related?.length && (
                      <span className="mt-2 flex flex-col items-start gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Related</span>
                        {msg.related.map((h) => (
                          <button key={h.id} type="button" onClick={() => handleSend(h.q[0])} className="min-h-6 py-0.5 text-start text-xs font-medium text-indigo-600 dark:text-indigo-300 hover:underline">
                            {h.q[0]}
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                  )}
                </motion.div>
              ))}
              
              {isTyping && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-end gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-white">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="bg-zinc-100 dark:bg-zinc-800 rounded-2xl rounded-es-sm px-4 py-3 shadow-sm flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" />
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '0.15s' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '0.3s' }} />
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

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
                  placeholder={online ? 'Ask or tell Ghidra…' : 'Ask how to use UniVerse…'}
                  aria-label="Message Ghidra"
                  className="flex-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full px-4 py-2.5 text-sm outline-none focus:border-indigo-500 text-zinc-900 dark:text-white placeholder:text-zinc-400"
                />
                <button aria-label="Send" 
                  type="submit"
                  disabled={!inputValue.trim() || isTyping}
                  className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-600 transition-colors"
                >
                  <Send className="w-4 h-4 ms-0.5" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

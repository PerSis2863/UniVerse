'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { GraduationCap, BookOpen, Users, BarChart3, Shield, Zap, ArrowRight, Globe2, HandHeart } from 'lucide-react';
import { UniverseLogo } from '@/components/ui/UniverseLogo';

const features = [
  { icon: Globe2, title: 'Global Network', desc: 'Connect with universities, NGOs, and student groups worldwide.' },
  { icon: HandHeart, title: 'Social Impact', desc: 'Participate in inter-college hackathons and grassroots volunteering.' },
  { icon: Users, title: 'Collaborative Projects', desc: 'Work across borders on joint research and NGO field mentoring.' },
  { icon: BookOpen, title: 'Smart Learning', desc: 'Interactive courses, quizzes, and real-time progress tracking.' },
  { icon: BarChart3, title: 'Impact Analytics', desc: 'Measure and visualize your real-world social impact.' },
  { icon: Zap, title: 'Real-time', desc: 'Live notifications, announcements, and chat powered by WebSockets.' },
];

export default function HomePage() {
  const { user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      const path = user.role === 'STUDENT' ? '/student' : user.role === 'TEACHER' ? '/teacher' : '/admin';
      router.push(path);
    }
  }, [user, router]);

  return (
    <div className="min-h-screen bg-[#09090b] overflow-hidden">
      {/* Background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-cyan-500/8 blur-[120px]" />
      </div>

      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] backdrop-blur-xl bg-[#09090b]/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <UniverseLogo size="sm" showText={true} animated={true} />
          <div className="flex items-center gap-3">
            <Link href="/login" className="btn-ghost text-sm">Sign in</Link>
            <Link href="/register" className="btn-primary text-sm">Get started</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main className="pt-32 pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-tight mb-6 font-display">
              The Global{' '}
              <span className="gradient-text">Social Impact</span>
              <br />Platform
            </h1>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              A modern network unifying universities, students, and NGOs to drive social change, inter-college collaborations, and real-world impact.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link href="/register" className="btn-primary flex items-center gap-2 text-base px-7 py-3.5">
                Get started free <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/login" className="btn-secondary flex items-center gap-2 text-base px-7 py-3.5">
                Sign in
              </Link>
            </div>
          </motion.div>
        </div>

        {/* Features */}
        <div className="max-w-6xl mx-auto mt-28">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * i, duration: 0.5 }}
                className="card-hover group"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-600/15 flex items-center justify-center mb-4 group-hover:bg-indigo-600/25 transition-colors">
                  <f.icon className="w-5 h-5 text-indigo-400" />
                </div>
                <h3 className="font-bold text-white mb-1.5">{f.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="max-w-6xl mx-auto mt-32 border-t border-white/[0.05] pt-8 flex items-center justify-center">
          <p className="text-xs text-zinc-500 flex items-center gap-1.5 font-medium">
            made with <span className="text-rose-500 animate-pulse">❤️</span> by Aditya Bhatt
          </p>
        </div>
      </main>
    </div>
  );
}

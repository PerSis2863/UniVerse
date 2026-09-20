'use client';
import { useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { BookOpen, Users, Award, Search, GraduationCap, Video, Users2, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface EduInitiative {
  id: string;
  title: string;
  organization: string;
  type: 'Mentorship' | 'Tutoring' | 'Workshop';
  description: string;
  subject: string;
  targetAudience: string;
  commitment: string;
  impactPoints: number;
  spots: number;
  filled: number;
  gradient: string;
}

const INITIATIVES: EduInitiative[] = [
  {
    id: 'edu-1',
    title: 'Code for Kids Mentorship',
    organization: 'Tech4All Foundation',
    type: 'Mentorship',
    description: 'Mentor high school students from underrepresented backgrounds in basic Python and web development.',
    subject: 'Computer Science',
    targetAudience: 'High School (Grades 9-12)',
    commitment: '2 hours/week',
    impactPoints: 400,
    spots: 20,
    filled: 12,
    gradient: 'from-blue-500 to-indigo-600',
  },
  {
    id: 'edu-2',
    title: 'Advanced Mathematics Tutoring',
    organization: 'UniVerse Peer Support',
    type: 'Tutoring',
    description: 'Provide 1-on-1 tutoring sessions for first-year engineering students struggling with calculus.',
    subject: 'Mathematics',
    targetAudience: 'University Freshmen',
    commitment: 'Flexible (On-demand)',
    impactPoints: 200,
    spots: 50,
    filled: 45,
    gradient: 'from-fuchsia-500 to-purple-600',
  },
  {
    id: 'edu-3',
    title: 'Financial Literacy Workshop Series',
    organization: 'Global Youth Economics',
    type: 'Workshop',
    description: 'Help facilitate weekend workshops teaching personal finance and basic investing to young adults.',
    subject: 'Economics',
    targetAudience: 'Young Adults (18-24)',
    commitment: 'One weekend/month',
    impactPoints: 600,
    spots: 10,
    filled: 3,
    gradient: 'from-amber-500 to-orange-600',
  },
  {
    id: 'edu-4',
    title: 'English Conversational Practice',
    organization: 'Refugee Integration Network',
    type: 'Mentorship',
    description: 'Engage in weekly conversational practice with adult refugees to help them improve their language skills.',
    subject: 'Languages',
    targetAudience: 'Adult Learners',
    commitment: '1 hour/week',
    impactPoints: 350,
    spots: 30,
    filled: 10,
    gradient: 'from-emerald-500 to-teal-600',
  }
];

export default function EduSocietyPage() {
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('ALL');
  const [joined, setJoined] = useState<string[]>([]);

  const types = ['ALL', 'Mentorship', 'Tutoring', 'Workshop'];
  const filtered = INITIATIVES.filter(i => {
    const q = search.toLowerCase();
    const matchSearch = i.title.toLowerCase().includes(q) || i.subject.toLowerCase().includes(q);
    const matchType = selectedType === 'ALL' || i.type === selectedType;
    return matchSearch && matchType;
  });

  const handleJoin = (initiative: EduInitiative) => {
    setJoined(prev => [...prev, initiative.id]);
    toast.success(`Successfully registered for ${initiative.title}!`, {
      description: `The organizer (${initiative.organization}) will contact you soon with schedule details.`
    });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Mentorship': return <Users2 className="w-4 h-4" />;
      case 'Tutoring': return <Video className="w-4 h-4" />;
      case 'Workshop': return <Users className="w-4 h-4" />;
      default: return <GraduationCap className="w-4 h-4" />;
    }
  };

  return (
    <>
      <Topbar 
        title="📚 Educational Society" 
        subtitle="Share your knowledge through mentorship, tutoring, and workshops." 
      />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-8">
          
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-950/60 via-indigo-950/50 to-zinc-950 border border-white/10 p-8 shadow-2xl">
            <div className="absolute -right-20 -bottom-20 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-3 max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-semibold">
                  <BookOpen className="w-3.5 h-3.5" /> Peer-to-Peer Learning
                </div>
                <h1 className="text-3xl font-black text-white">Empower Others Through <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">Education</span></h1>
                <p className="text-zinc-400 text-sm">Become a mentor, tutor struggling students, or lead workshops. Earn impact points while reinforcing your own knowledge and building communication skills.</p>
              </div>
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 text-center flex-shrink-0 w-48 hidden md:block">
                <div className="text-3xl font-black text-white">12.5k</div>
                <div className="text-xs text-zinc-500 font-medium mt-1">Hours Volunteered</div>
                <div className="mt-3 text-xs bg-indigo-500/20 text-indigo-400 py-1 px-2 rounded-lg font-medium">This Semester</div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search subjects, initiatives..."
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white placeholder-zinc-500 outline-none focus:border-indigo-500 transition-colors" />
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {types.map(t => (
                <button key={t} onClick={() => setSelectedType(t)}
                  className={cn("px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap border transition-all flex items-center gap-2",
                    selectedType === t ? "bg-indigo-600 text-white border-indigo-600 shadow-lg" : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-indigo-500/50")}>
                  {t !== 'ALL' && getTypeIcon(t)}
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filtered.map((item, i) => {
              const isJoined = joined.includes(item.id);
              const isFull = item.filled >= item.spots;
              const fillPct = (item.filled / item.spots) * 100;
              
              return (
                <motion.div key={item.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
                  className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 hover:border-indigo-500/40 transition-all group flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1", 
                            item.type === 'Mentorship' ? 'bg-fuchsia-500/10 text-fuchsia-500 border-fuchsia-500/20' :
                            item.type === 'Tutoring' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                            'bg-amber-500/10 text-amber-500 border-amber-500/20'
                          )}>
                            {getTypeIcon(item.type)} {item.type}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                            {item.subject}
                          </span>
                        </div>
                        <h3 className="font-bold text-lg text-zinc-900 dark:text-white leading-tight">{item.title}</h3>
                        <div className="text-xs text-zinc-500 font-medium mt-1">by {item.organization}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-indigo-500 font-black flex items-center gap-1 justify-end"><Award className="w-4 h-4" /> {item.impactPoints}</div>
                        <div className="text-[10px] text-zinc-400 font-medium">pts</div>
                      </div>
                    </div>

                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">{item.description}</p>

                    <div className="grid grid-cols-2 gap-3 mb-6">
                      <div className="bg-zinc-50 dark:bg-zinc-950/50 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800/50">
                        <div className="text-[10px] text-zinc-500 uppercase font-semibold mb-1">Target Audience</div>
                        <div className="text-xs font-medium text-zinc-900 dark:text-zinc-200">{item.targetAudience}</div>
                      </div>
                      <div className="bg-zinc-50 dark:bg-zinc-950/50 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800/50">
                        <div className="text-[10px] text-zinc-500 uppercase font-semibold mb-1">Commitment</div>
                        <div className="text-xs font-medium text-zinc-900 dark:text-zinc-200">{item.commitment}</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-4">
                      <div className="flex justify-between text-xs font-medium mb-1.5">
                        <span className="text-zinc-500">Spots Filled</span>
                        <span className={cn(isFull ? "text-red-500" : "text-zinc-900 dark:text-zinc-300")}>{item.filled} / {item.spots}</span>
                      </div>
                      <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                          className={cn("h-full rounded-full transition-all duration-1000", isFull ? "bg-red-500" : "bg-indigo-500")} 
                          style={{ width: `${fillPct}%` }} 
                        />
                      </div>
                    </div>

                    <button 
                      onClick={() => !isJoined && !isFull && handleJoin(item)}
                      disabled={isJoined || isFull}
                      className={cn("w-full py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2",
                        isJoined ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" :
                        isFull ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed" :
                        "bg-zinc-900 dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-100 shadow-lg"
                      )}>
                      {isJoined ? <><CheckCircle2 className="w-4 h-4" /> Registered</> : 
                       isFull ? 'Program Full' : 
                       <>Volunteer Now <ArrowUpRight className="w-4 h-4" /></>}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

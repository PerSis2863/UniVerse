'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Clock,
  Sparkles,
  BookOpen,
  Calendar,
  Star,
  ShieldCheck,
  Video,
  Plus,
  CheckCircle,
  Search,
  ArrowRight,
  TrendingUp,
  Award,
  RefreshCw,
  X,
  History,
} from 'lucide-react';

interface TimeBankAccount {
  id: string;
  balanceCredits: number;
  creditsEarned: number;
  creditsSpent: number;
  sessionsCompletedAsTutor: number;
  sessionsCompletedAsLearner: number;
  totalMinutesTutored: number;
  averageRating: number;
  ratingsCount: number;
}

interface CreditTransaction {
  id: string;
  amount: number;
  balanceAfter: number;
  type: string;
  description: string;
  createdAt: string;
}

interface PeerTutorSubject {
  courseId?: string;
  courseName: string;
  courseCode?: string;
  conceptName?: string;
  masteryLevel?: number;
  band?: string;
  verifiedByD1?: boolean;
}

interface PeerTutor {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatar: string | null;
  headline: string | null;
  bio: string | null;
  badgeIssued: boolean;
  badgeIssuedAt: string | null;
  subjects: PeerTutorSubject[];
  stats: {
    averageRating: number;
    ratingsCount: number;
    sessionsCompletedAsTutor: number;
    totalMinutesTutored: number;
  };
  nextAvailableSlot?: {
    id: string;
    startTime: string;
    endTime: string;
    date?: string;
  } | null;
}

interface TutoringSession {
  id: string;
  tutorId: string;
  learnerId: string;
  topic: string;
  conceptName?: string | null;
  scheduledAt: string;
  durationMinutes: number;
  status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  callRoomId: string;
  callDurationSeconds: number;
  callVerified: boolean;
  learnerRating?: number | null;
  learnerFeedback?: string | null;
  feedbackTags: string[];
  tutorNotes?: string | null;
  tutor: { id: string; name: string; avatar: string | null };
  learner: { id: string; name: string; avatar: string | null };
  course?: { id: string; name: string; code: string } | null;
}

export function PeerTutoringTimeBank() {
  const [activeTab, setActiveTab] = useState<'find' | 'sessions' | 'teach' | 'ledger'>('find');
  const [account, setAccount] = useState<TimeBankAccount | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [tutors, setTutors] = useState<PeerTutor[]>([]);
  const [sessions, setSessions] = useState<TutoringSession[]>([]);
  const [masteredSubjects, setMasteredSubjects] = useState<PeerTutorSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [d1Only, setD1Only] = useState(false);

  // Booking Modal State
  const [selectedTutor, setSelectedTutor] = useState<PeerTutor | null>(null);
  const [bookingTopic, setBookingTopic] = useState('');
  const [bookingConcept, setBookingConcept] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('14:00');
  const [bookingLoading, setBookingLoading] = useState(false);

  // Review Modal State
  const [ratingSession, setRatingSession] = useState<TutoringSession | null>(null);
  const [reviewScore, setReviewScore] = useState(5);
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [selectedFeedbackTags, setSelectedFeedbackTags] = useState<string[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);

  // Tutor Studio Form State
  const [headline, setHeadline] = useState('CS & Discrete Math Peer Tutor');
  const [bio, setBio] = useState('Junior studying computer science. Happy to clarify algorithms, dynamic programming, and logic proofs.');
  const [isTutorActive, setIsTutorActive] = useState(true);
  const [newSlotDay, setNewSlotDay] = useState(2);
  const [newSlotStart, setNewSlotStart] = useState('15:00');
  const [newSlotEnd, setNewSlotEnd] = useState('15:20');
  const [savingProfile, setSavingProfile] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadData = useCallback(async () => {
    try {
      const [ledgerRes, tutorsRes, sessionsRes, masteredRes] = await Promise.all([
        fetch('/api/tutoring/time-bank').then((r) => r.json()),
        fetch(`/api/tutoring/tutors?search=${encodeURIComponent(searchQuery)}&onlyD1Verified=${d1Only}`).then((r) => r.json()),
        fetch('/api/tutoring/sessions').then((r) => r.json()),
        fetch('/api/tutoring/tutors/mastered-subjects').then((r) => r.json()),
      ]);

      if (ledgerRes?.account) {
        setAccount(ledgerRes.account);
        setTransactions(ledgerRes.transactions ?? []);
      }
      if (tutorsRes?.tutors) {
        setTutors(tutorsRes.tutors);
      }
      if (Array.isArray(sessionsRes)) {
        setSessions(sessionsRes);
      }
      if (Array.isArray(masteredRes)) {
        setMasteredSubjects(masteredRes);
      }
    } catch {
      showToast('Failed to load peer tutoring data');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, d1Only]);

  useEffect(() => {
    let active = true;
    const fetchInitial = async () => {
      try {
        const [ledgerRes, tutorsRes, sessionsRes, masteredRes] = await Promise.all([
          fetch('/api/tutoring/time-bank').then((r) => r.json()),
          fetch(`/api/tutoring/tutors?search=${encodeURIComponent(searchQuery)}&onlyD1Verified=${d1Only}`).then((r) => r.json()),
          fetch('/api/tutoring/sessions').then((r) => r.json()),
          fetch('/api/tutoring/tutors/mastered-subjects').then((r) => r.json()),
        ]);

        if (!active) return;
        if (ledgerRes?.account) {
          setAccount(ledgerRes.account);
          setTransactions(ledgerRes.transactions ?? []);
        }
        if (tutorsRes?.tutors) {
          setTutors(tutorsRes.tutors);
        }
        if (Array.isArray(sessionsRes)) {
          setSessions(sessionsRes);
        }
        if (Array.isArray(masteredRes)) {
          setMasteredSubjects(masteredRes);
        }
      } catch {
        if (active) showToast('Failed to load peer tutoring data');
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchInitial();
    return () => {
      active = false;
    };
  }, [searchQuery, d1Only]);

  const handleBookSession = async () => {
    if (!selectedTutor) return;
    if (!bookingTopic.trim()) {
      showToast('Please specify a topic for the session');
      return;
    }

    setBookingLoading(true);
    try {
      const scheduledDateTime = bookingDate ? `${bookingDate}T${bookingTime}:00Z` : new Date(Date.now() + 3600000 * 24).toISOString();
      const res = await fetch('/api/tutoring/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tutorId: selectedTutor.userId,
          topic: bookingTopic,
          conceptName: bookingConcept || undefined,
          scheduledAt: scheduledDateTime,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Booking failed');
        return;
      }

      showToast('Session booked! 1 Time Credit reserved.');
      setSelectedTutor(null);
      setBookingTopic('');
      setBookingConcept('');
      setActiveTab('sessions');
      loadData();
    } catch {
      showToast('Failed to book session');
    } finally {
      setBookingLoading(false);
    }
  };

  const handleCompleteReview = async () => {
    if (!ratingSession) return;
    setReviewLoading(true);
    try {
      const res = await fetch(`/api/tutoring/sessions/${ratingSession.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callDurationSeconds: 1200,
          rating: reviewScore,
          feedback: reviewFeedback,
          feedbackTags: selectedFeedbackTags,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to submit review');
        return;
      }

      showToast('Session verified! 1 Time Credit transferred to tutor.');
      setRatingSession(null);
      setReviewFeedback('');
      setSelectedFeedbackTags([]);
      loadData();
    } catch {
      showToast('Failed to complete session');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleCancelSession = async (sessionId: string) => {
    if (!confirm('Cancel this 20-min session and refund your 1 Time Credit?')) return;
    try {
      const res = await fetch(`/api/tutoring/sessions/${sessionId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Session cancelled. 1 Credit refunded to your balance.');
        loadData();
      } else {
        const d = await res.json();
        showToast(d.error || 'Failed to cancel');
      }
    } catch {
      showToast('Failed to cancel session');
    }
  };

  const handleSaveTutorProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await fetch('/api/tutoring/tutors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline,
          bio,
          isActive: isTutorActive,
          subjects: masteredSubjects,
        }),
      });

      if (res.ok) {
        showToast('Tutor profile updated! Ready to receive session bookings.');
        loadData();
      } else {
        const d = await res.json();
        showToast(d.error || 'Failed to save profile');
      }
    } catch {
      showToast('Failed to save profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAddSlot = async () => {
    try {
      const res = await fetch('/api/tutoring/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slots: [{ dayOfWeek: newSlotDay, startTime: newSlotStart, endTime: newSlotEnd }],
        }),
      });
      if (res.ok) {
        showToast('20-minute availability slot added!');
        loadData();
      }
    } catch {
      showToast('Failed to add slot');
    }
  };

  const feedbackTagOptions = [
    'Clear explanations',
    'Patient',
    'Hands-on examples',
    'Exam-focused',
    'Super helpful',
    'Great visuals',
  ];

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900/95 px-4 py-3 text-sm text-white shadow-2xl backdrop-blur-md border border-slate-700 animate-in fade-in slide-in-from-bottom-4">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hero / Time-Bank Balance Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-950 via-slate-900 to-emerald-950 p-6 md:p-8 text-white border border-indigo-800/40 shadow-2xl">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 border border-emerald-400/30 px-3 py-1 text-xs font-semibold text-emerald-300">
              <Clock className="h-3.5 w-3.5" />
              <span>Time-Bank Equalizer · 1 Credit = 20 Min</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
              Peer Tutoring Time-Bank
            </h1>
            <p className="max-w-2xl text-sm md:text-base text-slate-300">
              Exchange knowledge fairly. Get 20-minute help in concepts you are learning,
              and teach topics you have mastered through verified D1 Learning DNA.
            </p>
          </div>

          {/* Time Credit Balance Card */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 rounded-xl bg-slate-900/80 p-4 border border-indigo-500/30 backdrop-blur-md shadow-inner">
            <div className="text-center sm:text-left px-3">
              <span className="text-xs uppercase font-medium text-slate-400">Available Balance</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-emerald-400">
                  {account?.balanceCredits ?? 3}
                </span>
                <span className="text-sm font-semibold text-slate-300">Credits</span>
              </div>
              <span className="text-[11px] text-slate-400">
                {(account?.balanceCredits ?? 3) * 20} min learning capacity
              </span>
            </div>

            <div className="h-px sm:h-12 w-full sm:w-px bg-slate-700/60" />

            <div className="flex flex-col gap-1.5 px-3">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <TrendingUp className="h-3.5 w-3.5 text-indigo-400" />
                <span>Earned: <strong>{account?.creditsEarned ?? 0}</strong></span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Award className="h-3.5 w-3.5 text-amber-400" />
                <span>Tutored: <strong>{account?.totalMinutesTutored ?? 0}m</strong></span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                <span>Rating: <strong>{account?.averageRating ? `${account.averageRating}/5.0` : 'New'}</strong></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('find')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === 'find'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Search className="h-4 w-4" />
          <span>Browse Tutors</span>
        </button>

        <button
          onClick={() => setActiveTab('sessions')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === 'sessions'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Calendar className="h-4 w-4" />
          <span>My Sessions</span>
          {sessions.filter((s) => s.status === 'SCHEDULED').length > 0 && (
            <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] text-white">
              {sessions.filter((s) => s.status === 'SCHEDULED').length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('teach')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === 'teach'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span>Tutor Studio (Offer Help)</span>
        </button>

        <button
          onClick={() => setActiveTab('ledger')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === 'ledger'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <History className="h-4 w-4" />
          <span>Time-Bank Ledger</span>
        </button>
      </div>

      {/* TAB 1: BROWSE TUTORS */}
      {activeTab === 'find' && (
        <div className="space-y-6">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by topic, course, concept (e.g. Recursion, Calculus, CS101)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 pl-10 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <label className="flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <input
                type="checkbox"
                checked={d1Only}
                onChange={(e) => setD1Only(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span>D1 Mastery DNA Verified Only</span>
              </span>
            </label>
          </div>

          {/* Tutors Grid */}
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin text-indigo-500" />
            </div>
          ) : tutors.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-12 text-center">
              <BookOpen className="h-10 w-10 text-slate-400 mb-3" />
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                No peer tutors found
              </h3>
              <p className="text-sm text-slate-500 mt-1 max-w-md">
                Try adjusting your search terms or switch off the D1 mastery filter.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {tutors.map((tutor) => (
                <div
                  key={tutor.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
                >
                  {/* Top Badge: Peer Teaching Credential */}
                  {tutor.badgeIssued && (
                    <div className="absolute top-0 right-0 rounded-bl-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-3 py-1 text-[11px] font-bold text-white shadow-sm flex items-center gap-1">
                      <Award className="h-3.5 w-3.5" />
                      <span>Peer Teaching Passport</span>
                    </div>
                  )}

                  <div className="space-y-4">
                    {/* Tutor Header */}
                    <div className="flex items-start gap-3.5 pt-2">
                      <div className="h-12 w-12 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold flex items-center justify-center text-lg flex-shrink-0 shadow-inner">
                        {tutor.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={tutor.avatar} alt={tutor.name} className="h-full w-full object-cover" />
                        ) : (
                          tutor.name.slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0 pr-16">
                        <h4 className="font-bold text-slate-900 dark:text-white truncate">
                          {tutor.name}
                        </h4>
                        <div className="flex items-center gap-1.5 text-xs text-amber-500 font-semibold mt-0.5">
                          <Star className="h-3.5 w-3.5 fill-amber-400" />
                          <span>
                            {tutor.stats.averageRating ? tutor.stats.averageRating.toFixed(1) : '5.0'}
                          </span>
                          <span className="text-slate-400 font-normal">
                            ({tutor.stats.sessionsCompletedAsTutor} sessions)
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                      {tutor.headline || tutor.bio || 'Available for 20-minute peer tutoring.'}
                    </p>

                    {/* Mastered Subjects */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Mastered Topics
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {tutor.subjects.slice(0, 3).map((sub, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60"
                          >
                            {sub.verifiedByD1 && (
                              <ShieldCheck className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                            )}
                            <span className="truncate max-w-[150px]">
                              {sub.conceptName || sub.courseName}
                            </span>
                            {sub.masteryLevel && (
                              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                {Math.round(sub.masteryLevel * 100)}%
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Availability Indicator */}
                    {tutor.nextAvailableSlot && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <Clock className="h-3.5 w-3.5 text-indigo-500" />
                        <span>Next slot: {tutor.nextAvailableSlot.date ?? 'Available today'} at {tutor.nextAvailableSlot.startTime}</span>
                      </div>
                    )}
                  </div>

                  {/* Booking Action Button */}
                  <div className="pt-5 mt-4 border-t border-slate-100 dark:border-slate-800/80">
                    <button
                      onClick={() => {
                        setSelectedTutor(tutor);
                        if (tutor.subjects[0]) {
                          setBookingTopic(tutor.subjects[0].courseName);
                          setBookingConcept(tutor.subjects[0].conceptName ?? '');
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 text-xs font-bold transition-colors shadow-sm shadow-indigo-600/20"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      <span>Book 20-min Session (1 Credit)</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MY SESSIONS */}
      {activeTab === 'sessions' && (
        <div className="space-y-6">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-12 text-center">
              <Calendar className="h-10 w-10 text-slate-400 mb-3" />
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                No active tutoring sessions
              </h3>
              <p className="text-sm text-slate-500 mt-1 max-w-md">
                Browse available tutors and book a 20-minute session to get help with your coursework.
              </p>
              <button
                onClick={() => setActiveTab('find')}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
              >
                <span>Find a Tutor</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {sessions.map((sess) => (
                <div
                  key={sess.id}
                  className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 p-3 min-w-[70px] text-center">
                      <Clock className="h-5 w-5 text-indigo-500 mb-1" />
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">20 MIN</span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                            sess.status === 'SCHEDULED'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                              : sess.status === 'COMPLETED'
                              ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {sess.status}
                        </span>
                        {sess.conceptName && (
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                            • {sess.conceptName}
                          </span>
                        )}
                      </div>

                      <h4 className="font-bold text-slate-900 dark:text-white text-base">
                        {sess.topic}
                      </h4>

                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span>Tutor: <strong>{sess.tutor.name}</strong></span>
                        <span>Learner: <strong>{sess.learner.name}</strong></span>
                        <span>
                          {new Date(sess.scheduledAt).toLocaleDateString()} at{' '}
                          {new Date(sess.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {sess.learnerRating && (
                        <div className="flex items-center gap-1.5 text-xs text-amber-500 font-semibold pt-1">
                          <Star className="h-3.5 w-3.5 fill-amber-400" />
                          <span>Rated {sess.learnerRating}/5 Stars</span>
                          {sess.learnerFeedback && (
                            <span className="text-slate-500 font-normal italic">
                              &ldquo;{sess.learnerFeedback}&rdquo;
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Session Actions */}
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {sess.status === 'SCHEDULED' && (
                      <>
                        <Link
                          href={`/calls`}
                          className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold transition-colors shadow-sm"
                        >
                          <Video className="h-3.5 w-3.5" />
                          <span>Join 20-min Call</span>
                        </Link>

                        <button
                          onClick={() => setRatingSession(sess)}
                          className="flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 text-xs font-bold transition-colors shadow-sm"
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          <span>Complete & Rate</span>
                        </button>

                        <button
                          onClick={() => handleCancelSession(sess.id)}
                          className="flex items-center gap-1.5 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-3.5 py-2 text-xs font-bold transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                          <span>Cancel & Refund</span>
                        </button>
                      </>
                    )}

                    {sess.status === 'COMPLETED' && !sess.learnerRating && (
                      <button
                        onClick={() => setRatingSession(sess)}
                        className="flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-2 text-xs font-bold transition-colors shadow-sm"
                      >
                        <Star className="h-3.5 w-3.5 fill-white" />
                        <span>Leave Review</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TUTOR STUDIO (OFFER HELP) */}
      {activeTab === 'teach' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Tutor Profile Settings */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="space-y-0.5">
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    Peer Tutor Profile
                  </h3>
                  <p className="text-xs text-slate-500">
                    Configure your peer tutoring listing visible to other students in the Time-Bank.
                  </p>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={isTutorActive}
                    onChange={(e) => setIsTutorActive(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className={isTutorActive ? 'text-emerald-500' : 'text-slate-400'}>
                    {isTutorActive ? 'Accepting Bookings' : 'Paused'}
                  </span>
                </label>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                    Headline
                  </label>
                  <input
                    type="text"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="e.g. Algorithms TA & Calculus Enthusiast"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                    Bio & Teaching Approach
                  </label>
                  <textarea
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Describe how you like to explain concepts and your areas of strength..."
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                {/* Mastered Subjects from D1 */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-emerald-500" />
                      <span>Subjects Mastered (from D1 Learning DNA)</span>
                    </label>
                    <button
                      onClick={loadData}
                      className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Sync DNA</span>
                    </button>
                  </div>

                  {masteredSubjects.length === 0 ? (
                    <p className="text-xs text-slate-500 italic p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                      Complete course quizzes or assignments with 80%+ scores to automatically verify concepts in your Learning DNA.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {masteredSubjects.map((sub, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 text-xs"
                        >
                          <div>
                            <div className="font-bold text-slate-800 dark:text-slate-200">
                              {sub.conceptName || sub.courseName}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {sub.courseCode ?? 'Course'} • D1 Verified
                            </div>
                          </div>
                          <span className="font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded-full">
                            {Math.round((sub.masteryLevel ?? 0.85) * 100)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-3">
                  <button
                    onClick={handleSaveTutorProfile}
                    disabled={savingProfile}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 shadow-sm transition-all disabled:opacity-50"
                  >
                    {savingProfile && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                    <span>Save Tutor Profile</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Availability Slots Manager */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
              <div className="space-y-0.5 pb-3 border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  20-Minute Availability Slots
                </h3>
                <p className="text-xs text-slate-500">
                  Add recurring weekly slots when peers can book you for 20-minute sessions.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={newSlotDay}
                  onChange={(e) => setNewSlotDay(Number(e.target.value))}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                >
                  <option value={1}>Monday</option>
                  <option value={2}>Tuesday</option>
                  <option value={3}>Wednesday</option>
                  <option value={4}>Thursday</option>
                  <option value={5}>Friday</option>
                  <option value={6}>Saturday</option>
                  <option value={0}>Sunday</option>
                </select>

                <input
                  type="time"
                  value={newSlotStart}
                  onChange={(e) => setNewSlotStart(e.target.value)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                />

                <span className="text-xs text-slate-400">to</span>

                <input
                  type="time"
                  value={newSlotEnd}
                  onChange={(e) => setNewSlotEnd(e.target.value)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                />

                <button
                  onClick={handleAddSlot}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 text-xs font-bold hover:opacity-90 transition-opacity"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Slot</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Skill Passport &ldquo;Peer Teaching&rdquo; Progress */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-purple-200 dark:border-purple-900/60 bg-gradient-to-br from-purple-50/50 via-white to-indigo-50/50 dark:from-purple-950/20 dark:via-slate-900 dark:to-indigo-950/20 p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-md">
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    Peer Teaching Badge
                  </h3>
                  <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400">
                    Skill Passport Credential
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300">
                Complete at least <strong>3 verified tutoring sessions</strong> with an average rating of <strong>4.5/5.0+</strong> to automatically earn the cryptographic &ldquo;Peer Teaching&rdquo; skill badge on your public Passport.
              </p>

              {/* Progress bar */}
              <div className="space-y-2 pt-2">
                <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                  <span>Progress: {account?.sessionsCompletedAsTutor ?? 0} of 3 Sessions</span>
                  <span>{Math.min(100, Math.round(((account?.sessionsCompletedAsTutor ?? 0) / 3) * 100))}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, ((account?.sessionsCompletedAsTutor ?? 0) / 3) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="rounded-xl bg-white dark:bg-slate-800/80 p-3.5 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Average Rating Bar:</span>
                  <span className="font-bold text-amber-500">
                    {account?.averageRating ? `${account.averageRating.toFixed(1)} / 5.0` : 'No reviews yet'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Threshold:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">≥ 4.5 Stars</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Status:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {(account?.sessionsCompletedAsTutor ?? 0) >= 3 && (account?.averageRating ?? 0) >= 4.5
                      ? 'Credential Awarded ✅'
                      : 'In Progress ⏳'}
                  </span>
                </div>
              </div>

              <Link
                href="/student/passport"
                className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-purple-300 dark:border-purple-800 text-purple-600 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 py-2.5 text-xs font-bold transition-colors"
              >
                <span>View Skill Passport</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: TIME-BANK LEDGER */}
      {activeTab === 'ledger' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Time-Bank Transaction Ledger
              </h3>
              <p className="text-xs text-slate-500">
                Transparent credit debits and credits awarded for peer tutoring sessions.
              </p>
            </div>
            <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 rounded-xl">
              Balance: {account?.balanceCredits ?? 3} Credits
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {transactions.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No transactions recorded yet.
              </div>
            ) : (
              transactions.map((tx) => (
                <div key={tx.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          tx.type === 'INITIAL_GRANT'
                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                            : tx.type === 'SESSION_EARNED'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : tx.type === 'SESSION_SPENT'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {tx.type}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(tx.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {tx.description}
                    </p>
                  </div>

                  <div className="text-right">
                    <span
                      className={`text-base font-extrabold ${
                        tx.amount > 0 ? 'text-emerald-500' : 'text-rose-500'
                      }`}
                    >
                      {tx.amount > 0 ? `+${tx.amount}` : tx.amount} Credits
                    </span>
                    <div className="text-[11px] text-slate-400">
                      Balance: {tx.balanceAfter}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* BOOKING MODAL */}
      {selectedTutor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-sm">
                  {selectedTutor.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    Book 20-min Session
                  </h3>
                  <p className="text-xs text-slate-500">With {selectedTutor.name}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTutor(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Subject / Topic
                </label>
                <input
                  type="text"
                  value={bookingTopic}
                  onChange={(e) => setBookingTopic(e.target.value)}
                  placeholder="e.g. Data Structures & Algorithms, Calculus, Chemistry..."
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Specific Concept or Question
                </label>
                <input
                  type="text"
                  value={bookingConcept}
                  onChange={(e) => setBookingConcept(e.target.value)}
                  placeholder="e.g. Graph BFS traversal, Recursion base case..."
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={bookingTime}
                    onChange={(e) => setBookingTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                  />
                </div>
              </div>

              {/* Time Bank transaction preview */}
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3.5 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Session Duration:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">20 Minutes</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Cost:</span>
                  <span className="font-bold text-rose-500">-1 Time Credit</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-2">
                  <span className="text-slate-500">Balance after booking:</span>
                  <span className="font-extrabold text-emerald-500">
                    {(account?.balanceCredits ?? 3) - 1} Credits
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setSelectedTutor(null)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleBookSession}
                disabled={bookingLoading}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/20 disabled:opacity-50"
              >
                {bookingLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                <span>Confirm 20-min Booking</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RATING & COMPLETION MODAL */}
      {ratingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="space-y-0.5">
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Rate & Complete Session
                </h3>
                <p className="text-xs text-slate-500">
                  Topic: {ratingSession.topic}
                </p>
              </div>
              <button
                onClick={() => setRatingSession(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-center">
              {/* Star Rating Picker */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase text-slate-400">How was the session?</span>
                <div className="flex items-center justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setReviewScore(star)}
                      className="p-1 transition-transform hover:scale-125 focus:outline-none"
                    >
                      <Star
                        className={`h-7 w-7 ${
                          star <= reviewScore
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-slate-300 dark:text-slate-700'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <span className="text-xs font-semibold text-amber-500">
                  {reviewScore === 5 ? 'Exceptional!' : reviewScore === 4 ? 'Great' : reviewScore === 3 ? 'Good' : 'Fair'}
                </span>
              </div>

              {/* Feedback Tags */}
              <div className="space-y-2 text-left">
                <span className="text-xs font-bold uppercase text-slate-400">Highlights</span>
                <div className="flex flex-wrap gap-1.5">
                  {feedbackTagOptions.map((tag) => {
                    const active = selectedFeedbackTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() =>
                          setSelectedFeedbackTags(
                            active ? selectedFeedbackTags.filter((t) => t !== tag) : [...selectedFeedbackTags, tag]
                          )
                        }
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                          active
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Review Note */}
              <div className="text-left">
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Optional Note for Tutor
                </label>
                <textarea
                  rows={2}
                  value={reviewFeedback}
                  onChange={(e) => setReviewFeedback(e.target.value)}
                  placeholder="What was most helpful about this session?"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {/* Verification Info */}
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 text-left flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Submitting will finalize the 20-min session and award +1 Time Credit to tutor <strong>{ratingSession.tutor.name}</strong>.</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setRatingSession(null)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCompleteReview}
                disabled={reviewLoading}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20 disabled:opacity-50"
              >
                {reviewLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                <span>Confirm & Release Credit</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

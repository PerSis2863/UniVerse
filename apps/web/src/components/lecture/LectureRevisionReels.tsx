'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Film,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  CheckCircle2,
  Network,
  Headphones,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Flame,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import type { LectureMicroLessonData, RevisionReel, MindMapNode } from '@/server/lecture-micro-lessons';
import { authedFetch } from '@/lib/authed-fetch';

interface LectureRevisionReelsProps {
  initialLesson?: LectureMicroLessonData;
  sessionId?: string;
  courseId?: string;
  role?: 'student' | 'teacher';
}

export function LectureRevisionReels({
  initialLesson,
  sessionId,
  courseId,
  role = 'student',
}: LectureRevisionReelsProps) {
  const [lesson, setLesson] = useState<LectureMicroLessonData | null>(initialLesson ?? null);
  const [loading, setLoading] = useState<boolean>(!initialLesson);
  const [activeTab, setActiveTab] = useState<'reels' | 'recap' | 'mindmap' | 'quiz'>('reels');

  // Reels Story State
  const [activeReelIdx, setActiveReelIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [progress, setProgress] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(false);

  // Audio Recap State
  const [audioPlaying, setAudioPlaying] = useState<boolean>(false);
  const [scriptDrawerOpen, setScriptDrawerOpen] = useState<boolean>(false);

  // Quiz State
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [quizScore, setQuizScore] = useState<number | null>(null);

  // Selected MindMap Node
  const [selectedNode, setSelectedNode] = useState<MindMapNode | null>(null);

  // Fetch lesson if not provided
  useEffect(() => {
    if (initialLesson) return;

    let cancelled = false;
    async function loadData() {
      setLoading(true);
      try {
        let endpoint = '';
        if (sessionId) {
          endpoint = `/api/class-sessions/${sessionId}/micro-lesson`;
        } else if (courseId) {
          endpoint = `/api/courses/${courseId}/micro-lessons`;
        } else {
          endpoint = '/api/micro-lessons'; // the latest from all my classes
        }

        const res = await authedFetch(endpoint);
        if (cancelled) {
          void res.body?.cancel(); // let go of the connection
          return;
        }
        if (res.ok) {
          const data = (await res.json()) as LectureMicroLessonData | LectureMicroLessonData[];
          if (Array.isArray(data)) {
            setLesson(data[0] || null);
          } else {
            setLesson(data);
          }
        }
      } catch (e) {
        console.error('Failed to load micro-lesson:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [initialLesson, sessionId, courseId]);

  const activeReel: RevisionReel | undefined = lesson?.reels[activeReelIdx];

  // Telemetry track view
  const trackView = useCallback(async (reelId: string | null) => {
    if (!lesson) return;
    try {
      await authedFetch(`/api/class-sessions/${lesson.sessionId}/micro-lesson/interact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reelId }),
      });
    } catch {
      // ignore telemetry errors
    }
  }, [lesson]);

  const handleNextReel = useCallback(() => {
    if (!lesson) return;
    if (activeReel) {
      void trackView(activeReel.id);
    }
    if (activeReelIdx < lesson.reels.length - 1) {
      setActiveReelIdx((prev) => prev + 1);
      setProgress(0);
    } else {
      setIsPlaying(false);
      setProgress(100);
    }
  }, [lesson, activeReel, activeReelIdx, trackView]);

  const handlePrevReel = useCallback(() => {
    if (activeReelIdx > 0) {
      setActiveReelIdx((prev) => prev - 1);
      setProgress(0);
      setIsPlaying(true);
    }
  }, [activeReelIdx]);

  // Story progression timer
  useEffect(() => {
    if (!isPlaying || activeTab !== 'reels' || !activeReel) return;

    const durationMs = ((activeReel.durationSec || 45) * 1000) / playbackSpeed;
    const intervalMs = 100;
    const step = (intervalMs / durationMs) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          handleNextReel();
          return 0;
        }
        return prev + step;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, activeTab, activeReel, playbackSpeed, handleNextReel]);

  // Voice narration using Web Speech API
  useEffect(() => {
    if (!voiceEnabled || !activeReel || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      return;
    }

    window.speechSynthesis.cancel();
    const textToSpeak = `${activeReel.title}. Key takeaway: ${activeReel.keyTakeaway}`;
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = playbackSpeed;
    window.speechSynthesis.speak(utterance);

    return () => {
      window.speechSynthesis.cancel();
    };
  }, [voiceEnabled, activeReelIdx, activeReel, playbackSpeed]);

  // Audio recap speech narration
  const toggleAudioRecapSpeech = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !lesson) return;

    if (audioPlaying) {
      window.speechSynthesis.cancel();
      setAudioPlaying(false);
    } else {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(lesson.audioRecapScript);
      utterance.rate = playbackSpeed;
      utterance.onend = () => setAudioPlaying(false);
      utterance.onerror = () => setAudioPlaying(false);
      window.speechSynthesis.speak(utterance);
      setAudioPlaying(true);
    }
  };

  const handleAnswerSelect = (questionId: string, optionIdx: number) => {
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: optionIdx }));
  };

  const submitQuiz = () => {
    if (!lesson) return;
    let correct = 0;
    lesson.practiceQuiz.forEach((q) => {
      if (selectedAnswers[q.id] === q.answer) {
        correct++;
      }
    });
    setQuizScore(correct);
  };

  if (loading) {
    return (
      <div className="flex h-96 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <Sparkles className="h-8 w-8 animate-spin text-indigo-500" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Synthesizing revision reels & micro-lessons...
          </p>
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">No Micro-Lessons Found</h3>
        <p className="mt-1 text-sm text-slate-500">
          Once a class call concludes, automated 5-minute audio recaps and revision reels appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 to-pink-500 text-white shadow-md">
            <Flame className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                {lesson.courseCode}
              </span>
              {role === 'teacher' && (
                <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                  Teacher Preview
                </span>
              )}
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {lesson.sessionTitle}
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Exam Micro-Lesson · 5-Min Digest · {lesson.reels.length} Revision Reels · {lesson.viewCount} views
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          <button
            onClick={() => { setActiveTab('reels'); setIsPlaying(true); }}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'reels'
                ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Film className="h-3.5 w-3.5" />
            Revision Reels
          </button>
          <button
            onClick={() => setActiveTab('recap')}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'recap'
                ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Headphones className="h-3.5 w-3.5" />
            5-Min Audio Recap
          </button>
          <button
            onClick={() => setActiveTab('mindmap')}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'mindmap'
                ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Network className="h-3.5 w-3.5" />
            Mind Map
          </button>
          <button
            onClick={() => setActiveTab('quiz')}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'quiz'
                ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Practice Sprint
          </button>
        </div>
      </div>

      {/* TAB 1: REVISION REELS (9:16 VERTICAL STORIES PLAYER) */}
      {activeTab === 'reels' && activeReel && (
        <div className="flex flex-col items-center justify-center">
          {/* Vertical Container (Mobile Dimensions Styled Centered) */}
          <div
            className="relative flex h-[620px] w-full max-w-[380px] flex-col justify-between overflow-hidden rounded-3xl shadow-2xl transition-all"
            style={{ background: activeReel.gradient }}
          >
            {/* Top Overlay: Story Progress Bars */}
            <div className="relative z-20 flex gap-1.5 p-3">
              {lesson.reels.map((r, idx) => (
                <div
                  key={r.id}
                  className="h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full bg-white/25 backdrop-blur-md"
                  onClick={() => {
                    setActiveReelIdx(idx);
                    setProgress(0);
                    setIsPlaying(true);
                  }}
                >
                  <div
                    className="h-full bg-white transition-all duration-100 ease-linear"
                    style={{
                      width:
                        idx < activeReelIdx
                          ? '100%'
                          : idx === activeReelIdx
                          ? `${progress}%`
                          : '0%',
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Reel Header & Quick Controls */}
            <div className="relative z-20 flex items-center justify-between px-4 text-white">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-black/40 px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase backdrop-blur-md">
                  Chapter {activeReel.chapterIndex + 1} / {lesson.reels.length}
                </span>
                <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] backdrop-blur-md">
                  {Math.floor(activeReel.timestampSec / 60)}:
                  {String(activeReel.timestampSec % 60).padStart(2, '0')}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setVoiceEnabled(!voiceEnabled)}
                  className={`rounded-full p-1.5 backdrop-blur-md transition-colors ${
                    voiceEnabled ? 'bg-white text-slate-900' : 'bg-black/40 text-white'
                  }`}
                  title="Voice narration"
                >
                  {voiceEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => {
                    const speeds = [1, 1.25, 1.5, 2];
                    const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
                    setPlaybackSpeed(next);
                  }}
                  className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-md"
                >
                  {playbackSpeed}x
                </button>
              </div>
            </div>

            {/* Click-to-Navigate Overlay Invisible Zones */}
            <div className="absolute inset-0 z-10 flex">
              <div className="w-1/3 h-full cursor-pointer" onClick={handlePrevReel} />
              <div className="w-1/3 h-full cursor-pointer" onClick={() => setIsPlaying(!isPlaying)} />
              <div className="w-1/3 h-full cursor-pointer" onClick={handleNextReel} />
            </div>

            {/* Center Visual Content / Core Takeaway Card */}
            <div className="relative z-20 flex flex-col items-center justify-center px-6 text-center text-white">
              <div className="mb-3 rounded-2xl bg-white/10 p-4 shadow-lg backdrop-blur-md border border-white/20">
                <div className="mb-2 flex items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  <Sparkles className="h-3 w-3" /> Core Exam Takeaway
                </div>
                <h3 className="text-lg font-black leading-tight drop-shadow-md">
                  {activeReel.title}
                </h3>
                <p className="mt-2 text-xs font-medium leading-relaxed text-white/90">
                  {activeReel.keyTakeaway}
                </p>
              </div>

              {/* Dynamic Burned-in Captions Subtitles */}
              <div className="min-h-[50px] w-full rounded-xl bg-black/60 px-3 py-2 text-center text-xs font-semibold text-yellow-300 shadow-md backdrop-blur-md border border-white/10">
                {activeReel.captions[
                  Math.min(
                    Math.floor((progress / 100) * activeReel.captions.length),
                    activeReel.captions.length - 1
                  )
                ]?.text || activeReel.title}
              </div>

              {/* Hashtags */}
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {activeReel.hashtags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white/90"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Bottom Controls Bar */}
            <div className="relative z-20 flex items-center justify-between border-t border-white/10 bg-black/40 p-4 backdrop-blur-md text-white">
              <button
                onClick={handlePrevReel}
                disabled={activeReelIdx === 0}
                className="rounded-full p-2 hover:bg-white/10 disabled:opacity-30"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg transition-transform hover:scale-105 active:scale-95"
              >
                {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current ms-0.5" />}
              </button>

              <button
                onClick={handleNextReel}
                className="rounded-full p-2 hover:bg-white/10"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Quick Reel Thumbnails Below */}
          <div className="mt-4 flex max-w-[380px] w-full items-center justify-between gap-2 overflow-x-auto pb-2">
            {lesson.reels.map((r, idx) => (
              <button
                key={r.id}
                onClick={() => {
                  setActiveReelIdx(idx);
                  setProgress(0);
                  setIsPlaying(true);
                }}
                className={`flex-1 rounded-xl p-2 text-start transition-all ${
                  activeReelIdx === idx
                    ? 'ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
                    : 'bg-white hover:bg-slate-50 dark:bg-slate-800'
                }`}
              >
                <div className="text-[10px] font-bold text-slate-500">Ch. {idx + 1}</div>
                <div className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {r.title}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: 5-MINUTE AUDIO RECAP */}
      {activeTab === 'recap' && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white shadow-xl">
              <Headphones className="h-8 w-8" />
            </div>
            <h3 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">
              5-Minute Executive Audio Recap
            </h3>
            <p className="mt-1 max-w-lg text-sm text-slate-500 dark:text-slate-400">
              High-yield spoken digest formatted for optimal exam recall. Listen on your commute, walking to class, or right before your midterm.
            </p>

            {/* Playback Hub */}
            <div className="mt-6 flex items-center gap-4">
              <button
                onClick={toggleAudioRecapSpeech}
                className="flex items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-700 active:scale-95"
              >
                {audioPlaying ? (
                  <>
                    <Pause className="h-5 w-5 fill-current" /> Pause Recap
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5 fill-current ms-0.5" /> Listen to 5-Min Recap
                  </>
                )}
              </button>

              <button
                onClick={() => setScriptDrawerOpen(!scriptDrawerOpen)}
                className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <FileText className="h-4 w-4" />
                {scriptDrawerOpen ? 'Hide Script' : 'View Full Script'}
              </button>
            </div>
          </div>

          {/* Full Script Drawer */}
          {scriptDrawerOpen && (
            <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-950">
              <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                Spoken Lecture Script (Word-for-Word Digest)
              </h4>
              <div className="space-y-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {lesson.audioRecapScript.split('\n\n').map((paragraph, pIdx) => (
                  <div
                    key={pIdx}
                    className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
                  >
                    {paragraph}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: INTERACTIVE MIND MAP */}
      {activeTab === 'mindmap' && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Lecture Knowledge Graph & Mind Map
              </h3>
              <p className="text-xs text-slate-500">
                Hierarchical taxonomy linking foundational theory, mechanism proofs, and exam tips.
              </p>
            </div>
            {selectedNode && (
              <button
                onClick={() => setSelectedNode(null)}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400"
              >
                Reset Focus
              </button>
            )}
          </div>

          {/* Visual Mind Map Graph */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-6 dark:border-slate-800/60 dark:bg-slate-950/40">
            {/* Root Node */}
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2 rounded-2xl border-2 border-indigo-500 bg-white px-6 py-3 shadow-lg dark:bg-slate-900">
                <span className="text-xl">🧠</span>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    Root Topic
                  </div>
                  <div className="text-sm font-black text-slate-900 dark:text-white">
                    {lesson.mindMap.label}
                  </div>
                </div>
              </div>

              {/* Connecting Stems */}
              <div className="h-8 w-0.5 bg-indigo-300 dark:bg-indigo-800" />

              {/* Branches Grid */}
              <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-3">
                {lesson.mindMap.children?.map((branch) => (
                  <div
                    key={branch.id}
                    onClick={() => setSelectedNode(branch)}
                    className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                      selectedNode?.id === branch.id
                        ? 'border-indigo-500 bg-indigo-50/50 shadow-md ring-2 ring-indigo-500/20 dark:bg-indigo-950/30'
                        : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{branch.icon || '💡'}</span>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {branch.label}
                      </h4>
                    </div>
                    {branch.summary && (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {branch.summary}
                      </p>
                    )}

                    {branch.takeaways && (
                      <div className="mt-3 space-y-1">
                        {branch.takeaways.map((t, idx) => (
                          <div
                            key={idx}
                            className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          >
                            ✓ {t}
                          </div>
                        ))}
                      </div>
                    )}

                    {branch.children && (
                      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                        {branch.children.map((sub) => (
                          <span
                            key={sub.id}
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                          >
                            {sub.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PRACTICE SPRINT (QUICK-FIRE QUIZ) */}
      {activeTab === 'quiz' && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Exam Readiness Sprint
              </h3>
              <p className="text-xs text-slate-500">
                Quick-fire validation of the core rules and mechanisms covered in the micro-lesson.
              </p>
            </div>
            {quizScore !== null && (
              <div className="rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                Score: {quizScore} / {lesson.practiceQuiz.length} Correct
              </div>
            )}
          </div>

          <div className="space-y-6">
            {lesson.practiceQuiz.map((q, qIdx) => {
              const selected = selectedAnswers[q.id];
              const isSubmitted = quizScore !== null;
              const isCorrect = selected === q.answer;

              return (
                <div
                  key={q.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-950/40"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                      {qIdx + 1}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {q.question}
                    </h4>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {q.options.map((opt, optIdx) => {
                      let btnStyle = 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 text-slate-700 dark:text-slate-300';
                      if (selected === optIdx) {
                        btnStyle = 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/20';
                      }
                      if (isSubmitted) {
                        if (optIdx === q.answer) {
                          btnStyle = 'border-emerald-500 bg-emerald-50 text-emerald-800 font-bold dark:bg-emerald-950 dark:text-emerald-300';
                        } else if (selected === optIdx && !isCorrect) {
                          btnStyle = 'border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-300';
                        }
                      }

                      return (
                        <button
                          key={optIdx}
                          disabled={isSubmitted}
                          onClick={() => handleAnswerSelect(q.id, optIdx)}
                          className={`rounded-xl border p-3 text-start text-xs transition-all ${btnStyle}`}
                        >
                          <span className="me-2 font-bold opacity-60">
                            {String.fromCharCode(65 + optIdx)}.
                          </span>
                          {opt}
                        </button>
                      );
                    })}
                  </div>

                  {isSubmitted && (
                    <div className="mt-3 rounded-xl bg-slate-100 p-3 text-xs leading-relaxed text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                      <span className="font-bold text-slate-800 dark:text-slate-200">Explanation: </span>
                      {q.explanation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex justify-end gap-3">
            {quizScore !== null ? (
              <button
                onClick={() => {
                  setSelectedAnswers({});
                  setQuizScore(null);
                }}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry Sprint
              </button>
            ) : (
              <button
                onClick={submitQuiz}
                disabled={Object.keys(selectedAnswers).length === 0}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-indigo-700 disabled:opacity-40"
              >
                <CheckCircle2 className="h-4 w-4" />
                Submit Answers
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

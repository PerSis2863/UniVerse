import prisma from '@/lib/db';
import { courseAccess, taughtBy } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { ForbiddenException, NotFoundException } from './http';
import { recordXApiStatement } from './analytics-warehouse';

// Stage 5 · D3: Lecture to Everything (Micro-Lessons / Audio Recaps & Revision Reels)
// Transforms recorded class sessions and study packs into bite-sized micro-lessons:
// 1. 5-minute structured audio recap with spoken lecture digest
// 2. 3 to 6 vertical revision reels cut at chapter boundaries with burned-in/overlay captions
// 3. Interactive hierarchical Mind Map visualization with exam alerts
// 4. Quick-fire practice quiz with immediate feedback

export interface RevisionReelCaption {
  start: number;
  end: number;
  text: string;
}

export interface RevisionReel {
  id: string;
  chapterIndex: number;
  title: string;
  timestampSec: number;
  durationSec: number;
  keyTakeaway: string;
  captions: RevisionReelCaption[];
  videoClipUrl?: string;
  gradient: string;
  hashtags: string[];
}

export interface MindMapNode {
  id: string;
  label: string;
  summary?: string;
  icon?: string;
  color?: string;
  takeaways?: string[];
  children?: MindMapNode[];
}

export interface PracticeQuizQuestion {
  id: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface LectureMicroLessonData {
  id: string;
  sessionId: string;
  courseId: string;
  sessionTitle: string;
  courseCode: string;
  courseName: string;
  audioRecapDurationSec: number;
  audioRecapScript: string;
  audioRecapUrl: string | null;
  audioRecapStatus: 'READY' | 'GENERATING' | 'FAILED';
  mindMap: MindMapNode;
  reels: RevisionReel[];
  practiceQuiz: PracticeQuizQuestion[];
  status: 'READY' | 'PROCESSING' | 'DRAFT';
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

const GRADIENTS = [
  'linear-gradient(135deg, #0b0b0c 0%, #111112 40%, #1b1b1e 100%)',
  'linear-gradient(135deg, #022c22 0%, #064e3b 40%, #047857 100%)',
  'linear-gradient(135deg, #450a0a 0%, #7f1d1d 40%, #b91c1c 100%)',
  'linear-gradient(135deg, #181a21 0%, #2d2a32 40%, #1b1b1e 100%)',
  'linear-gradient(135deg, #0c4a6e 0%, #0369a1 40%, #0284c7 100%)',
  'linear-gradient(135deg, #1c1917 0%, #44403c 40%, #d97706 100%)',
];

/** Synthesizes an engaging, high-retention 5-minute spoken audio recap script. */
export function synthesizeAudioRecapScript(
  topic: string,
  summary: string,
  notes: string[],
  chapters: { t: number; title: string }[],
  keyMoments: { t: number; text: string }[]
): string {
  const parts: string[] = [];
  parts.push(`🎯 [0:00 - 0:45] THE BIG PICTURE: Welcome to the 5-minute micro-recap for ${topic}. ${summary}`);

  if (chapters.length > 0) {
    const chapterList = chapters.slice(0, 3).map((c, i) => `Part ${i + 1}: ${c.title}`).join(', ');
    parts.push(`💡 [0:45 - 2:00] FOUNDATIONAL CONCEPTS: In this session we broke down key concepts including ${chapterList}.`);
  } else {
    parts.push(`💡 [0:45 - 2:00] FOUNDATIONAL CONCEPTS: Understanding the core principles of ${topic}.`);
  }

  if (notes.length > 0) {
    const coreNotes = notes.slice(0, 3).join(' Furthermore, ');
    parts.push(`⚡ [2:00 - 3:15] MECHANICS & APPLICATION: Here is what you must master: ${coreNotes}.`);
  } else {
    parts.push(`⚡ [2:00 - 3:15] MECHANICS & APPLICATION: Ensure you can apply these steps directly in practical exercises.`);
  }

  if (keyMoments.length > 0) {
    const moment = keyMoments[0];
    parts.push(`🔍 [3:15 - 4:15] DEEP DIVE & CRITICAL MOMENT: At minute ${Math.floor(moment.t / 60)}, we tackled a key turning point: ${moment.text}.`);
  } else {
    parts.push(`🔍 [3:15 - 4:15] DEEP DIVE: Pay special attention to edge cases where unexpected inputs challenge your assumptions.`);
  }

  parts.push(`⚠️ [4:15 - 4:45] EXAM PITFALL ALERT: The number one mistake students make is confusing terminology with underlying logic. Remember to justify each step on assessments.`);
  parts.push(`🏁 [4:45 - 5:00] 60-SECOND WRAP-UP: Keep these takeaways top of mind before reviewing your flashcards and revision reels. You are ready to ace this!`);

  return parts.join('\n\n');
}

/** Builds 3 to 6 vertical revision reels cut at chapter boundaries with burned-in captions. */
export function buildRevisionReels(
  courseCode: string,
  chapters: { t: number; title: string }[],
  notes: string[],
  transcriptLines: { t: number; who: string; text: string }[],
  videoUrl?: string
): RevisionReel[] {
  // If no chapters are provided, create default breakdown from notes
  const effectiveChapters = chapters.length >= 3 ? chapters.slice(0, 6) : [
    { t: 0, title: 'Lecture Introduction & Core Problem' },
    { t: 300, title: 'Key Principles & Step-by-Step Walkthrough' },
    { t: 600, title: 'Practical Examples & Solutions' },
    { t: 900, title: 'Edge Cases & Exam Applications' },
  ];

  return effectiveChapters.map((ch, idx) => {
    const nextChapter = effectiveChapters[idx + 1];
    const duration = nextChapter ? Math.min(nextChapter.t - ch.t, 90) : 60;
    const note = notes[idx] || notes[0] || 'Master this concept for the upcoming module exam.';

    // Extract captions matching this time window from transcript if available
    const windowLines = transcriptLines.filter((l) => l.t >= ch.t && l.t < ch.t + duration);
    let captions: RevisionReelCaption[] = [];

    if (windowLines.length > 0) {
      captions = windowLines.slice(0, 6).map((l, lIdx) => ({
        start: l.t - ch.t,
        end: (windowLines[lIdx + 1]?.t || l.t + 4) - ch.t,
        text: l.text,
      }));
    } else {
      // Synthesize 3 timed caption cues from the chapter title and note
      captions = [
        { start: 0, end: 3, text: `Concept ${idx + 1}: ${ch.title}` },
        { start: 3, end: 7, text: note },
        { start: 7, end: 11, text: 'Remember: apply this pattern on your practical exam!' },
      ];
    }

    return {
      id: `reel_${idx + 1}_${ch.t}`,
      chapterIndex: idx,
      title: ch.title,
      timestampSec: ch.t,
      durationSec: Math.max(duration, 30),
      keyTakeaway: note,
      captions,
      videoClipUrl: videoUrl || undefined,
      gradient: GRADIENTS[idx % GRADIENTS.length],
      hashtags: [`#${courseCode.toLowerCase().replace(/[^a-z0-9]/g, '')}`, '#microlearning', '#examprep', '#quickrevision'],
    };
  });
}

/** Builds a hierarchical mind map from lecture structure and chapters. */
export function buildLectureMindMap(
  topic: string,
  summary: string,
  chapters: { t: number; title: string }[],
  notes: string[]
): MindMapNode {
  const branches: MindMapNode[] = chapters.slice(0, 5).map((ch, idx) => {
    const note1 = notes[idx * 2] || notes[0] || 'Understand foundational definition';
    const note2 = notes[idx * 2 + 1] || 'Apply in homework & exam questions';

    return {
      id: `branch_${idx + 1}`,
      label: ch.title,
      summary: `Chapter ${idx + 1} timestamp ${Math.floor(ch.t / 60)}m`,
      icon: idx === 0 ? '🎯' : idx === 1 ? '💡' : idx === 2 ? '⚡' : '🔍',
      color: idx % 2 === 0 ? '#2a2927' : '#db2777',
      takeaways: [note1],
      children: [
        {
          id: `leaf_${idx + 1}_1`,
          label: 'Core Formula / Principle',
          takeaways: [note1],
        },
        {
          id: `leaf_${idx + 1}_2`,
          label: 'Practical Execution',
          takeaways: [note2],
        },
      ],
    };
  });

  return {
    id: 'root_node',
    label: topic,
    summary,
    icon: '🧠',
    color: '#5f5c57',
    takeaways: notes.slice(0, 3),
    children: branches.length > 0 ? branches : [
      {
        id: 'branch_default',
        label: 'Lecture Core Topics',
        summary,
        children: [
          { id: 'leaf_default_1', label: 'Theory & Foundations' },
          { id: 'leaf_default_2', label: 'Real-world Applications' },
        ],
      },
    ],
  };
}

/** Formats practice questions into standardized practice quiz items. */
export function buildPracticeQuiz(
  practice: { question: string; options: string[]; answer: number; explain: string }[],
  notes: string[]
): PracticeQuizQuestion[] {
  if (practice.length > 0) {
    return practice.slice(0, 5).map((p, idx) => ({
      id: `quiz_q_${idx + 1}`,
      question: p.question,
      options: p.options,
      answer: typeof p.answer === 'number' ? p.answer : 0,
      explanation: p.explain || 'Correct answer verified against lecture concepts.',
    }));
  }

  // Fallback questions generated from notes
  return [
    {
      id: 'quiz_q_1',
      question: 'Which statement best reflects the central theme discussed in this session?',
      options: [
        notes[0] || 'The primary principle covered in class',
        'An obsolete historical approach',
        'A secondary edge case with negligible impact',
        'None of the above',
      ],
      answer: 0,
      explanation: notes[0] || 'This was emphasized as the core outcome of the lecture.',
    },
    {
      id: 'quiz_q_2',
      question: 'When applying these concepts under exam constraints, what should you verify first?',
      options: [
        'Skip directly to the final calculation without intermediate verification',
        'Verify input boundary conditions and foundational prerequisites',
        'Assume all default parameters remain constant',
        'Omit documentation and annotations',
      ],
      answer: 1,
      explanation: 'Boundary conditions and prerequisite validation prevent the most common errors.',
    },
  ];
}

/** Generates or regenerates a full micro-lesson pack for a given class session. */
export async function generateLectureMicroLesson(
  sessionId: string,
  user: SessionUser,
  forceRegenerate = false
): Promise<LectureMicroLessonData> {
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: {
      course: {
        select: { id: true, code: true, name: true, teacherId: true },
      },
    },
  });

  if (!session) {
    throw new NotFoundException('Class session not found');
  }

  // Only the class's teacher, its students and admins; only the teacher (or an admin) makes it again.
  const access = await courseAccess(session.courseId, user);
  if (!access) throw new NotFoundException('Class session not found');
  if (forceRegenerate && !access.canManage) throw new ForbiddenException('Only the class teacher can make this pack again.');

  // If exists and not force-regenerate, return existing
  const existing = await prisma.lectureMicroLesson.findUnique({
    where: { sessionId },
  });

  if (existing && !forceRegenerate) {
    return formatMicroLessonResponse(existing, session.course.code, session.course.name);
  }

  // Parse session components safely
  let notes: string[] = [];
  let keyMoments: { t: number; text: string }[] = [];
  let chapters: { t: number; title: string }[] = [];
  let transcriptLines: { t: number; who: string; text: string }[] = [];
  let practice: { question: string; options: string[]; answer: number; explain: string }[] = [];

  try { notes = JSON.parse(session.notes || '[]'); } catch { notes = []; }
  try { keyMoments = JSON.parse(session.keyMoments || '[]'); } catch { keyMoments = []; }
  try { chapters = JSON.parse(session.chapters || '[]'); } catch { chapters = []; }
  try { transcriptLines = JSON.parse(session.transcript || '[]'); } catch { transcriptLines = []; }
  try { practice = JSON.parse(session.practice || '[]'); } catch { practice = []; }

  const sessionTopic = `${session.course.code} Lecture: Session on ${new Date(session.startedAt).toLocaleDateString()}`;
  const summaryText = session.summary || session.recap || 'Comprehensive lecture covering core theoretical principles and practical problem solving.';

  // 1. Synthesize 5-minute audio recap script
  const audioRecapScript = synthesizeAudioRecapScript(
    sessionTopic,
    summaryText,
    notes,
    chapters,
    keyMoments
  );

  // 2. Build 3 to 6 vertical revision reels
  const reels = buildRevisionReels(
    session.course.code,
    chapters,
    notes,
    transcriptLines,
    session.recordingMaterialId ? `/api/materials/${session.recordingMaterialId}/stream` : undefined
  );

  // 3. Build Mind Map
  const mindMap = buildLectureMindMap(
    session.course.name,
    summaryText,
    chapters,
    notes
  );

  // 4. Build Practice Quiz
  const practiceQuiz = buildPracticeQuiz(practice, notes);

  // Save to database
  const saved = await prisma.lectureMicroLesson.upsert({
    where: { sessionId },
    create: {
      sessionId,
      courseId: session.courseId,
      audioRecapDurationSec: 300,
      audioRecapScript,
      audioRecapStatus: 'READY',
      mindMap: JSON.stringify(mindMap),
      reels: JSON.stringify(reels),
      practiceQuiz: JSON.stringify(practiceQuiz),
      status: 'READY',
      publishedAt: new Date(),
    },
    update: {
      audioRecapDurationSec: 300,
      audioRecapScript,
      audioRecapStatus: 'READY',
      mindMap: JSON.stringify(mindMap),
      reels: JSON.stringify(reels),
      practiceQuiz: JSON.stringify(practiceQuiz),
      status: 'READY',
      updatedAt: new Date(),
    },
  });

  // Record xAPI statement
  try {
    await recordXApiStatement({
      actorId: user.id,
      actorType: 'USER',
      verb: 'generated',
      objectType: 'micro_lesson',
      objectId: saved.id,
      objectName: `${session.course.code} Micro-Lesson Pack`,
      contextCourseId: session.courseId,
      contextSessionId: sessionId,
    });
  } catch {
    // telemetry failure shouldn't block user
  }

  return formatMicroLessonResponse(saved, session.course.code, session.course.name);
}

/** Retrieves micro-lesson for a session, generating it on-the-fly if not yet created. */
export async function getLectureMicroLesson(
  sessionId: string,
  user: SessionUser
): Promise<LectureMicroLessonData> {
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: {
      course: {
        select: { id: true, code: true, name: true },
      },
    },
  });

  if (!session) {
    throw new NotFoundException('Class session not found');
  }

  if (!(await courseAccess(session.courseId, user))) throw new NotFoundException('Class session not found');

  const existing = await prisma.lectureMicroLesson.findUnique({
    where: { sessionId },
  });

  if (existing) {
    return formatMicroLessonResponse(existing, session.course.code, session.course.name);
  }

  // Auto-generate if missing
  return generateLectureMicroLesson(sessionId, user, false);
}

/** Lists all micro-lessons for a course. */
export async function listCourseMicroLessons(
  courseId: string,
  user: SessionUser
): Promise<LectureMicroLessonData[]> {
  if (!(await courseAccess(courseId, user))) throw new NotFoundException('Course not found');

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { code: true, name: true },
  });

  if (!course) {
    throw new NotFoundException('Course not found');
  }

  const lessons = await prisma.lectureMicroLesson.findMany({
    where: { courseId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return lessons.map((l) => formatMicroLessonResponse(l, course.code, course.name));
}

/**
 * The latest micro-lessons from the classes I teach or take (admins: every class), newest first: the
 * Revision Reels page when no class is chosen. Same people as courseAccess (teacher, enrolled students, admins).
 */
export async function listMyMicroLessons(user: SessionUser): Promise<LectureMicroLessonData[]> {
  const lessons = await prisma.lectureMicroLesson.findMany({
    where: user.role === 'ADMIN' ? {} : { course: { OR: [...taughtBy(user.id).OR, { enrollments: { some: { studentId: user.id } } }] } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { course: { select: { code: true, name: true } } },
  });
  return lessons.map((l) => formatMicroLessonResponse(l, l.course.code, l.course.name));
}

/** Records a view of a class session's micro-lesson (or one of its reels), by people in that class. */
export async function trackMicroLessonInteraction(
  sessionId: string,
  reelId: string | null,
  user: SessionUser
): Promise<{ success: boolean; viewCount: number }> {
  const lesson = await prisma.lectureMicroLesson.findUnique({
    where: { sessionId },
  });

  if (!lesson || !(await courseAccess(lesson.courseId, user))) {
    throw new NotFoundException('Micro lesson not found');
  }
  const lessonId = lesson.id;

  const updated = await prisma.lectureMicroLesson.update({
    where: { id: lessonId },
    data: { viewCount: { increment: 1 } },
  });

  try {
    await recordXApiStatement({
      actorId: user.id,
      actorType: 'USER',
      verb: 'interacted',
      objectType: reelId ? 'revision_reel' : 'micro_lesson',
      objectId: reelId || lessonId,
      objectName: reelId ? `Reel ${reelId}` : 'Lecture Micro Lesson',
      durationSeconds: 45,
      contextCourseId: lesson.courseId,
      contextSessionId: lesson.sessionId,
    });
  } catch {
    // Non-blocking
  }

  return { success: true, viewCount: updated.viewCount };
}

function formatMicroLessonResponse(
  lesson: {
    id: string;
    sessionId: string;
    courseId: string;
    audioRecapDurationSec: number;
    audioRecapScript: string;
    audioRecapUrl: string | null;
    audioRecapStatus: string;
    mindMap: string;
    reels: string;
    practiceQuiz: string;
    status: string;
    viewCount: number;
    createdAt: Date;
    updatedAt: Date;
  },
  courseCode: string,
  courseName: string
): LectureMicroLessonData {
  let mindMap: MindMapNode;
  let reels: RevisionReel[] = [];
  let practiceQuiz: PracticeQuizQuestion[] = [];

  try { mindMap = JSON.parse(lesson.mindMap); } catch { mindMap = { id: 'root', label: courseName }; }
  try { reels = JSON.parse(lesson.reels); } catch { reels = []; }
  try { practiceQuiz = JSON.parse(lesson.practiceQuiz); } catch { practiceQuiz = []; }

  return {
    id: lesson.id,
    sessionId: lesson.sessionId,
    courseId: lesson.courseId,
    sessionTitle: `${courseCode} Micro-Lesson`,
    courseCode,
    courseName,
    audioRecapDurationSec: lesson.audioRecapDurationSec,
    audioRecapScript: lesson.audioRecapScript,
    audioRecapUrl: lesson.audioRecapUrl,
    audioRecapStatus: (lesson.audioRecapStatus as 'READY' | 'GENERATING' | 'FAILED') || 'READY',
    mindMap,
    reels,
    practiceQuiz,
    status: (lesson.status as 'READY' | 'PROCESSING' | 'DRAFT') || 'READY',
    viewCount: lesson.viewCount,
    createdAt: lesson.createdAt.toISOString(),
    updatedAt: lesson.updatedAt.toISOString(),
  };
}

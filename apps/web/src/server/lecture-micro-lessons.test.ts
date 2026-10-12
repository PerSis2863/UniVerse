import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import {
  synthesizeAudioRecapScript,
  buildRevisionReels,
  buildLectureMindMap,
  buildPracticeQuiz,
  generateLectureMicroLesson,
  getLectureMicroLesson,
  trackMicroLessonInteraction,
} from './lecture-micro-lessons';

vi.mock('@/lib/db', () => ({
  default: {
    classSession: {
      findUnique: vi.fn(),
    },
    course: {
      findUnique: vi.fn(),
    },
    lectureMicroLesson: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    enrollment: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@/lib/course-access', () => ({
  courseAccess: vi.fn().mockResolvedValue({
    course: { id: 'c_cs101', code: 'CS101', name: 'Computer Science 101', teacherId: 'u_teacher' },
    isTeacher: true,
  }),
}));

vi.mock('./analytics-warehouse', () => ({
  recordXApiStatement: vi.fn().mockResolvedValue({ id: 'xapi_1' }),
}));

describe('Lecture to Everything: Micro-Lessons & Revision Reels (Stage 5 · D3)', () => {
  const mockUser: SessionUser = {
    id: 'u_student_1',
    role: 'STUDENT',
    email: 'student@example.edu',
    name: 'Alice Student',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('synthesizeAudioRecapScript', () => {
    it('creates a structured 5-minute spoken audio recap with timing brackets and hook', () => {
      const script = synthesizeAudioRecapScript(
        'Binary Search Trees',
        'We covered balancing mechanisms and logarithmic search efficiency.',
        ['BST invariant: left < node < right', 'AVL tree rotation rules', 'Red-black coloring properties'],
        [
          { t: 0, title: 'Introduction to Trees' },
          { t: 300, title: 'Rotations & Balance' },
          { t: 600, title: 'Complexity Analysis' },
        ],
        [{ t: 450, text: 'Teacher showed double-rotation edge case' }]
      );

      expect(script).toContain('🎯 [0:00 - 0:45] THE BIG PICTURE');
      expect(script).toContain('Binary Search Trees');
      expect(script).toContain('💡 [0:45 - 2:00] FOUNDATIONAL CONCEPTS');
      expect(script).toContain('⚡ [2:00 - 3:15] MECHANICS & APPLICATION');
      expect(script).toContain('🔍 [3:15 - 4:15] DEEP DIVE & CRITICAL MOMENT');
      expect(script).toContain('⚠️ [4:15 - 4:45] EXAM PITFALL ALERT');
      expect(script).toContain('🏁 [4:45 - 5:00] 60-SECOND WRAP-UP');
    });

    it('handles empty chapters and notes with graceful fallbacks', () => {
      const script = synthesizeAudioRecapScript(
        'General Topic',
        'Introductory overview.',
        [],
        [],
        []
      );

      expect(script).toContain('🎯 [0:00 - 0:45]');
      expect(script).toContain('General Topic');
      expect(script).toContain('🏁 [4:45 - 5:00]');
    });
  });

  describe('buildRevisionReels', () => {
    it('builds vertical revision reels cut at chapter boundaries with captions and gradients', () => {
      const chapters = [
        { t: 0, title: 'What is Recursion?' },
        { t: 180, title: 'Base Cases & Termination' },
        { t: 360, title: 'Call Stack Frames' },
      ];
      const notes = [
        'Recursion requires a well-defined base case.',
        'Stack overflow occurs when base condition is omitted.',
        'Each activation record retains local scope variables.',
      ];
      const transcript = [
        { t: 10, who: 'Prof', text: 'Today we discuss recursion.' },
        { t: 25, who: 'Prof', text: 'Notice how the function invokes itself.' },
        { t: 190, who: 'Prof', text: 'Without a base case, execution never halts.' },
      ];

      const reels = buildRevisionReels('CS101', chapters, notes, transcript);

      expect(reels.length).toBe(3);
      expect(reels[0].id).toBe('reel_1_0');
      expect(reels[0].title).toBe('What is Recursion?');
      expect(reels[0].gradient).toContain('linear-gradient');
      expect(reels[0].hashtags).toContain('#cs101');
      expect(reels[0].captions.length).toBeGreaterThan(0);
      expect(reels[0].captions[0].text).toBe('Today we discuss recursion.');
    });

    it('generates fallback chapter reels when input chapters are empty', () => {
      const reels = buildRevisionReels('MATH201', [], ['Linear equations'], []);
      expect(reels.length).toBeGreaterThanOrEqual(3);
      expect(reels[0].hashtags).toContain('#math201');
      expect(reels[0].captions.length).toBeGreaterThan(0);
    });
  });

  describe('buildLectureMindMap', () => {
    it('builds a hierarchical mind map tree with root, branches, and takeaways', () => {
      const chapters = [
        { t: 0, title: 'Graph Theory Foundations' },
        { t: 300, title: 'Breadth-First Search (BFS)' },
      ];
      const notes = ['Queue-based traversal', 'Shortest path in unweighted graphs'];

      const mindMap = buildLectureMindMap('Graph Algorithms', 'Shortest path algorithms', chapters, notes);

      expect(mindMap.id).toBe('root_node');
      expect(mindMap.label).toBe('Graph Algorithms');
      expect(mindMap.children).toBeDefined();
      expect(mindMap.children!.length).toBe(2);
      expect(mindMap.children![0].label).toBe('Graph Theory Foundations');
      expect(mindMap.children![0].children!.length).toBe(2);
    });
  });

  describe('buildPracticeQuiz', () => {
    it('formats existing practice questions correctly', () => {
      const practice = [
        {
          question: 'What is the time complexity of binary search?',
          options: ['O(1)', 'O(log n)', 'O(n)', 'O(n^2)'],
          answer: 1,
          explain: 'Halving the search space per iteration yields logarithmic time.',
        },
      ];

      const quiz = buildPracticeQuiz(practice, []);
      expect(quiz.length).toBe(1);
      expect(quiz[0].id).toBe('quiz_q_1');
      expect(quiz[0].answer).toBe(1);
      expect(quiz[0].options[1]).toBe('O(log n)');
    });

    it('generates fallback quiz questions if practice list is empty', () => {
      const quiz = buildPracticeQuiz([], ['Important course principle']);
      expect(quiz.length).toBe(2);
      expect(quiz[0].options.length).toBe(4);
    });
  });

  describe('generateLectureMicroLesson & getLectureMicroLesson', () => {
    it('generates and saves a micro-lesson pack for a valid class session', async () => {
      const mockSession = {
        id: 'sess_123',
        courseId: 'c_cs101',
        startedAt: new Date('2026-10-10T10:00:00Z'),
        summary: 'Deep dive into dynamic programming memoization.',
        notes: JSON.stringify(['Overlapping subproblems', 'Optimal substructure']),
        keyMoments: JSON.stringify([{ t: 600, text: 'Fibonacci tree comparison' }]),
        chapters: JSON.stringify([
          { t: 0, title: 'Introduction' },
          { t: 300, title: 'Top-down Memoization' },
          { t: 600, title: 'Bottom-up Tabulation' },
        ]),
        transcript: JSON.stringify([{ t: 15, who: 'Teacher', text: 'Welcome everyone.' }]),
        practice: JSON.stringify([
          {
            question: 'What characterizes dynamic programming?',
            options: ['Greedy choices', 'Overlapping subproblems', 'Random selection', 'Brute force'],
            answer: 1,
            explain: 'Subproblems repeat and solutions can be cached.',
          },
        ]),
        recordingMaterialId: 'mat_vid_1',
        course: { id: 'c_cs101', code: 'CS101', name: 'Computer Science 101', organizationId: 'org_1', teacherId: 'u_teacher' },
      };

      vi.mocked(prisma.classSession.findUnique).mockResolvedValue(mockSession as never);
      vi.mocked(prisma.lectureMicroLesson.findUnique).mockResolvedValue(null as never);

      const mockSaved = {
        id: 'lml_999',
        sessionId: 'sess_123',
        courseId: 'c_cs101',
        audioRecapDurationSec: 300,
        audioRecapScript: '🎯 [0:00 - 0:45] Recap script content...',
        audioRecapUrl: null,
        audioRecapStatus: 'READY',
        mindMap: JSON.stringify({ id: 'root', label: 'Computer Science 101' }),
        reels: JSON.stringify([{ id: 'reel_1_0', title: 'Intro', durationSec: 60, captions: [], gradient: 'grad', hashtags: [] }]),
        practiceQuiz: JSON.stringify([{ id: 'quiz_q_1', question: 'Q1', options: ['A', 'B'], answer: 0, explanation: 'Exp' }]),
        status: 'READY',
        viewCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.lectureMicroLesson.upsert).mockResolvedValue(mockSaved as never);

      const result = await generateLectureMicroLesson('sess_123', mockUser);
      // Verify getLectureMicroLesson returns cached result
      vi.mocked(prisma.lectureMicroLesson.findUnique).mockResolvedValue(mockSaved as never);
      const fetched = await getLectureMicroLesson('sess_123', mockUser);
      expect(fetched.id).toBe('lml_999');

      expect(result.id).toBe('lml_999');
      expect(result.courseCode).toBe('CS101');
      expect(result.audioRecapDurationSec).toBe(300);
      expect(result.reels.length).toBe(1);
      expect(prisma.lectureMicroLesson.upsert).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException if session is missing', async () => {
      vi.mocked(prisma.classSession.findUnique).mockResolvedValue(null as never);

      await expect(generateLectureMicroLesson('invalid_sess', mockUser)).rejects.toThrow('Class session not found');
    });

    it('tracks micro-lesson view and increments counter', async () => {
      vi.mocked(prisma.lectureMicroLesson.findUnique).mockResolvedValue({
        id: 'lml_999',
        sessionId: 'sess_123',
        courseId: 'c_cs101',
        course: { organizationId: 'org_1' },
      } as never);

      vi.mocked(prisma.lectureMicroLesson.update).mockResolvedValue({
        id: 'lml_999',
        viewCount: 12,
      } as never);

      const trackResult = await trackMicroLessonInteraction('lml_999', 'reel_1_0', mockUser);
      expect(trackResult.success).toBe(true);
      expect(trackResult.viewCount).toBe(12);
    });
  });
});

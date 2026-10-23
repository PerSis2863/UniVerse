// The owner's "UniVerse explained" whiteboard (owner console → Explain UniVerse; universe-guide.ts
// draws it). Its own small file so the boards list and the console can name it without loading the
// whole board.
export const GUIDE_TITLE = 'UniVerse explained';
/** Raise when the board's design changes: the owner's boards list then makes the new one by itself. */
export const GUIDE_VERSION = '4';
/** Every shape's id starts with this, so a board of this design can be told apart and topped up. */
export const GUIDE_ID_PREFIX = `g${GUIDE_VERSION}-`;
/** Opening it always asks for the guide template: it fills an empty board, or adds what's missing. */
export const guideHref = (id: string) => `/boards/${id}?template=guide`;

/** The board's areas, in order (its banner lists them; the console's Explain UniVerse shows them). */
export const GUIDE_AREAS = [
  'Start here: this banner (Blank canvas)', 'Every feature: a mind map (Mind map)', 'Jobs it runs by itself: 8 flowcharts',
  'How a request travels: the parts', 'How it works, technically (Cornell notes)', 'How it was built (Timeline)',
  'The owner’s week (Weekly planner)', 'Every page: students', 'Every page: teachers', 'Every page: school admins',
  'Every page: parents', 'Every page: the owner console', 'Where things stand (Kanban)', 'Strengths and risks (SWOT)',
  'Website and phone app (Venn diagram)', 'Looking back (Retrospective)', 'Showing it to a school (Lesson plan)',
  'Safety and privacy', 'Limits and costs', 'Words used on this board', 'The code in numbers (charts)',
  'The database: 298 tables (chart)', 'Who can do what (matrix)', 'Signing in, step by step', 'An assignment’s life (states)',
  'Notifications: what goes where (matrix)', 'The stack, with versions', 'Checks every change passes', 'What each page loads first (chart)', 'Languages: every one, by name',
  'Unit tests: by where they live', 'Guards and scheduled jobs', 'Every server route, listed', 'Every page address, listed',
  'Every database table, with its fields', 'How the database grew: every change',
];

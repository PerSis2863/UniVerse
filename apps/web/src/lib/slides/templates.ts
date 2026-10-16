import { newSlide, type DeckJSON, type ThemeId } from './deck';

// Ready-made presentations (Office suite): a new presentation can start from one of these, with
// speaker notes saying what each slide is for. Import-free.

export interface DeckTemplate { id: string; name: string; hint: string; deck: () => DeckJSON }
const deck = (theme: ThemeId, slides: DeckJSON['slides']): DeckJSON => ({ theme, ratio: '16:9', slides });
const note = (s: DeckJSON['slides'][number], notes: string) => ({ ...s, notes });

export const DECK_TEMPLATES: DeckTemplate[] = [
  {
    id: 'lesson', name: 'Lesson', hint: 'Aims, teaching, an activity and a recap',
    deck: () => deck('classic', [
      note(newSlide('title', '16:9', { title: 'Lesson title', subtitle: 'Subject · Year · Date' }), 'Welcome the class and say what today is about.'),
      note(newSlide('content', '16:9', { title: 'By the end of today you can…', body: 'Explain…\nDescribe…\nUse…' }), 'Share the aims. Come back to them at the end.'),
      note(newSlide('two', '16:9', { title: 'Key ideas', body: 'First idea\nAn example', body2: 'Second idea\nAn example' }), 'Teach the main ideas with examples.'),
      note(newSlide('content', '16:9', { title: 'Your turn', body: 'Work with a partner\nYou have 10 minutes\nBe ready to share' }), 'Set the activity and the time.'),
      note(newSlide('content', '16:9', { title: 'What we learned', body: 'One thing\nAnother thing\nA question to think about' }), 'Recap, and check the aims.'),
      note(newSlide('section', '16:9', { title: 'Questions?', subtitle: 'Homework: …' }), ''),
    ]),
  },
  {
    id: 'pitch', name: 'Project pitch', hint: 'Problem, idea, plan and ask',
    deck: () => deck('midnight', [
      note(newSlide('title', '16:9', { title: 'Our project', subtitle: 'Team name · Date' }), 'Say who you are in one sentence.'),
      note(newSlide('content', '16:9', { title: 'The problem', body: 'Who has it\nWhy it matters\nA fact that shows it' }), 'Make people care about the problem.'),
      note(newSlide('content', '16:9', { title: 'Our idea', body: 'What we’ll make\nHow it helps\nWhy it’s different' }), ''),
      note(newSlide('two', '16:9', { title: 'The plan', body: 'Step 1\nStep 2\nStep 3', body2: 'Week 1–2\nWeek 3–4\nWeek 5' }), ''),
      note(newSlide('content', '16:9', { title: 'The team', body: 'Name: role\nName: role\nName: role' }), ''),
      note(newSlide('quote', '16:9', { title: 'What we need from you', subtitle: 'Our ask' }), 'Finish with a clear ask.'),
    ]),
  },
  {
    id: 'science', name: 'Science experiment', hint: 'Question, method, results, conclusion',
    deck: () => deck('ocean', [
      newSlide('title', '16:9', { title: 'Experiment title', subtitle: 'Your name · Class' }),
      newSlide('content', '16:9', { title: 'Question and hypothesis', body: 'What we wanted to find out\nWhat we thought would happen, and why' }),
      newSlide('content', '16:9', { title: 'Method', body: 'Equipment\nWhat we changed\nWhat we measured\nHow we kept it fair' }),
      newSlide('picture', '16:9', { title: 'Results', body: 'Add a photo or a chart of your results' }),
      newSlide('content', '16:9', { title: 'Conclusion', body: 'What we found\nWas the hypothesis right?\nWhat we’d do differently' }),
    ]),
  },
  {
    id: 'book', name: 'Book report', hint: 'Story, characters and your opinion',
    deck: () => deck('sunrise', [
      newSlide('title', '16:9', { title: 'Book title', subtitle: 'by Author · Report by Your name' }),
      newSlide('content', '16:9', { title: 'What happens', body: 'Beginning\nMiddle\nEnd (no spoilers if you like)' }),
      newSlide('two', '16:9', { title: 'Characters', body: 'Main character\nWhat they want', body2: 'Another character\nHow they change' }),
      newSlide('quote', '16:9', { title: 'A favourite line from the book', subtitle: 'Page …' }),
      newSlide('content', '16:9', { title: 'What I think', body: 'What I liked\nWhat I didn’t\nWho should read it' }),
    ]),
  },
];

export const deckTemplateById = (id: string | null | undefined) => DECK_TEMPLATES.find((t) => t.id === id) ?? null;

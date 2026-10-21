import { hits, keywords } from './second-chance';

// Which of a course's concepts a piece of text is about (Stage 5 · Q22, Learning DNA signals): a
// flashcard's two sides, or a question asked to the course tutor. Words only, no AI, so it costs
// nothing: a concept's name must be (mostly) in the text; its description breaks ties. Pure and
// unit-tested.

export interface ConceptRef { id: string; name: string; description?: string | null; parentId?: string | null }

/** The concept the text is about, or null when none fits well enough. The more specific one wins a tie. */
export function matchConcept(text: string, concepts: ConceptRef[]): string | null {
  if (!text.trim() || !concepts.length) return null;
  let best: { id: string; score: number; keys: number; leaf: boolean } | null = null;
  for (const c of concepts) {
    const keys = keywords(c.name, 4);
    if (!keys.length) continue;
    const named = hits(text, keys);
    // More than half the name: "big o notation" needs both its words, "loops" its one.
    if (named < Math.floor(keys.length / 2) + 1) continue;
    const score = named * 2 + hits(text, keywords(c.description ?? '', 6));
    const leaf = !concepts.some((x) => x.parentId === c.id);
    if (!best || score > best.score || (score === best.score && (keys.length > best.keys || (keys.length === best.keys && leaf && !best.leaf)))) best = { id: c.id, score, keys: keys.length, leaf };
  }
  return best?.id ?? null;
}

/** A flashcard review as an outcome for the mastery map: "again" 0, "hard" 0.6, "good" 0.9, "easy" 1. */
export const CARD_OUTCOME: Record<string, number> = { again: 0, hard: 0.6, good: 0.9, easy: 1 };
/** Flashcards count less than a quiz answer: the student marks themselves. */
export const CARD_WEIGHT = 0.3;

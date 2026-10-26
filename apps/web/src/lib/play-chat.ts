import { quickCheck } from './safety-patterns';

// Chat in UniVerse Play rooms (M39): short messages and one-tap phrases, checked the same way as the
// school chats' quick safety check, with links, e-mail addresses and long numbers hidden. Used by the
// room (cloudflare/game-room.ts) before passing a message on, so nothing unchecked reaches anyone.

export const CHAT_MAX = 120;
/** One-tap phrases (safe for every age, and quick on a phone). */
export const QUICK_CHAT = ['Hi!', 'Follow me!', 'Over here!', 'Help!', 'Nice one!', 'Wait for me', 'Let’s go!', 'GG'] as const;

/** A message tidied for the room, or why it can't be sent. */
export function cleanChat(raw: unknown): { text: string } | { blocked: string } {
  if (typeof raw !== 'string') return { blocked: 'Empty message.' };
  let text = raw.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
  if (!text) return { blocked: 'Empty message.' };
  if (quickCheck(text)) return { blocked: 'That message wasn’t sent: keep it kind and don’t share personal details.' };
  text = text
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[link]')
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[email]')
    .replace(/(?:\+?\d[\s-]?){7,}/g, '[number]');
  return { text };
}

// Message effects (M17, after iMessage): a screen effect plays across the chat when the message
// arrives; a bubble effect changes how the bubble lands (invisible ink stays hidden until tapped).

export const EFFECTS = [
  { id: 'confetti', label: 'Confetti', emoji: '🎉', screen: true },
  { id: 'balloons', label: 'Balloons', emoji: '🎈', screen: true },
  { id: 'hearts', label: 'Hearts', emoji: '💖', screen: true },
  { id: 'fireworks', label: 'Fireworks', emoji: '🎆', screen: true },
  { id: 'lasers', label: 'Lasers', emoji: '🔦', screen: true },
  { id: 'slam', label: 'Slam', emoji: '💥', screen: false },
  { id: 'loud', label: 'Loud', emoji: '📣', screen: false },
  { id: 'gentle', label: 'Gentle', emoji: '🪶', screen: false },
  { id: 'ink', label: 'Invisible ink', emoji: '🫥', screen: false },
] as const;

export type MessageEffect = (typeof EFFECTS)[number]['id'];
const IDS = new Set<string>(EFFECTS.map((e) => e.id));
export const effectOf = (v: unknown): MessageEffect | null => (typeof v === 'string' && IDS.has(v) ? (v as MessageEffect) : null);
export const isScreenEffect = (e: MessageEffect | null | undefined) => !!e && !!EFFECTS.find((x) => x.id === e)?.screen;

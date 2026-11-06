import { LOOK_COLORS, LOOK_HATS, type LookHat } from '@/lib/play';

// The 3D worlds' character look (M37): a colour and a hat, kept on this device. The Play page's
// "Your player" card that picked them was removed (M119, the owner); a look chosen before stays.

export interface Look { color: string; hat: LookHat }
const KEY = 'uv-look';
const DEFAULT: Look = { color: 'pink', hat: 'none' };

export function readLook(): Look {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Look> | null;
    return { color: LOOK_COLORS.some((c) => c.id === v?.color) ? v!.color! : DEFAULT.color, hat: LOOK_HATS.some((h) => h.id === v?.hat) ? v!.hat! : DEFAULT.hat };
  } catch { return DEFAULT; }
}
/** The look's body colour as a number for three.js. */
export const lookHex = (look: Look) => parseInt((LOOK_COLORS.find((c) => c.id === look.color) ?? LOOK_COLORS[0]).hex.slice(1), 16);

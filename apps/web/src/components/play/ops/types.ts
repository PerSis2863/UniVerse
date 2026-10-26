import type { BuyId, FireMode, Item, Loadout, Rarity, WeaponClass } from '@/lib/play/ops';
import type { GameStat } from '../game-props';

// What the game tells the screen (the HUD and menus), and what the screen can ask of the game.

export type Phase = 'safehouse' | 'insert' | 'raid' | 'down' | 'exfil' | 'range';
export interface HudState {
  phase: Phase;
  hp: number; plates: number[]; plateMax: number;
  bleeding: boolean; fracture: boolean; adrenaline: number; nvg: boolean; nvgOk: boolean; heavy: boolean; hidden: boolean; swimming: boolean;
  stamina: number;
  gun: { name: string; rarity: Rarity; cls: WeaponClass; mag: number; magMax: number; reserve: number; mode: FireMode; modes: FireMode[]; att: string[] } | null;
  slot: number; slots: { name: string; rarity: Rarity }[];
  frags: number; flashes: number; spares: number; meds: { bandage: number; firstaid: number; adrenaline: number; splint: number };
  cash: number; fresh: number; banked: number; kills: number;
  prompt: string; objective: string;
  extract: { left: number; state: 'none' | 'called' | 'landing' | 'boarding' } | null;
  vehicle: { speed: number; fuel: number; hp: number; flat: number; kind: string } | null;
  uav: number; hour: number; rain: boolean; detect: number; busy: string;
  aiming: boolean; scope: boolean; reloading: boolean; selfRevive: boolean;
}
export interface FeedLine { id: number; kind: 'radio' | 'kill' | 'loot' | 'info' | 'bad'; text: string; color?: string }
export interface Banner { id: number; title: string; sub?: string; tone: 'gold' | 'good' | 'bad' | 'info' }
export type HitKind = 'flesh' | 'armour' | 'break' | 'head' | 'kill';
export type Menu =
  | { kind: 'inventory'; loadout: Loadout; weight: number; limit: number; loot: { title: string; items: Item[] } | null }
  | { kind: 'buy'; cash: number }
  | { kind: 'map'; mortar: boolean }
  | { kind: 'down'; selfRevive: boolean; lost: number }
  | { kind: 'summary'; title: string; lines: [string, string][] };
export interface Callbacks {
  hud(h: HudState): void;
  feed(l: Omit<FeedLine, 'id'>): void;
  banner(b: Omit<Banner, 'id'>): void;
  hit(k: HitKind): void;
  hurt(angleDeg: number): void;
  menu(m: Menu | null): void;
  score(score: number, kills: number, stats: GameStat[]): void;
}
export interface HudRefs { compass: HTMLDivElement | null; mini: HTMLCanvasElement | null; big: HTMLCanvasElement | null; reticle: HTMLDivElement | null; card: HTMLDivElement | null; cardText: HTMLDivElement | null }
export type { BuyId };

import { SPEED, STAMINA, TAC_SPRINT_S, roadAt, type OpsMap } from '@/lib/play/ops';
import { Body, THREE, type Button, type Controls } from '../world/core';
import type { SolidGrid } from './grid';

// Moving in first person (the owner: "Sprint (Shift), Tactical Sprint (double-tap Shift with gun
// raised vertically), Slide (C while sprinting with camera tilt), Crouch (C), Prone (Z), and
// Contextual Vaulting/Mantling (Space over low walls/windows)… stamina/breath… Q and E tactical
// leaning… Use/Interact on F"). Input comes from the shared Controls (mouse look, WASD, the phone's
// stick and buttons) plus this game's own keys. The body is an upright box that changes height with
// the stance, resolved against the solids near it and the ground; vaulting and mantling are short
// arcs over or onto what's in front.

export type Stance = 'stand' | 'crouch' | 'prone';
export type Surface = 'grass' | 'gravel' | 'asphalt' | 'metal' | 'wood' | 'concrete' | 'water' | 'sand';
/** One-shot actions from this game's keys and phone buttons. */
export type Act = 'reload' | 'inspect' | 'support' | 'use' | 'mode' | 'plate' | 'firstaid' | 'bandage' | 'splint' | 'adrenaline' | 'frag' | 'flash' | 'nvg' | 'map' | 'inventory' | 'weather' | 'slot1' | 'slot2' | 'slot3' | 'swap' | 'crouch' | 'prone' | 'jump' | 'extract';

const KEYMAP: Record<string, Act> = { r: 'reload', f: 'use', b: 'mode', '4': 'plate', h: 'firstaid', '5': 'support', '6': 'splint', '7': 'adrenaline', '8': 'bandage', g: 'frag', v: 'flash', n: 'nvg', m: 'map', tab: 'inventory', i: 'inspect', y: 'weather', '1': 'slot1', '2': 'slot2', '3': 'slot3', x: 'swap', c: 'crouch', z: 'prone', ' ': 'jump' };
const PHONE: Partial<Record<Button, Act>> = { jump: 'jump', act: 'use', skill: 'reload', swap: 'swap', heal: 'firstaid', throw: 'frag', crouch: 'crouch', plate: 'plate', inv: 'inventory', nvg: 'nvg' };

export class Input {
  private acts = new Set<Act>();
  private off: (() => void)[] = [];
  private lastShift = -9;
  /** Set by a quick double tap of Shift. */
  tacTap = false;
  /** Holding E without moving past this long leans; a quick tap is "use" (and calls the helicopter). */
  private eDown = -1;
  leanHeld = { q: false, e: false };
  aimToggle = false;
  private phone = matchMedia('(pointer: coarse)').matches;
  constructor(public c: Controls, private el: HTMLElement) {
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === 'tab') e.preventDefault();
      if (e.repeat) return;
      if (k === 'shift') { const t = performance.now() / 1000; if (t - this.lastShift < 0.3) this.tacTap = true; this.lastShift = t; }
      if (k === 'q') this.leanHeld.q = true;
      if (k === 'e') { this.leanHeld.e = true; this.eDown = performance.now(); }
      const a = KEYMAP[k];
      if (a) this.acts.add(a);
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'q') this.leanHeld.q = false;
      if (k === 'e') { this.leanHeld.e = false; if (this.eDown > 0 && performance.now() - this.eDown < 220) this.acts.add('extract'); this.eDown = -1; }
    };
    const md = (e: MouseEvent) => { if (e.button === 2) c.press('aim'); };
    const mu = (e: MouseEvent) => { if (e.button === 2) c.release('aim'); };
    const menu = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); el.addEventListener('mousedown', md); window.addEventListener('mouseup', mu); el.addEventListener('contextmenu', menu);
    this.off.push(() => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); el.removeEventListener('mousedown', md); window.removeEventListener('mouseup', mu); el.removeEventListener('contextmenu', menu); });
  }
  /** Was this action asked for since last time (keys or phone buttons)? */
  take(a: Act) {
    for (const [b, act] of Object.entries(PHONE) as [Button, Act][]) if (act === a && this.c.take(b)) this.acts.add(a);
    const had = this.acts.has(a); this.acts.delete(a); return had;
  }
  /** Leaning: −1 left (Q), 1 right (E held), 0 none. */
  get lean() { const eHeld = this.leanHeld.e && this.eDown > 0 && performance.now() - this.eDown > 150; return (eHeld ? 1 : 0) - (this.leanHeld.q ? 1 : 0); }
  get fire() { return this.c.held.has('fire'); }
  /** Aiming: held on a computer (right mouse); a toggle on a phone (the Aim button). */
  get aim() { if (this.phone && this.c.take('aim')) this.aimToggle = !this.aimToggle; return this.phone ? this.aimToggle : this.c.held.has('aim'); }
  get sprint() { return this.c.keys.has('shift') || (-this.c.stick.y > 0.92 && Math.abs(this.c.stick.x) < 0.4); }
  dispose() { this.off.forEach((f) => f()); }
}

export interface MoveEvents { landed: number; step: Surface | null; vaulted: boolean; slid: boolean; jumped: boolean }

export class Player {
  body = new Body([0, 0, 0], new THREE.Vector3(0.3, 0.9, 0.3));
  stance: Stance = 'stand';
  eye = 1.62;
  lean = 0;
  stamina = STAMINA.max;
  sprinting = false;
  tacUntil = 0;
  slideT = 0;
  private slideDir = new THREE.Vector3();
  private vault: { from: THREE.Vector3; to: THREE.Vector3; top: number; t: number; dur: number } | null = null;
  swimming = false;
  /** Seconds of breath held (steady scope), reset when let go. */
  holding = false;
  private stepAcc = 0; private stride = 1.8;
  /** Footsteps so far: the gun's bob is timed to it, so its low point lands on each step. */
  steps = 0;
  get gait() { return this.steps + Math.min(1, this.stepAcc / this.stride); }
  private fallV = 0;
  private near: THREE.Box3[] = [];
  private v = new THREE.Vector3(); private w = new THREE.Vector3();
  roll = 0;
  constructor(private grid: SolidGrid, private m: OpsMap) {}

  get head() { return this.w.set(this.body.pos.x, this.body.pos.y + this.eye, this.body.pos.z); }
  get speed() { return Math.hypot(this.body.vel.x, this.body.vel.z); }
  get vaulting() { return !!this.vault; }
  get tac() { return this.tacUntil > 0; }

  /** Where the water is here (the sea, or the lake inside its rim). */
  waterAt(x: number, z: number) { const l = this.m.lake; return Math.hypot(x - l.x, z - l.z) < l.r + 6 ? l.y : 0; }

  update(dt: number, t: number, input: Input, o: { ads: boolean; slow: number; noSprint: boolean; adrenaline: boolean; busy: boolean }): MoveEvents {
    const ev: MoveEvents = { landed: 0, step: null, vaulted: false, slid: false, jumped: false };
    const c = input.c, b = this.body;
    // Stance changes (C crouches, or slides when sprinting fast; Z goes prone).
    if (input.take('crouch')) {
      if (this.sprinting && this.speed > 5.5 && this.stance === 'stand' && this.stamina > STAMINA.slide) { this.slideT = 0.85; this.slideDir.set(b.vel.x, 0, b.vel.z).normalize(); this.stamina -= STAMINA.slide; this.stance = 'crouch'; ev.slid = true; }
      else this.setStance(this.stance === 'crouch' ? 'stand' : 'crouch');
    }
    if (input.take('prone')) this.setStance(this.stance === 'prone' ? 'stand' : 'prone');
    // Sprinting: forward with Shift (stands you up); a double tap is a tactical sprint while stamina lasts.
    const wish = c.wish(), forward = -(c.stick.y) + (c.keys.has('w') || c.keys.has('arrowup') ? 1 : 0);
    const canSprint = !o.ads && !o.noSprint && forward > 0.4 && this.stamina > 4 && !this.swimming && this.slideT <= 0;
    this.sprinting = canSprint && input.sprint;
    if (this.sprinting && this.stance !== 'stand') this.setStance('stand');
    if (input.tacTap) { input.tacTap = false; if (canSprint && this.stamina > 30) this.tacUntil = t + TAC_SPRINT_S; }
    if (!this.sprinting || t > this.tacUntil) this.tacUntil = 0;
    // Stamina: spent sprinting, back when not (adrenaline keeps it topped up).
    if (o.adrenaline) this.stamina = Math.min(STAMINA.max, this.stamina + STAMINA.regen * dt * 2);
    else if (this.tacUntil) this.stamina -= STAMINA.tac * dt;
    else if (this.sprinting) this.stamina -= STAMINA.sprint * dt;
    else if (this.holding) this.stamina -= STAMINA.hold * dt;
    else this.stamina = Math.min(STAMINA.max, this.stamina + STAMINA.regen * dt * (this.speed < 0.5 ? 1.4 : 1));
    if (this.stamina <= 0) { this.stamina = 0; this.tacUntil = 0; this.holding = false; }

    // Vaulting and mantling: an arc over or onto what's in front.
    if (this.vault) {
      const vt = this.vault;
      vt.t += dt / vt.dur;
      const k = Math.min(1, vt.t), e = k * k * (3 - 2 * k);
      b.pos.lerpVectors(vt.from, vt.to, e);
      b.pos.y = Math.max(b.pos.y, vt.top + 0.08 - (1 - Math.sin(k * Math.PI)) * 0.6) ;
      b.vel.set(0, 0, 0);
      this.roll = Math.sin(k * Math.PI) * 0.08;
      if (vt.t >= 1) { this.vault = null; b.pos.copy(vt.to); }
      this.eye += (0.95 - this.eye) * Math.min(1, dt * 14);
      return ev;
    }
    if (input.take('jump')) {
      if (b.ground && this.tryVault(c)) ev.vaulted = true;
      else if (b.ground && this.stance === 'stand' && this.stamina > STAMINA.vault) { b.vel.y = 6.2; this.stamina -= STAMINA.vault; ev.jumped = true; }
      else if (this.stance !== 'stand') this.setStance('stand');
    }

    // Speed for the stance and state.
    const ws = this.slideT > 0 ? 0 : this.swimming ? SPEED.swim : o.ads ? SPEED.ads : this.stance === 'prone' ? SPEED.prone : this.stance === 'crouch' ? SPEED.crouch : this.tacUntil ? SPEED.tac : this.sprinting ? SPEED.sprint : SPEED.walk;
    const top = ws * o.slow * (o.adrenaline ? 1.12 : 1);
    if (this.slideT > 0) {
      this.slideT -= dt;
      const k = Math.max(0, this.slideT / 0.85);
      b.vel.x = this.slideDir.x * SPEED.slide * (0.35 + 0.65 * k); b.vel.z = this.slideDir.z * SPEED.slide * (0.35 + 0.65 * k);
    } else {
      const grip = b.ground || this.swimming ? 12 : 2;
      b.vel.x += (wish.x * top - b.vel.x) * (1 - Math.exp(-grip * dt));
      b.vel.z += (wish.y * top - b.vel.z) * (1 - Math.exp(-grip * dt));
    }
    // Swimming: the head stays above the water, no gravity.
    const water = this.waterAt(b.pos.x, b.pos.z), g0 = this.grid.ground(b.pos.x, b.pos.z);
    this.swimming = g0 < water - 1.35;
    if (this.swimming) { if (this.stance !== 'stand') this.setStance('stand'); b.vel.y = 0; b.pos.y += ((water - 1.35) - b.pos.y) * Math.min(1, dt * 6); }
    const wasGround = b.ground, vy = b.vel.y;
    b.step(dt, this.grid.around(b.pos.x, b.pos.z, 2.5, this.near), this.swimming ? 0 : 20);
    const gy = this.grid.ground(b.pos.x, b.pos.z);
    if (b.pos.y <= gy + 0.02 && b.vel.y <= 0 && !this.swimming) { b.pos.y = gy; b.vel.y = 0; b.ground = true; }
    if (b.ground && !wasGround) { ev.landed = Math.max(0, -Math.min(vy, this.fallV)); }
    this.fallV = b.ground ? 0 : Math.min(this.fallV, b.vel.y);
    // The edge of the world: the sea pushes you back past the edge.
    const r = Math.hypot(b.pos.x, b.pos.z);
    if (r > 372) { b.pos.x *= 372 / r; b.pos.z *= 372 / r; }

    // Leaning round cover (not into a wall), and the eye height for the stance.
    let want = this.stance === 'prone' || this.sprinting ? 0 : input.lean;
    if (want) {
      const side = this.v.set(Math.cos(c.yaw), 0, -Math.sin(c.yaw)).multiplyScalar(Math.sign(want));
      const room = this.grid.cast(this.head, side, 0.6);
      if (room < 0.6) want *= Math.max(0, (room - 0.15) / 0.45);
    }
    this.lean += (want - this.lean) * Math.min(1, dt * 10);
    const eyeWant = this.slideT > 0 ? 0.92 : this.stance === 'prone' ? 0.38 : this.stance === 'crouch' ? 1.08 : 1.62;
    this.eye += (eyeWant - this.eye) * Math.min(1, dt * 12);
    this.roll += ((this.slideT > 0 ? 0.09 : 0) - this.lean * 0.2 - this.roll) * Math.min(1, dt * 10);

    // Footsteps by distance.
    if (b.ground || this.swimming) {
      this.stepAcc += this.speed * dt;
      const stride = this.sprinting ? 2.4 : this.stance === 'crouch' ? 1.1 : this.stance === 'prone' ? 1.4 : 1.8;
      if (this.stepAcc > stride && this.speed > 0.8) { this.stepAcc = 0; this.steps++; ev.step = this.surface(); }
      this.stride = stride;
    }
    return ev;
  }

  /** Standing up needs room overhead; prone and crouched bodies are shorter. */
  setStance(s: Stance) {
    if (s === this.stance) return;
    const half = s === 'prone' ? 0.28 : s === 'crouch' ? 0.6 : 0.9;
    if (half > this.body.half.y) {
      const test = this.body.box().clone(); test.max.y = this.body.pos.y + half * 2;
      if (this.grid.around(this.body.pos.x, this.body.pos.z, 1.5, this.near).some((bx) => bx.intersectsBox(test) && bx.min.y > this.body.pos.y + 0.3)) return;
    }
    this.body.half.y = half; this.stance = s;
  }

  /** Looks for a low wall, window or ledge just ahead; starts the arc and returns true if there is one. */
  private tryVault(c: Controls) {
    const b = this.body, fwd = this.v.set(-Math.sin(c.yaw), 0, -Math.cos(c.yaw)), feet = b.pos.y;
    let best: { box: THREE.Box3; enter: number; exit: number } | null = null;
    for (const box of this.grid.around(b.pos.x, b.pos.z, 2.5, this.near)) {
      const h = box.max.y - feet;
      if (h < 0.4 || h > 1.95 || box.min.y > feet + 0.6) continue;
      // Where the line ahead (at knee height) enters and leaves the box, within 1.2 m.
      let t0 = 0, t1 = 3;
      for (const ax of ['x', 'z'] as const) {
        const o = b.pos[ax], d = fwd[ax];
        if (Math.abs(d) < 1e-4) { if (o < box.min[ax] - 0.3 || o > box.max[ax] + 0.3) { t0 = 9; break; } continue; }
        let a = (box.min[ax] - 0.3 - o) / d, z = (box.max[ax] + 0.3 - o) / d;
        if (a > z) [a, z] = [z, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, z);
      }
      if (t0 > t1 || t0 > 1.2) continue;
      if (!best || t0 < best.enter) best = { box, enter: t0, exit: t1 };
    }
    if (!best) return false;
    const top = best.box.max.y, thin = best.exit - best.enter < 1.3 && top - feet < 1.3;
    const to = b.pos.clone().addScaledVector(fwd, thin ? best.exit + 0.35 : best.enter + 0.75);
    to.y = thin ? this.grid.ground(to.x, to.z) : top;
    if (thin) for (const box of this.near) if (box.containsPoint(this.w.set(to.x, to.y + 0.05, to.z))) to.y = Math.max(to.y, box.max.y);
    // Room to stand where it lands.
    const half = this.body.half;
    const room = new THREE.Box3(new THREE.Vector3(to.x - half.x, to.y + 0.05, to.z - half.z), new THREE.Vector3(to.x + half.x, to.y + 1.1, to.z + half.z));
    if (this.near.some((bx) => bx.intersectsBox(room))) return false;
    this.vault = { from: b.pos.clone(), to, top, t: 0, dur: thin ? 0.42 : 0.55 };
    this.stamina -= STAMINA.vault;
    return true;
  }

  /** What's underfoot, for the footstep sound. */
  surface(): Surface {
    const b = this.body;
    if (this.swimming || this.grid.ground(b.pos.x, b.pos.z) < this.waterAt(b.pos.x, b.pos.z) - 0.2) return 'water';
    const standing = this.grid.around(b.pos.x, b.pos.z, 1, this.near).find((bx) => Math.abs(bx.max.y - b.pos.y) < 0.05 && b.pos.x >= bx.min.x && b.pos.x <= bx.max.x && b.pos.z >= bx.min.z && b.pos.z <= bx.max.z);
    if (standing) return (this.grid.kind(standing) as Surface) ?? 'concrete';
    if (roadAt(this.m, b.pos.x, b.pos.z) < 4) return 'asphalt';
    const h = this.grid.ground(b.pos.x, b.pos.z);
    if (h < 2.6) return 'sand';
    return this.m.places.some((p) => Math.hypot(p.x - b.pos.x, p.z - b.pos.z) < p.r) ? 'gravel' : 'grass';
  }
}

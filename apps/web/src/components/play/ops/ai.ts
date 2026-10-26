import { ROLES, WEAPONS, applyHit, gunStats, makeGun, type FoeSpawn, type Gun, type GunStats, type Item, type Part, type Role, type RoleSpec } from '@/lib/play/ops';
import { Body, THREE } from '../world/core';
import type { SolidGrid } from './grid';
import { liteGun } from './guns';
import { LOOKS, Operator } from './operator';
import type { Bullets, Hit, Target, Throwables } from './weapons';

// The soldiers (the owner: "multi-class enemy squads: Riflemen (use cover and flank), Snipers (sit
// in watchtowers with visible red laser glints), Breachers (rush with shotguns), Medics, and Heavy
// Juggernauts… Enemies communicate with radio chatter, throw frag/flashbang grenades to flush the
// player out, and enter an 'Alerted' state calling in reinforcement trucks or helicopters if an
// unsuppressed shot is heard"). Each soldier notices you gradually (in view, close, lit, moving,
// standing; less at night, in a bush, crouched or prone, through smoke), hears shots by how loud
// they are, tells the soldiers near it, and then fights in its role's way: cover and peeking,
// flanking wide, rushing, healing the wounded, holding a tower and aiming with a laser. They fire
// real bullets (they can miss), reload, and throw grenades where they last saw you.

export type FoeState = 'idle' | 'alert' | 'combat' | 'search' | 'dead';
type Mode = 'hold' | 'cover' | 'flank' | 'rush' | 'heal' | 'advance';
const RADIO = {
  contact: ['Contact!', 'Enemy spotted!', 'Hostile, eyes on!', 'Contact front!'],
  heard: ['Shots fired!', 'Gunfire, nearby!', 'Did you hear that?'],
  lost: ['Lost visual.', 'Where did he go?', 'Search the area.'],
  reload: ['Reloading!', 'Changing mag!'],
  frag: ['Frag out!', 'Grenade!'],
  flash: ['Flashbang!', 'Bang out!'],
  flank: ['Flanking left!', 'Moving to flank!', 'Going round!'],
  down: ['Man down!', 'We lost one!', 'He got Petrov!'],
  medic: ['Medic, on me!', 'I need a medic!'],
  call: ['Requesting backup!', 'Send the quick reaction force!', 'Command, we need support!'],
};
export const say = (k: keyof typeof RADIO) => RADIO[k][Math.floor(Math.random() * RADIO[k].length)];

export interface PlayerView {
  feet: THREE.Vector3; head: THREE.Vector3; chest: THREE.Vector3;
  stance: 'stand' | 'crouch' | 'prone'; speed: number; inBush: boolean; inVehicle: boolean; alive: boolean;
  /** How easy you are to see right now (light, weather), 0–1. */
  light: number;
}
export interface FoeHooks {
  player(): PlayerView;
  radio(text: string, at: THREE.Vector3): void;
  /** A soldier fired (for the sound and the minimap). */
  shot(f: Foe, suppressed: boolean): void;
  /** A soldier wants backup for its place. */
  call(f: Foe): void;
  died(f: Foe, by: 'me' | number): void;
  water(x: number, z: number): number;
}

export class Foe implements Target {
  team = 'foe' as const;
  op: Operator;
  body: Body;
  spec: RoleSpec;
  hp: number; plates: number[]; helmet: 0 | 1 | 2 | 3;
  state: FoeState = 'idle';
  mode: Mode = 'hold';
  aware = 0;
  known = new THREE.Vector3(); knownAt = -99; sawAt = -99;
  goal: THREE.Vector3 | null = null; goalUntil = 0;
  gun: Gun; stats: GunStats; mag: number; burst = 0; nextShot = 0; reloadUntil = 0; aimUntil = 0; settle = 0;
  nades: number; nadeAt = 0; radioAt = 0; decideAt = 0; peekUntil = 0; healing: Foe | null = null; healUntil = 0;
  home: THREE.Vector3; active = false; deadAt = 0;
  loot: Item[]; searched = false;
  center = new THREE.Vector3(); radius = 1.4;
  crouch = false; yaw = 0; pitch = 0;
  laser: THREE.Line | null = null;
  private spheres: { c: THREE.Vector3; r: number; part: Part }[] = [];
  constructor(public spawn: FoeSpawn, scene: THREE.Scene) {
    this.spec = ROLES[spawn.role];
    this.hp = this.spec.hp;
    const n = Math.ceil(this.spec.plates / 75);
    this.plates = Array.from({ length: n }, () => this.spec.plates / n);
    this.helmet = this.spec.helmet;
    this.nades = this.spec.nades;
    // Its gun: the one in its loot (so you pick up what it fired).
    const carried = spawn.loot.find((it) => it.kind === 'gun') as Extract<Item, { kind: 'gun' }> | undefined;
    this.gun = carried ? { ...carried.gun } : makeGun(this.spec.gun[0], 0, Math.random);
    this.stats = gunStats(this.gun); this.mag = this.stats.mag;
    this.loot = spawn.loot;
    this.op = new Operator(LOOKS[spawn.role]);
    this.op.hold(liteGun(this.gun));
    this.op.root.position.set(spawn.x, spawn.y, spawn.z);
    this.op.root.visible = false;
    scene.add(this.op.root);
    this.body = new Body([spawn.x, spawn.y, spawn.z], new THREE.Vector3(0.3, 0.9, 0.3));
    this.home = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
    this.yaw = Math.random() * Math.PI * 2;
    if (spawn.role === 'sniper') {
      this.laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]), new THREE.LineBasicMaterial({ color: 0xff1a1a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.laser.frustumCulled = false; this.laser.visible = false; scene.add(this.laser);
    }
  }
  get id() { return this.spawn.id; }
  get pos() { return this.body.pos; }
  get dead() { return this.state === 'dead'; }
  /** Bullets test against its body parts. */
  trace(origin: THREE.Vector3, dir: THREE.Vector3, len: number): Hit | null {
    if (this.dead) return null;
    let best: Hit | null = null;
    const v = new THREE.Vector3();
    for (const s of this.op.hitSpheres(this.spheres)) {
      v.subVectors(s.c, origin);
      const along = v.dot(dir);
      if (along < 0 || along > len) continue;
      const d2 = v.lengthSq() - along * along;
      if (d2 > s.r * s.r) continue;
      const d = along - Math.sqrt(s.r * s.r - d2);
      if (!best || d < best.d) best = { d, part: s.part };
    }
    return best;
  }
  /** A hit: plates, helmet, health; it flinches and knows where you are. Returns what the hitmarker shows. */
  damage(dmg: number, part: Part, armourX: number, from: THREE.Vector3, t: number) {
    const r = applyHit({ hp: this.hp, plates: this.plates, helmet: this.helmet }, dmg, part, armourX);
    this.hp = r.hp; this.plates = r.plates;
    this.op.hit();
    this.aware = 1; this.known.copy(from); this.knownAt = t;
    if (this.state !== 'combat') this.state = 'combat';
    return r;
  }
}

export class Squads {
  foes: Foe[] = [];
  private v = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), q: new THREE.Vector3() };
  private near: THREE.Box3[] = [];
  private t = 0;
  /** Where the camera is: soldiers far from it are neither drawn nor posed (they still think and fight). */
  eye = new THREE.Vector3();
  constructor(private scene: THREE.Scene, private grid: SolidGrid, private bullets: Bullets, private nades: Throwables, private hooks: FoeHooks, private phone: boolean) {}

  add(spawn: FoeSpawn) { const f = new Foe(spawn, this.scene); this.foes.push(f); return f; }

  /** A shot or blast someone could hear: everyone within its reach turns toward it. */
  noise(at: THREE.Vector3, reach: number, loud = true) {
    for (const f of this.foes) {
      if (f.dead) continue;
      const d = f.pos.distanceTo(at);
      if (d > reach) continue;
      const k = 1 - d / reach;
      f.aware = Math.min(1, f.aware + 0.4 + k * 0.6);
      f.known.copy(at); f.knownAt = this.t;
      if (f.state === 'idle') { f.state = f.aware > 0.85 ? 'combat' : 'alert'; if (this.t > f.radioAt) { this.hooks.radio(say('heard'), f.pos); f.radioAt = this.t + 8; } }
      if (loud && (f.spec === ROLES.officer || Math.random() < 0.3)) this.hooks.call(f);
    }
  }

  /** Soldiers near one that knows pass it on. */
  private tell(f: Foe) {
    for (const o of this.foes) if (o !== f && !o.dead && o.pos.distanceTo(f.pos) < 45) {
      if (o.knownAt < f.knownAt) { o.known.copy(f.known); o.knownAt = f.knownAt; }
      o.aware = Math.max(o.aware, 0.75);
      if (o.state === 'idle' || o.state === 'alert') o.state = 'search';
    }
  }

  update(dt: number, t: number) {
    this.t = t;
    const P = this.hooks.player(), { a, b, c } = this.v;
    for (const f of this.foes) {
      const fp = f.pos;
      if (f.dead) {
        if (t - f.deadAt < 2) { f.op.pose(dt, { dead: true }); f.op.root.updateMatrixWorld(); }
        continue;
      }
      // Wake up near the player, sleep far away (snipers see further).
      const dist = fp.distanceTo(P.feet);
      if (((t * 4) | 0) % 8 === f.spawn.id % 8) { const want = dist < (f.spawn.role === 'sniper' ? 280 : 190) || f.state === 'combat'; if (want !== f.active) { f.active = want; f.op.root.visible = false; } }
      if (!f.active) continue;
      const far = this.phone ? 140 : 240;
      f.op.root.visible = fp.distanceToSquared(this.eye) < far * far;

      // Perception, about five times a second.
      if (((t * 5) | 0) % 5 === f.spawn.id % 5 && P.alive) {
        a.set(fp.x, fp.y + (f.crouch ? 1.05 : 1.6), fp.z);
        b.copy(P.stance === 'prone' ? P.chest : P.head);
        const toward = c.subVectors(b, a).setY(0).normalize(), facing = this.v.d.set(Math.sin(f.yaw), 0, Math.cos(f.yaw));
        const inView = dist < 6 || toward.dot(facing) > (f.state === 'idle' ? 0.35 : -0.2);
        const stanceK = P.stance === 'prone' ? 0.45 : P.stance === 'crouch' ? 0.72 : 1;
        const reach = f.spec.sight * stanceK * (P.inBush && P.stance !== 'stand' ? 0.35 : 1) * (LOOKS[f.spawn.role].nvg ? Math.max(P.light, 0.8) : P.light) + (P.speed > 6 ? 12 : 0);
        const sees = inView && dist < reach && !this.nades.hidden(a, b) && this.grid.clear(a, b, this.v.q);
        if (sees) {
          f.aware = Math.min(1, f.aware + 0.2 * (0.6 + 30 / Math.max(6, dist)) * (P.speed > 3 ? 1.4 : 1));
          if (f.aware >= 1) {
            if (f.state !== 'combat' && t > f.radioAt) { this.hooks.radio(say('contact'), fp); f.radioAt = t + 10; f.settle = t + 1.2; }
            f.state = 'combat'; f.known.copy(P.feet); f.knownAt = t; f.sawAt = t;
            this.tell(f);
          } else if (f.aware > 0.35 && f.state === 'idle') { f.state = 'alert'; f.known.copy(P.feet); f.knownAt = t; }
        } else {
          if (f.state === 'idle') f.aware = Math.max(0, f.aware - 0.02);
          if (f.state === 'combat' && t - f.sawAt > 9) { f.state = 'search'; if (t > f.radioAt) { this.hooks.radio(say('lost'), fp); f.radioAt = t + 12; } }
          if ((f.state === 'search' || f.state === 'alert') && t - f.knownAt > 40) { f.state = 'idle'; f.aware = 0.2; f.goal = null; }
        }
        f.op.root.userData.sees = sees;
      }
      const sees = !!f.op.root.userData.sees && P.alive;

      // Deciding what to do, every second or two.
      if (t > f.decideAt) { f.decideAt = t + 0.8 + Math.random() * 1.2; this.decide(f, P, dist, sees); }

      // Moving toward the goal, steering round what's in the way.
      let speed = 0;
      if (!f.spawn.perch && f.goal && f.healUntil < t) {
        a.subVectors(f.goal, fp).setY(0);
        const left = a.length();
        if (left > 0.6) {
          a.divideScalar(left);
          // Feel ahead at knee height; turn off a blocked line.
          b.set(fp.x, fp.y + 0.5, fp.z);
          for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 2]) {
            c.copy(a).applyAxisAngle(UP, turn);
            if (this.grid.cast(b, c, 1.3) >= 1.3) { a.copy(c); break; }
          }
          const run = f.mode === 'rush' || f.mode === 'flank' || (f.mode === 'cover' && sees) || f.state === 'search';
          speed = f.spec.speed * (run ? 1.35 : f.state === 'idle' ? 0.42 : 1) * (f.crouch ? 0.6 : 1);
          // No wading into deep water.
          if (this.grid.ground(fp.x + a.x * 1.5, fp.z + a.z * 1.5) < this.hooks.water(fp.x, fp.z) - 0.6) speed = 0;
        } else if (f.mode === 'cover') f.crouch = !(t < f.peekUntil);
      }
      f.body.vel.x += (a.x * speed - f.body.vel.x) * Math.min(1, dt * 7);
      f.body.vel.z += (a.z * speed - f.body.vel.z) * Math.min(1, dt * 7);
      if (!speed) { f.body.vel.x *= Math.exp(-10 * dt); f.body.vel.z *= Math.exp(-10 * dt); }
      if (!f.spawn.perch) {
        f.body.step(dt, this.grid.around(fp.x, fp.z, 2.5, this.near), 20);
        const g = this.grid.ground(fp.x, fp.z);
        if (fp.y <= g + 0.02 && f.body.vel.y <= 0) { fp.y = g; f.body.vel.y = 0; f.body.ground = true; }
      }
      // Facing: at you when fighting, where it's going otherwise; aiming up or down at you.
      const target = f.state === 'combat' && sees ? P.chest : f.state !== 'idle' ? f.known : f.goal;
      if (target) {
        const want = Math.atan2(target.x - fp.x, target.z - fp.z);
        f.yaw += Math.atan2(Math.sin(want - f.yaw), Math.cos(want - f.yaw)) * Math.min(1, dt * (f.state === 'combat' ? 7 : 3));
        f.pitch = Math.atan2(target.y - (fp.y + 1.5), Math.max(1, Math.hypot(target.x - fp.x, target.z - fp.z)));
      } else if (f.spawn.perch) f.yaw += dt * 0.25;
      f.op.root.position.copy(fp);
      f.op.root.rotation.y = f.yaw;
      // Medics kneel to heal.
      if (f.healing && f.healUntil > t) { f.crouch = true; if (f.healing.dead) f.healUntil = 0; }
      else if (f.healing) { if (!f.healing.dead) f.healing.hp = Math.min(f.healing.spec.hp, f.healing.hp + 60); f.healing = null; }
      if (f.op.root.visible) f.op.pose(dt, { speed: Math.hypot(f.body.vel.x, f.body.vel.z), stance: f.crouch ? 'crouch' : 'stand', aim: f.state === 'combat' || f.state === 'search' ? 1 : 0.15, pitch: f.pitch, run: speed > f.spec.speed * 1.1 });
      f.op.root.updateMatrixWorld();
      f.center.set(fp.x, fp.y + 1, fp.z);

      // Shooting: bursts while it can see you; a sniper's laser settles on you first.
      if (f.reloadUntil && t > f.reloadUntil) { f.reloadUntil = 0; f.mag = f.stats.mag; }
      if (f.laser) f.laser.visible = false;
      if (f.state === 'combat' && sees && !f.reloadUntil && f.healUntil < t && P.alive) {
        const sniper = f.spawn.role === 'sniper';
        if (sniper && !f.aimUntil) f.aimUntil = t + 1.6;
        if (sniper && f.laser) {
          const from = this.muzzle(f, a), pts = f.laser.geometry.attributes.position as THREE.BufferAttribute;
          pts.setXYZ(0, from.x, from.y, from.z); pts.setXYZ(1, P.head.x + Math.sin(t * 3) * 0.3 * (f.aimUntil - t), P.head.y - 0.3, P.head.z); pts.needsUpdate = true;
          f.laser.visible = true;
        }
        if ((!sniper || t >= f.aimUntil) && t >= f.nextShot && (f.mode !== 'cover' || !f.crouch)) {
          if (f.burst <= 0) f.burst = f.spec.burst[0] + Math.floor(Math.random() * (f.spec.burst[1] - f.spec.burst[0] + 1));
          this.fire(f, P, dist, t);
          f.burst--;
          f.nextShot = t + (f.burst > 0 ? 60 / f.stats.rpm + 0.02 : 0.55 + Math.random() * 0.9) + (f.stats.bolt ?? 0);
          if (sniper) f.aimUntil = t + 2.2;
          if (--f.mag <= 0) { f.reloadUntil = t + f.stats.reload * 1.2; f.burst = 0; if (t > f.radioAt - 6) this.hooks.radio(say('reload'), fp); }
        }
      } else if (!sees) f.aimUntil = 0;

      // Grenades where it last saw you, if you've been out of sight a while.
      if (f.state === 'combat' && !sees && f.nades > 0 && t > f.nadeAt && t - f.sawAt > 3 && t - f.knownAt < 12 && dist > 8 && dist < 36) {
        f.nadeAt = t + 14 + Math.random() * 10; f.nades--;
        const flash = f.spawn.role === 'breacher' && dist < 18;
        this.throwAt(f, f.known, flash ? 'flash' : 'frag');
        this.hooks.radio(say(flash ? 'flash' : 'frag'), fp);
      }
    }
  }

  /** A role's choice: where to go and how. */
  private decide(f: Foe, P: PlayerView, dist: number, sees: boolean) {
    const fp = f.pos, role = f.spawn.role, t = this.t;
    if (f.spawn.perch) { f.goal = null; return; }
    if (f.state === 'idle') {
      // Patrol near home: a stroll to a nearby spot, a pause.
      if (!f.goal || fp.distanceTo(f.goal) < 1 || t > f.goalUntil) { f.goal = new THREE.Vector3(f.home.x + (Math.random() - 0.5) * 18, 0, f.home.z + (Math.random() - 0.5) * 18); f.goalUntil = t + 8 + Math.random() * 8; }
      f.crouch = false; f.mode = 'hold';
      return;
    }
    if (f.state === 'alert' || f.state === 'search') { f.goal = f.known.clone(); f.mode = 'advance'; f.crouch = false; return; }
    // Medics see to the wounded first when they can.
    if (role === 'medic' && !f.healing) {
      const hurt = this.foes.find((o) => !o.dead && o !== f && o.hp < o.spec.hp * 0.5 && o.pos.distanceTo(fp) < 30);
      if (hurt && (!sees || dist > 25)) {
        f.goal = hurt.pos.clone(); f.mode = 'heal';
        if (fp.distanceTo(hurt.pos) < 1.6) { f.healing = hurt; f.healUntil = t + 3; this.hooks.radio(say('medic'), hurt.pos); }
        return;
      }
    }
    if (role === 'breacher') { f.mode = 'rush'; f.goal = P.feet.clone(); f.crouch = false; return; }
    if (role === 'juggernaut' || role === 'boss') { f.mode = 'advance'; f.goal = dist > 12 ? P.feet.clone() : null; f.crouch = false; return; }
    // Riflemen and officers: cover most of the time, sometimes a wide flank.
    if (f.mode === 'flank' && f.goal && fp.distanceTo(f.goal) > 2 && t < f.goalUntil) return;
    if (Math.random() < (role === 'rifleman' ? 0.3 : 0.15) && dist > 14 && dist < 70) {
      const side = Math.random() < 0.5 ? 1 : -1, off = new THREE.Vector3().subVectors(fp, P.feet).setY(0).applyAxisAngle(UP, side * 1.3).setLength(Math.min(40, Math.max(16, dist)));
      f.goal = P.feet.clone().add(off); f.goalUntil = t + 12; f.mode = 'flank'; f.crouch = false;
      if (t > f.radioAt) { this.hooks.radio(say('flank'), fp); f.radioAt = t + 10; }
      return;
    }
    const cover = this.coverFor(f, P);
    if (cover) { f.goal = cover; f.mode = 'cover'; if (sees) f.peekUntil = t + 1.4 + Math.random() * 1.4; else f.peekUntil = 0; }
    else { f.goal = dist > 30 ? P.feet.clone() : null; f.mode = 'hold'; f.crouch = Math.random() < 0.4; }
  }

  /** A spot behind something solid (as you see it) within 14 m, nearest first. */
  private coverFor(f: Foe, P: PlayerView) {
    const fp = f.pos, { a, b } = this.v;
    let best: THREE.Vector3 | null = null, bestD = 14;
    for (const box of this.grid.around(fp.x, fp.z, 14, this.near)) {
      const h = box.max.y - this.grid.ground((box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2);
      if (h < 0.9 || h > 8) continue;
      box.getCenter(a);
      b.subVectors(a, P.feet).setY(0).normalize();
      const ext = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
      const spot = a.clone().addScaledVector(b, Math.min(ext, 3) + 0.7);
      spot.y = this.grid.ground(spot.x, spot.z);
      const d = spot.distanceTo(fp);
      if (d > bestD) continue;
      if (this.grid.around(spot.x, spot.z, 1, []).some((x) => x.containsPoint(new THREE.Vector3(spot.x, spot.y + 0.5, spot.z)))) continue;
      // Covered when crouched behind it.
      if (this.grid.clear(new THREE.Vector3(spot.x, spot.y + 1, spot.z), P.head)) continue;
      best = spot; bestD = d;
    }
    return best;
  }

  private muzzle(f: Foe, out: THREE.Vector3) {
    const held = f.op.held;
    if (held) { held.updateMatrixWorld(); return out.set(0, 0, -0.5).applyMatrix4(held.matrixWorld); }
    return out.set(f.pos.x, f.pos.y + 1.45, f.pos.z);
  }
  /** One shot: aimed at your chest with an error that's bigger far away, when you move, and right after it spots you. */
  private fire(f: Foe, P: PlayerView, dist: number, t: number) {
    const from = this.muzzle(f, this.v.a), aim = this.v.b.copy(P.stance === 'prone' ? P.chest : Math.random() < 0.12 ? P.head : P.chest);
    const settling = Math.max(0, f.settle - t), err = (1 - f.spec.accuracy) * 0.045 + dist * 0.00025 + P.speed * 0.0022 + settling * 0.04 + (P.stance !== 'stand' ? 0.004 : 0);
    const dir = this.v.c.subVectors(aim, from).normalize();
    // Lead a moving target a little, and hold over for the drop at range.
    dir.y += (dist / f.stats.velocity) * (dist / f.stats.velocity) * 4.9 / Math.max(1, dist);
    dir.x += (Math.random() - 0.5) * 2 * err; dir.y += (Math.random() - 0.5) * 2 * err; dir.z += (Math.random() - 0.5) * 2 * err;
    dir.normalize();
    const pellets = f.stats.pellets;
    for (let i = 0; i < pellets; i++) {
      const d = pellets > 1 ? this.v.d.copy(dir).add(new THREE.Vector3((Math.random() - 0.5) * f.stats.hip, (Math.random() - 0.5) * f.stats.hip, (Math.random() - 0.5) * f.stats.hip)).normalize() : dir;
      this.bullets.fire(from, d, f.stats.velocity, f.stats, f.gun.att.ammo === 'ap' ? 1.6 : 1, f.spawn.id, Math.random() < 0.3);
    }
    this.hooks.shot(f, f.gun.att.muzzle === 'suppressor');
  }
  /** Throws a grenade on an arc to land near a point. */
  throwAt(f: Foe, at: THREE.Vector3, kind: 'frag' | 'flash') {
    const from = this.v.a.set(f.pos.x, f.pos.y + 1.7, f.pos.z), dx = at.x - from.x, dz = at.z - from.z, d = Math.hypot(dx, dz), tt = Math.max(0.6, d / 14);
    const vel = new THREE.Vector3(dx / tt, (at.y - from.y + 0.5 * 9.81 * tt * tt) / tt, dz / tt);
    this.nades.toss(kind, from, vel, f.spawn.id, kind === 'frag' ? tt + 0.6 : tt + 0.2);
  }
  /** Who's still standing at a place. */
  standing(place: number) { return this.foes.filter((f) => f.spawn.place === place && !f.dead).length; }
}
const UP = new THREE.Vector3(0, 1, 0);
export const roleName = (r: Role) => ROLES[r].name;
export const gunNameOf = (f: Foe) => WEAPONS[f.gun.base].name;

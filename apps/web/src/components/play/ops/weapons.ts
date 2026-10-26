import { damageAt, type GunStats, type Part } from '@/lib/play/ops';
import { THREE } from '../world/core';
import type { Fx } from './fx';
import type { SolidGrid } from './grid';

// Bullets and grenades (the owner: "physical projectile bullet drop + travel time over long
// distances… smoke trails… frag/flashbang grenades"). Every shot is a projectile: it flies at its
// gun's muzzle velocity, falls under gravity, and is tested each frame along the segment it covered
// against the world (walls, the ground) and everyone who can be hit (each person as a set of
// spheres: head, chest, hips, arms, legs). Damage falls off with distance; a bullet passing close to
// the player cracks and whizzes. Grenades arc, bounce and go off: frags hurt by distance (not
// through walls), flashbangs blind whoever's looking, smoke hides what's behind it.

export interface Hit { d: number; part: Part }
/** Anyone or anything a bullet can hit. */
export interface Target {
  id: number | 'me';
  team: 'me' | 'foe';
  /** A rough sphere round it, for a quick first test. */
  center: THREE.Vector3; radius: number;
  /** The nearest hit along the segment, or null. */
  trace(origin: THREE.Vector3, dir: THREE.Vector3, len: number): Hit | null;
}
interface Bullet { alive: boolean; pos: THREE.Vector3; vel: THREE.Vector3; owner: 'me' | number; team: 'me' | 'foe'; stats: Pick<GunStats, 'dmg' | 'range' | 'minDmg'>; armour: number; flown: number; tracer: boolean; whizzed: boolean; life: number; from: THREE.Vector3 }

export interface BulletHooks {
  targets(): Target[];
  hit(target: Target, part: Part, dmg: number, armour: number, at: THREE.Vector3, dir: THREE.Vector3, from: THREE.Vector3, owner: 'me' | number): void;
  /** A bullet passing near the player's head (`supersonic` cracks). */
  whiz(at: THREE.Vector3, supersonic: boolean): void;
  surface(at: THREE.Vector3): 'dirt' | 'stone' | 'metal' | 'wood';
  /** One of your bullets glancing off metal (its whine). */
  ricochet?(at: THREE.Vector3): void;
  playerHead(): THREE.Vector3;
}

const G = 9.81;
export class Bullets {
  private pool: Bullet[] = [];
  private v = { dir: new THREE.Vector3(), next: new THREE.Vector3(), at: new THREE.Vector3(), n: new THREE.Vector3(), tail: new THREE.Vector3(), c: new THREE.Vector3() };
  constructor(private grid: SolidGrid, private fx: Fx, private hooks: BulletHooks) {
    for (let i = 0; i < 220; i++) this.pool.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), owner: 'me', team: 'me', stats: { dmg: 0, range: 1, minDmg: 1 }, armour: 1, flown: 0, tracer: false, whizzed: false, life: 0, from: new THREE.Vector3() });
  }
  fire(from: THREE.Vector3, dir: THREE.Vector3, speed: number, stats: Pick<GunStats, 'dmg' | 'range' | 'minDmg'>, armour: number, owner: 'me' | number, tracer: boolean) {
    const b = this.pool.find((x) => !x.alive);
    if (!b) return;
    b.alive = true; b.pos.copy(from); b.from.copy(from); b.vel.copy(dir).multiplyScalar(speed); b.owner = owner; b.team = owner === 'me' ? 'me' : 'foe';
    b.stats = stats; b.armour = armour; b.flown = 0; b.tracer = tracer; b.whizzed = false; b.life = 2.2;
  }
  update(dt: number) {
    const { dir, next, at, n, tail, c } = this.v, targets = this.hooks.targets(), head = this.hooks.playerHead();
    for (const b of this.pool) {
      if (!b.alive) continue;
      b.life -= dt;
      b.vel.y -= G * dt;
      next.copy(b.pos).addScaledVector(b.vel, dt);
      dir.subVectors(next, b.pos);
      const len = dir.length();
      dir.divideScalar(len || 1);
      // The world first (walls, the ground), then anyone nearer than that.
      n.set(0, 0, 0);
      let best = this.grid.cast(b.pos, dir, len, n), hitT: Target | null = null, part: Part = 'body';
      for (const t of targets) {
        if (t.team === b.team) continue;
        // Quick sphere test against the segment.
        c.subVectors(t.center, b.pos);
        const along = c.dot(dir);
        if (along < -t.radius || along > best + t.radius) continue;
        if (c.lengthSq() - along * along > t.radius * t.radius) continue;
        const h = t.trace(b.pos, dir, best);
        if (h && h.d < best) { best = h.d; hitT = t; part = h.part; }
      }
      // Near-misses past the player's head.
      if (b.team === 'foe' && !b.whizzed) {
        c.subVectors(head, b.pos);
        const along = Math.max(0, Math.min(len, c.dot(dir)));
        const miss = c.addScaledVector(dir, -along).length();
        if (miss < 2.2 && miss > 0.35) { b.whizzed = true; this.hooks.whiz(at.copy(b.pos).addScaledVector(dir, along), b.vel.length() > 343); }
      }
      if (b.tracer) this.fx.streak(tail.copy(b.pos).addScaledVector(dir, -Math.min(6, len * 0.6)), at.copy(b.pos).addScaledVector(dir, Math.min(best, len)), b.team === 'me' ? 0xffe0a0 : 0xff7040, 1);
      if (best < len) {
        at.copy(b.pos).addScaledVector(dir, best);
        const dmg = damageAt(b.stats, b.flown + best);
        if (hitT) this.hooks.hit(hitT, part, dmg, b.armour, at, dir, b.from, b.owner);
        else { const kind = this.hooks.surface(at); this.fx.impact(at, n.lengthSq() ? n : n.set(0, 1, 0), kind); if (kind === 'metal' && b.owner === 'me') this.hooks.ricochet?.(at); }
        b.alive = false;
        continue;
      }
      b.flown += len;
      b.pos.copy(next);
      if (b.life <= 0 || b.pos.y < -20) b.alive = false;
    }
  }
}

/** Grenades in the air and smoke clouds hanging about. */
export type NadeKind = 'frag' | 'flash' | 'smoke';
interface Nade { kind: NadeKind; mesh: THREE.Mesh; vel: THREE.Vector3; fuse: number; owner: 'me' | number; bounced: number }
export interface NadeHooks {
  boom(at: THREE.Vector3, owner: 'me' | number): void;
  flash(at: THREE.Vector3, owner: 'me' | number): void;
  bounce(at: THREE.Vector3): void;
}
export class Throwables {
  private list: Nade[] = [];
  /** Smoke: where it hangs and until when (it blocks sight lines). */
  clouds: { at: THREE.Vector3; r: number; until: number }[] = [];
  private geo = new THREE.SphereGeometry(0.06, 10, 8);
  private mats: Record<NadeKind, THREE.Material> = {
    frag: new THREE.MeshStandardMaterial({ color: 0x3f4a2a, roughness: 0.6, metalness: 0.3 }),
    flash: new THREE.MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.5, metalness: 0.6 }),
    smoke: new THREE.MeshStandardMaterial({ color: 0x6b6b5a, roughness: 0.7 }),
  };
  private near: THREE.Box3[] = [];
  private t = 0;
  constructor(private scene: THREE.Scene, private grid: SolidGrid, private fx: Fx, private hooks: NadeHooks) {}
  toss(kind: NadeKind, from: THREE.Vector3, vel: THREE.Vector3, owner: 'me' | number, fuse = kind === 'frag' ? 2.6 : 1.6) {
    const mesh = new THREE.Mesh(this.geo, this.mats[kind]);
    mesh.position.copy(from); mesh.castShadow = true;
    this.scene.add(mesh);
    this.list.push({ kind, mesh, vel: vel.clone(), fuse, owner, bounced: 0 });
  }
  /** Whether smoke hangs between two points. */
  hidden(a: THREE.Vector3, b: THREE.Vector3) {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length(); d.divideScalar(len || 1);
    return this.clouds.some((c) => { if (c.until < this.t) return false; const v = new THREE.Vector3().subVectors(c.at, a), al = Math.max(0, Math.min(len, v.dot(d))); return v.addScaledVector(d, -al).length() < c.r; });
  }
  update(dt: number, t: number) {
    this.t = t;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i], p = n.mesh.position;
      n.vel.y -= 9.81 * dt;
      p.addScaledVector(n.vel, dt);
      n.mesh.rotation.x += dt * 9; n.mesh.rotation.z += dt * 6;
      const g = this.grid.ground(p.x, p.z);
      if (p.y < g + 0.06) { p.y = g + 0.06; if (n.vel.y < -1.5) this.hooks.bounce(p); n.vel.y = Math.abs(n.vel.y) * 0.32; n.vel.x *= 0.55; n.vel.z *= 0.55; n.bounced++; }
      for (const b of this.grid.around(p.x, p.z, 1.5, this.near)) if (b.containsPoint(p)) {
        // Bounce off the face it came through.
        const back = p.clone().addScaledVector(n.vel, -dt);
        if (back.x < b.min.x || back.x > b.max.x) n.vel.x *= -0.4; else if (back.z < b.min.z || back.z > b.max.z) n.vel.z *= -0.4; else { n.vel.y = Math.abs(n.vel.y) * 0.3; p.y = b.max.y + 0.06; }
        p.copy(back); this.hooks.bounce(p); break;
      }
      n.fuse -= dt;
      if (n.kind === 'smoke' && n.fuse < 0) { this.clouds.push({ at: p.clone().setY(p.y + 1.2), r: 4.5, until: t + 16 }); this.scene.remove(n.mesh); this.list.splice(i, 1); continue; }
      if (n.fuse <= 0) {
        if (n.kind === 'frag') { this.fx.boom(p.clone().setY(p.y + 0.2)); this.hooks.boom(p.clone(), n.owner); }
        else this.hooks.flash(p.clone(), n.owner);
        this.scene.remove(n.mesh); this.list.splice(i, 1);
      }
    }
    // Smoke clouds keep billowing until they thin out.
    for (const c of this.clouds) if (c.until > t && Math.random() < dt * 22) this.fx.smoke(new THREE.Vector3(c.at.x + (Math.random() - 0.5) * c.r * 1.4, c.at.y - 1 + Math.random() * 1.5, c.at.z + (Math.random() - 0.5) * c.r * 1.4), 0.62, 2.4, 3.5);
    this.clouds = this.clouds.filter((c) => c.until > t);
  }
}

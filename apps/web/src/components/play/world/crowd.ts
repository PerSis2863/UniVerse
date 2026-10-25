import type { Net } from '../useGameRoom';
import { Avatar, THREE, type World } from './core';

// The other players in a 3D room (M38): each one's position comes from the room about ten times a
// second (useGameRoom's Net); here each becomes a blocky character with a name tag that glides
// between those updates (so it moves smoothly, not in hops), walks or jumps by how it moves, and
// fades out when its player leaves. Only players in the same part of the world (the same obby
// world, school floor or station) are shown. This player's own position goes up the same way.

interface Other { av: Avatar; tag: THREE.Sprite; at: THREE.Vector3; prev: THREE.Vector3; vel: THREE.Vector3; ry: number; c: number; h: string; seen: number }

function nameTag(name: string, color: number) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  const text = name.slice(0, 16);
  g.font = '700 30px system-ui, sans-serif';
  const w = Math.min(248, g.measureText(text).width + 36);
  g.fillStyle = 'rgba(10,10,12,0.72)';
  g.beginPath(); g.roundRect(128 - w / 2, 8, w, 48, 24); g.fill();
  g.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  g.beginPath(); g.arc(128 - w / 2 + 20, 32, 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128 + 8, 33);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.set(2.6, 0.65, 1);
  return s;
}

export class Crowd {
  private others = new Map<string, Other>();
  private target = new THREE.Vector3();
  constructor(private w: World, private net?: Net) {}

  /** Each frame: send where I am, move everyone else toward where they were last seen. */
  update(dt: number, me: { pos: THREE.Vector3; ry: number; air: boolean; part: number; color: number; hat: string }) {
    const net = this.net;
    if (!net) return;
    net.sendPos({ x: me.pos.x, y: me.pos.y, z: me.pos.z, ry: me.ry, a: me.air ? 1 : 0, w: me.part, c: me.color, h: me.hat });
    const now = performance.now(), peers = net.peers.current;
    for (const [id, p] of peers) {
      let o = this.others.get(id);
      const gone = now - p.at > 3000;
      if (gone || p.w !== me.part) { if (o) this.drop(id); if (gone) peers.delete(id); continue; }
      this.target.set(p.x, p.y, p.z);
      if (!o || o.c !== p.c || o.h !== p.h) {
        if (o) this.drop(id);
        const av = new Avatar(p.c, { hat: p.h });
        const tag = nameTag(p.name, p.c);
        tag.position.y = 2.75; av.group.add(tag);
        av.group.position.copy(this.target);
        this.w.scene.add(av.group);
        o = { av, tag, at: this.target.clone(), prev: this.target.clone(), vel: new THREE.Vector3(), ry: p.ry, c: p.c, h: p.h, seen: now };
        this.others.set(id, o);
      }
      o.seen = now;
      // Glide toward the last known spot (about 100 ms behind, which hides the gaps between updates).
      o.prev.copy(o.av.group.position);
      o.av.group.position.lerp(this.target, 1 - Math.exp(-12 * dt));
      o.vel.subVectors(o.av.group.position, o.prev).divideScalar(Math.max(dt, 1e-3));
      o.av.facing = p.ry;
      const d = Math.atan2(Math.sin(p.ry - o.ry), Math.cos(p.ry - o.ry));
      o.ry += d * (1 - Math.exp(-14 * dt));
      o.av.facing = o.ry;
      o.av.update(dt, o.vel, p.a < 0.5);
    }
    for (const id of this.others.keys()) if (!peers.has(id)) this.drop(id);
  }

  /** How many others are in sight (for the HUD). */
  get count() { return this.others.size; }

  private drop(id: string) {
    const o = this.others.get(id);
    if (!o) return;
    this.w.scene.remove(o.av.group);
    (o.tag.material as THREE.SpriteMaterial).map?.dispose();
    this.others.delete(id);
  }
}

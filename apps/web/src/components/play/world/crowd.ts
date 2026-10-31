import type { Net } from '../useGameRoom';
import { Avatar, THREE, type World } from './core';

/** What a figure for another player needs. */
export interface Figure { group: THREE.Object3D; facing: number | null; update(dt: number, vel: THREE.Vector3, ground: boolean): void }

// The other players in a 3D room (M38): each one's position comes from the room about ten times a
// second (useGameRoom's Net); here each becomes a blocky character with a name tag that glides
// between those updates (so it moves smoothly, not in hops), walks or jumps by how it moves, and
// fades out when its player leaves. Only players in the same part of the world (the same obby
// world, school floor or station) are shown. This player's own position goes up the same way.

interface Other { av: Figure; tag: THREE.Sprite; bubble: THREE.Sprite | null; bubbleText: string; ring: THREE.Mesh; at: THREE.Vector3; prev: THREE.Vector3; vel: THREE.Vector3; ry: number; c: number; h: string; seen: number }

/** What a player said, as a white speech bubble (M39). */
function bubbleOf(text: string) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.font = '600 34px system-ui, sans-serif';
  const shown = text.length > 34 ? `${text.slice(0, 33)}…` : text;
  const w = Math.min(500, g.measureText(shown).width + 48);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath(); g.roundRect(256 - w / 2, 10, w, 80, 28); g.fill();
  g.beginPath(); g.moveTo(240, 88); g.lineTo(256, 116); g.lineTo(272, 88); g.fill();
  g.fillStyle = '#111827'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(shown, 256, 51);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.set(4, 1, 1);
  return s;
}

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
  private fwd = new THREE.Vector3();
  private talk = new Set<string>();
  private talkAt = 0;
  /** `net` is read fresh each frame (the room's chat and voice change while the round runs). */
  constructor(private w: Pick<World, 'scene' | 'camera'>, private getNet: () => Net | undefined, private make: (color: number, hat: string) => Figure = (c, h) => new Avatar(c, { hat: h })) {}
  private get net() { return this.getNet(); }

  /** Each frame: send where I am, move everyone else toward where they were last seen. */
  update(dt: number, me: { pos: THREE.Vector3; ry: number; air: boolean; part: number; color: number; hat: string }) {
    const net = this.net;
    if (!net) return;
    net.sendPos({ x: me.pos.x, y: me.pos.y, z: me.pos.z, ry: me.ry, a: me.air ? 1 : 0, w: me.part, c: me.color, h: me.hat });
    const now = performance.now(), peers = net.peers.current;
    const live = net.voice.live.current, talking = live && now - this.talkAt > 100 ? (this.talkAt = now, this.talk = live.talking().ids) : this.talk;
    for (const [id, p] of peers) {
      let o = this.others.get(id);
      const gone = now - p.at > 3000;
      if (gone || p.w !== me.part) { if (o) this.drop(id); if (gone) peers.delete(id); continue; }
      this.target.set(p.x, p.y, p.z);
      if (!o || o.c !== p.c || o.h !== p.h) {
        if (o) this.drop(id);
        const av = this.make(p.c, p.h);
        const tag = nameTag(p.name, p.c);
        tag.position.y = 2.75; av.group.add(tag);
        // A green ring at their feet while they talk.
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32), new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; av.group.add(ring);
        av.group.position.copy(this.target);
        this.w.scene.add(av.group);
        o = { av, tag, bubble: null, bubbleText: '', ring, at: this.target.clone(), prev: this.target.clone(), vel: new THREE.Vector3(), ry: p.ry, c: p.c, h: p.h, seen: now };
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
      // What they said last, for five seconds, over their head.
      const line = net.said.current.get(id), showLine = line && now - line.at < 5000 ? line.text : '';
      if (showLine !== o.bubbleText) {
        if (o.bubble) { o.av.group.remove(o.bubble); (o.bubble.material as THREE.SpriteMaterial).map?.dispose(); o.bubble = null; }
        if (showLine) { o.bubble = bubbleOf(showLine); o.bubble.position.y = 3.55; o.av.group.add(o.bubble); }
        o.bubbleText = showLine;
      }
      const ringMat = o.ring.material as THREE.MeshBasicMaterial;
      ringMat.opacity += ((talking.has(id) ? 0.9 : 0) - ringMat.opacity) * Math.min(1, dt * 12);
    }
    for (const id of this.others.keys()) if (!peers.has(id)) this.drop(id);
    // Voices come from where each player stands, heard from the camera.
    if (live) {
      const cam = this.w.camera;
      cam.getWorldDirection(this.fwd);
      live.place({ x: cam.position.x, y: cam.position.y, z: cam.position.z, fx: this.fwd.x, fy: this.fwd.y, fz: this.fwd.z }, (id) => this.others.get(id)?.av.group.position ?? null);
    }
  }

  /** How many others are in sight (for the HUD). */
  get count() { return this.others.size; }

  private drop(id: string) {
    const o = this.others.get(id);
    if (!o) return;
    this.w.scene.remove(o.av.group);
    (o.tag.material as THREE.SpriteMaterial).map?.dispose();
    if (o.bubble) (o.bubble.material as THREE.SpriteMaterial).map?.dispose();
    this.others.delete(id);
  }
}

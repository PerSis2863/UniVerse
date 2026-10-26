import {
  ADRENALINE_HP, ADRENALINE_S, AMMO, BLEED_HP_S, BUY, CONTAINERS, CONTRACTS, EXTRACT_MIN_S, EXTRACT_WAIT_S, FIRST_AID_HP, HELMETS, MEDS, PACKS, PLATES, PLATE_S, ROUND_S, SCORE, VESTS,
  WEAPONS, ammoIn, applyHit, bagAdd, bagCount, bagTake, bankAll, bleeds, carryLimit, fractures, freshValue, gunStats, itemName, itemRarity, itemValue, loadoutWeight, nextMode, opsMap, recoilFor,
  type BuyId, type Container, type FoeSpawn, type Gun, type GunStats, type Item, type Loadout, type OpsMap, type Part, type Place,
} from '@/lib/play/ops';
import { Controls, THREE } from '../world/core';
import { Crowd, type Figure } from '../world/crowd';
import type { Net } from '../useGameRoom';
import type { GameStat } from '../game-props';
import { Foe, Squads, say, type PlayerView } from './ai';
import { OpsAudio } from './audio';
import { Chute, Heli, Plane, barrage, flyAlong, type Flight } from './events';
import { Foliage } from './foliage';
import { Fx } from './fx';
import { SolidGrid } from './grid';
import { liteGun } from './guns';
import { LOOKS, Operator } from './operator';
import { Input, Player } from './player';
import { OpsRenderer } from './render';
import { Sky } from './sky';
import { loadSafehouse, saveSafehouse, kitFor, type Safehouse } from './stash';
import { ContainerMesh, buildPlaces, kiosk } from './structures';
import { U, Water, roads, terrain } from './terrain';
import type { Callbacks, HudRefs, HudState, Menu, Phase, SupportKind } from './types';
import { Vehicle } from './vehicles';
import { Viewmodel } from './viewmodel';
import { Bullets, Throwables, type Hit, type Target } from './weapons';
import { drawCompass, drawMaps } from './hud-draw';

// Ridgeline Ops, the game itself: builds the island and everything on it, and runs a round. A round
// is the safehouse (menus), then raids: a helicopter insertion to a landing zone, the raid, and
// either an extraction (the helicopter, after holding the zone for 60 s) back to the safehouse with
// what you carry banked, or going down (your gear stays where you fell, the secure container comes
// home). The React side (RidgelineOps.tsx) draws the HUD and menus from what this reports.

interface Ground { item: Item; g: THREE.Group; at: THREE.Vector3 }
interface Box { data: Container; mesh: ContainerMesh; items: Item[]; searched: boolean }
interface Hostage { place: Place; op: Operator; pos: THREE.Vector3; vel: THREE.Vector3; state: 'held' | 'follow' | 'wait' | 'saved'; yaw: number }
interface Truck { v: Vehicle; path: [number, number][]; i: number; squad: FoeSpawn[]; place: number; dropped: boolean }
interface EnemyHeli { h: Heli; flight: Flight; hover: THREE.Vector3; squad: FoeSpawn[]; state: 'in' | 'drop' | 'out'; t: number }
const UP = new THREE.Vector3(0, 1, 0);

class FriendFigure implements Figure {
  op = new Operator(LOOKS.friend);
  group = this.op.root;
  facing: number | null = null;
  constructor() { this.op.hold(liteGun({ base: 'mcr4', rarity: 0, att: {}, mag: 30, mode: 'auto' })); }
  update(dt: number, vel: THREE.Vector3) { if (this.facing !== null) this.group.rotation.y = this.facing; this.op.pose(dt, { speed: Math.hypot(vel.x, vel.z), aim: 0.6 }); }
}

export class OpsGame {
  r: OpsRenderer; m: OpsMap; grid: SolidGrid; sky: Sky; water: Water; foliage: Foliage; fx: Fx;
  vm: Viewmodel; input: Input; c: Controls; player: Player; bullets: Bullets; nades: Throwables; squads: Squads; audio = new OpsAudio();
  private kiosks: THREE.Object3D[] = []; private cullAt = -1;
  vehicles: Vehicle[] = []; boxes: Box[] = []; ground: Ground[] = []; hostages: Hostage[] = [];
  flags: Map<number, THREE.MeshStandardMaterial>; bulbs: THREE.MeshStandardMaterial; lamps: { x: number; y: number; z: number }[]; smokes: { x: number; y: number; z: number; big: boolean }[];
  lampLights: THREE.PointLight[] = []; muzzleLight = new THREE.PointLight(0xffaa33, 0, 8); flareLight = new THREE.PointLight(0xff3020, 0, 60);
  headlights: THREE.SpotLight;
  heli = new Heli(); enemyHelis: EnemyHeli[] = []; plane = new Plane(); trucks: Truck[] = [];
  safe: Safehouse; loadout: Loadout;
  phase: Phase = 'safehouse'; phaseAt = 0;
  // Player state.
  hp = 100; bleeding = false; fracture = false; adrenalineUntil = 0; nvg = false; selfRevive = false;
  slot = 0; cool = 0; burstLeft = 0; shotN = 0; lastShot = -9; boltUntil = 0; reloadUntil = 0; reloadEmpty = false; actionUntil = 0; action: null | (() => void) = null; actionName = '';
  vehicle: Vehicle | null = null; aiming = false;
  banked = 0; combat = 0; kills = 0; heads = 0; shots = 0; hits = 0; extracts = 0; saved = 0; cleared = 0; searched = 0; bestFind: { name: string; rarity: number } | null = null;
  raidStart = 0; raidKills = 0; raidHeads = 0; raidCleared = 0;
  extract: { state: 'none' | 'called' | 'landing' | 'boarding'; at: THREE.Vector3; t0: number; waves: number; flight: Flight | null; lines: number; personal: boolean } = { state: 'none', at: new THREE.Vector3(), t0: 0, waves: 0, flight: null, lines: 0, personal: false };
  insertFlight: Flight | null = null; exfilAt = 0;
  uavUntil = 0; mortars: { t: number; at: THREE.Vector3; whistled: boolean }[] = []; mortarPending = false;
  clearedPlaces = new Set<number>(); calls = new Map<number, number>(); reserveNext = 0; samHold = new Map<number, number>(); samTaken = new Set<number>();
  drops: { i: number; state: 'wait' | 'plane' | 'fall' | 'down'; chute: Chute | null; box: Box | null; y: number }[] = [];
  convoyOn = false; menuOpen: Menu['kind'] | null = null; lootTarget: Box | Foe | null = null;
  private t = 0; private last = 0; private raf = 0; private hudAt = 0; private mapAt = 0; private lastHud = ''; private lastScore = -1;
  private v = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), q: new THREE.Quaternion(), e: new THREE.Euler(0, 0, 0, 'YXZ') };
  private look = new THREE.Vector3(); private right = new THREE.Vector3(); private camPos = new THREE.Vector3();
  private lookDX = 0; private lookDY = 0; private lastYaw = 0; private lastPitch = 0;
  private recoverPitch = 0; private recoverYaw = 0; private heat = 0; private muzzleUntil = 0;
  /** A grenade on its way out of the hand (thrown at the animation's release). */
  private pendingNade: 'frag' | 'flash' | 'smoke' | null = null;
  /** Looking through the binoculars to mark an airstrike. */
  supportAim = false;
  /** Kills in a row (since going down) and the killstreak rewards waiting to be used. */
  streak = 0; supportHave: SupportKind[] = [];
  private crowd: Crowd;
  private range: { group: THREE.Group; targets: { at: THREE.Vector3; mesh: THREE.Mesh; dist: number }[] } | null = null;
  private shake = 0; private flashUntil = 0; private desatAt = -9; private detect = 0;
  private hurtAt = -9; private feedRadioAt = 0;
  private vis = () => { if (document.hidden) this.pause(); else this.resume(); };

  constructor(public canvas: HTMLCanvasElement, public seed: number, private clock: () => number, private endsAt: number, private cb: Callbacks, private refs: () => HudRefs, private net: () => Net | undefined) {
    this.m = opsMap(seed);
    this.r = new OpsRenderer(canvas);
    const S = this.r.scene;
    this.grid = new SolidGrid(this.m);
    this.sky = new Sky(this.r);
    this.sky.onBolt = (d) => this.audio.thunder(d);
    const ter = terrain(this.r, this.m); S.add(ter);
    S.add(roads(this.m));
    this.water = new Water(this.m); S.add(this.water.group);
    this.foliage = new Foliage(this.r, this.m, this.grid); S.add(this.foliage.group);
    const built = buildPlaces(this.r, this.m, this.grid); S.add(built.group);
    this.flags = built.flags; this.bulbs = built.bulbMat; this.lamps = built.lamps; this.smokes = built.smokes;
    for (const k of this.m.kiosks) { const g = kiosk(k.x, k.y, k.z, k.turn); S.add(g); this.kiosks.push(g); this.grid.add(new THREE.Box3(new THREE.Vector3(k.x - 0.55, k.y, k.z - 0.4), new THREE.Vector3(k.x + 0.55, k.y + 2.1, k.z + 0.4)), 'metal'); }
    for (const c of this.m.containers) { const mesh = new ContainerMesh(c.kind, c.x, c.y, c.z, c.turn); S.add(mesh.group); this.boxes.push({ data: c, mesh, items: structuredClone(c.items), searched: false }); }
    this.fx = new Fx(this.r.phone, this.grid); S.add(this.fx.group);
    // A few lamps cast real light at night (the nearest to you); the rest just glow.
    for (let i = 0; i < (this.r.phone ? 2 : 5); i++) { const l = new THREE.PointLight(0xffd9a0, 0, 26, 1.6); S.add(l); this.lampLights.push(l); }
    S.add(this.muzzleLight, this.flareLight);
    this.headlights = new THREE.SpotLight(0xfff2d8, 0, 70, 0.55, 0.5, 1.2); S.add(this.headlights, this.headlights.target);
    // Hostages, hands up where they're held.
    for (const p of this.m.places) if (p.hostage && p.held) {
      const op = new Operator(LOOKS.hostage); op.root.position.set(p.held.x, this.grid.ground(p.held.x, p.held.z), p.held.z); S.add(op.root);
      this.hostages.push({ place: p, op, pos: op.root.position, vel: new THREE.Vector3(), state: 'held', yaw: 0 });
    }
    for (const v of this.m.vehicles) { const veh = new Vehicle(v.id, v.kind, v.x, v.z, v.turn, this.grid); S.add(veh.group); this.vehicles.push(veh); }
    this.heli.group.visible = false; S.add(this.heli.group);
    this.plane.group.visible = false; S.add(this.plane.group);
    this.drops = this.m.drops.map((_, i) => ({ i, state: 'wait', chute: null, box: null, y: 0 }));

    // Player, view, controls.
    this.c = new Controls(canvas, { pitch: [-1.45, 1.45], sensitivity: 0.0021 });
    this.input = new Input(this.c, canvas);
    this.player = new Player(this.grid, this.m);
    this.vm = new Viewmodel(this.r.vm.scene, this.r.quality === 'low' ? null : this.r.scope.target.texture);
    // The animations' moments: handling sounds, the grenade leaving the hand, a magazine dropped into the world.
    this.vm.onCue = (cue) => {
      if (cue === 'throw') { this.releaseNade(); return; }
      if (cue === 'pump') { this.audio.reload('pump'); return; }
      this.audio.foley(cue === 'magDrop' ? 'magOut' : cue);
    };
    this.vm.onMagDrop = (mag, at, q) => {
      const cam = this.r.camera, p = at.applyMatrix4(cam.matrixWorld), wq = cam.quaternion.clone().multiply(q);
      this.fx.drop(mag, p, wq, this.v.a.copy(this.player.body.vel).multiplyScalar(0.8).addScaledVector(this.right, -0.3).add(this.v.b.set(0, -0.6, 0)));
    };
    this.fx.onBounce = (what, at) => { const d = at.distanceTo(this.r.camera.position); if (d < 25) this.audio.foley(what === 'shell' ? 'tink' : 'magLand', this.panOf(at), Math.max(0.2, 1 - d / 25)); };
    this.bullets = new Bullets(this.grid, this.fx, {
      targets: () => this.targets(),
      hit: (tg, part, dmg, armour, at, dir, from, owner) => this.onHit(tg, part, dmg, armour, at, dir, from, owner),
      whiz: (at, sup) => { this.audio.whiz(this.panOf(at), sup); this.desatAt = this.t; this.shake = Math.min(1, this.shake + 0.08); },
      ricochet: (at) => { if (Math.random() < 0.45) this.audio.foley('ricochet', this.panOf(at), 0.8); },
      surface: (at) => { const k = this.grid.around(at.x, at.z, 0.5, []).find((b) => b.distanceToPoint(at) < 0.05); return k ? ((this.grid.kind(k) === 'metal' ? 'metal' : this.grid.kind(k) === 'wood' ? 'wood' : 'stone')) : 'dirt'; },
      playerHead: () => this.player.head,
    });
    this.nades = new Throwables(S, this.grid, this.fx, {
      boom: (at, owner) => this.explode(at, 9, 190, owner),
      flash: (at) => this.flashbang(at),
      bounce: () => this.audio.step('metal', 0.3),
    });
    this.squads = new Squads(S, this.grid, this.bullets, this.nades, {
      player: () => this.view(),
      radio: (text, at) => this.radio(text, at),
      shot: (f, sup) => { const d = f.pos.distanceTo(this.player.body.pos); this.audio.gun(d, this.panOf(f.pos), { heavy: WEAPONS[f.gun.base].cls === 'marksman' ? 1.4 : WEAPONS[f.gun.base].cls === 'lmg' ? 1.1 : 0.9, suppressed: sup }); f.op.root.userData.firedAt = this.t; },
      call: (f) => this.callBackup(f),
      died: () => {},
      water: (x, z) => this.player.waterAt(x, z),
    }, this.r.phone);
    for (const f of this.m.foes) this.squads.add(f);
    this.crowd = new Crowd({ scene: S, camera: this.r.camera }, net, () => new FriendFigure());
    for (const root of [this.r.scene]) this.r.prep(root);

    this.safe = loadSafehouse();
    this.loadout = kitFor(this.safe);
    this.vm.setGun(this.currentGun() ?? this.loadout.sidearm!, true);
    this.toSafehouse(true);
    // For tests and tuning on this device only: the game on window.__ops when asked for.
    try { if (localStorage.getItem('uv-ops-debug') === '1') Object.assign(window, { __ops: this, __THREE: THREE }); } catch { /* private mode */ }
    document.addEventListener('visibilitychange', this.vis);
    this.resume();
  }

  /* ── The loop ── */
  private frame = (now: number) => {
    const raw = this.last ? (now - this.last) / 1000 : 1 / 60;
    this.last = now;
    const dt = Math.min(0.05, raw);
    this.r.tune(raw);
    this.t += dt;
    try { this.step(dt); } catch (e) { console.error('ops frame', e); }
    this.raf = requestAnimationFrame(this.frame);
  };
  /** Small things far off aren't drawn (each is a draw or three; a phone feels every one). */
  private cullProps() {
    this.cullAt = this.t;
    const eye = this.r.camera.position, far = this.r.phone ? 110 : 170, near2 = (o: THREE.Object3D, d: number) => o.position.distanceToSquared(eye) < d * d;
    for (const b of this.boxes) b.mesh.group.visible = near2(b.mesh.group, far);
    for (const k of this.kiosks) k.visible = near2(k, far * 1.4);
    for (const g of this.ground) g.g.visible = near2(g.g, far * 0.7);
  }
  pause() { cancelAnimationFrame(this.raf); this.raf = 0; this.last = 0; }
  resume() { if (!this.raf) this.raf = requestAnimationFrame(this.frame); }

  private step(dt: number) {
    const t = this.t, P = this.player, cam = this.r.camera;
    const progress = Math.min(1, Math.max(0, 1 - (this.endsAt - this.clock()) / (ROUND_S * 1000)));
    U.time.value = t;
    // Look deltas (for the gun's sway) and recoil recovery.
    this.lookDX = this.c.yaw - this.lastYaw; this.lookDY = this.c.pitch - this.lastPitch;
    this.lastYaw = this.c.yaw; this.lastPitch = this.c.pitch;
    this.look.set(-Math.sin(this.c.yaw) * Math.cos(this.c.pitch), Math.sin(this.c.pitch), -Math.cos(this.c.yaw) * Math.cos(this.c.pitch));
    this.right.set(Math.cos(this.c.yaw), 0, -Math.sin(this.c.yaw));

    if (this.phase === 'safehouse') this.safehouseCam(dt);
    else if (this.phase === 'insert') this.insertStep(dt);
    else if (this.phase === 'exfil') this.exfilStep(dt);
    else if (this.phase === 'down') this.downStep(dt);
    else this.raidStep(dt);

    // The world goes on.
    const w = this.sky.update(progress, t, dt, cam.position);
    U.wet.value = w.wet; U.wind.value = 1 + w.wet * 1.4;
    this.water.update(t);
    this.foliage.update(this.phase === 'raid' || this.phase === 'range' ? P.body.pos : cam.position);
    this.squads.eye.copy(cam.position);
    this.squads.update(dt, t);
    this.bullets.update(dt);
    this.nades.update(dt, t);
    this.hostageStep(dt);
    this.aiVehicles(dt, w.night);
    this.eventsStep(dt, t, progress);
    for (const b of this.boxes) b.mesh.update(dt);
    if (t - this.cullAt > 0.4) this.cullProps();
    for (const s of this.smokes) if (Math.random() < dt * (s.big ? 5 : 2.5) && cam.position.distanceTo(this.v.a.set(s.x, s.y, s.z)) < 260) this.fx.smoke(this.v.a, 0.18, s.big ? 2.4 : 1.4, 6);
    if (this.extract.state !== 'none') { if (Math.random() < dt * 14) this.fx.flare(this.v.a.copy(this.extract.at).setY(this.extract.at.y + 0.3), 0xd83a2a); this.flareLight.position.copy(this.extract.at).setY(this.extract.at.y + 2); this.flareLight.intensity = 40 + Math.random() * 25; } else this.flareLight.intensity = 0;
    // Night: lamps glow; the nearest few light up for real; the driven vehicle's headlights.
    const dark = Math.min(1, Math.max(0, (this.sky.hour - 19.4) / 1.2));
    this.bulbs.emissiveIntensity = dark * 2.4;
    if (((t * 2) | 0) % 2 === 0) {
      const near = [...this.lamps].sort((a, b) => (a.x - cam.position.x) ** 2 + (a.z - cam.position.z) ** 2 - ((b.x - cam.position.x) ** 2 + (b.z - cam.position.z) ** 2));
      this.lampLights.forEach((l, i) => { const p = near[i]; if (p) l.position.set(p.x, p.y, p.z); l.intensity = dark * 26; });
    }
    if (this.vehicle && dark > 0.2) { this.vehicle.seat(this.headlights.position).add(this.v.a.set(-Math.sin(this.vehicle.yaw) * 2, -0.4, -Math.cos(this.vehicle.yaw) * 2)); this.headlights.target.position.copy(this.headlights.position).add(this.v.a.set(-Math.sin(this.vehicle.yaw) * 20, -3, -Math.cos(this.vehicle.yaw) * 20)); this.headlights.intensity = 260; } else this.headlights.intensity = 0;
    // The muzzle's light stays on for 35 ms a shot; a hot barrel smokes.
    if (t > this.muzzleUntil) this.muzzleLight.intensity = 0;
    this.heat = Math.max(0, this.heat - dt * 0.9);
    if (this.heat > 0.45 && this.phase === 'raid' && Math.random() < dt * 14 * Math.min(1, this.heat - 0.3) && t - this.lastShot > 0.08) this.fx.barrelSmoke(this.v.a.copy(this.vm.muzzleAt(this.v.a)).applyMatrix4(cam.matrixWorld));
    // Recoil recovery.
    if (t - this.lastShot > 0.12 && (Math.abs(this.recoverPitch) > 1e-5 || Math.abs(this.recoverYaw) > 1e-5)) {
      const f = 1 - Math.exp(-7 * dt), dp = this.recoverPitch * f, dy = this.recoverYaw * f;
      this.c.turn(dy, dp); this.recoverPitch -= dp; this.recoverYaw -= dy;
    }
    this.fx.update(dt);
    this.crowd.update(dt, { pos: P.body.pos, ry: this.c.yaw + Math.PI, air: !P.body.ground, part: 0, color: 0x4c5a6e, hat: 'none' });
    // Effects on the picture: flashbang white, hurt desaturation, night vision.
    const flash = Math.max(0, (this.flashUntil - t) / 3);
    this.r.finish.flash = Math.min(1, flash * 1.2);
    this.r.finish.desat = Math.max(0, 1 - (t - this.desatAt) / 0.6) * 0.5 + (this.hp < 30 ? 0.35 : 0);
    this.r.finish.nvg = this.nvg ? 1 : 0;
    this.r.finish.ads = this.vm.group.visible ? this.vm.ads * this.vm.ads * (3 - 2 * this.vm.ads) : 0;
    this.shake = Math.max(0, this.shake - dt * 1.6);
    // The gun's handling bumps the view a little (a magazine seated, the bolt slamming home, each shot).
    if (this.vm.group.visible) { cam.rotation.x += this.vm.camKick.pos.x; cam.rotation.y += this.vm.camKick.pos.y; cam.rotation.z += this.vm.camKick.pos.z; }
    if (this.shake > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches) { const s = this.shake * this.shake; cam.rotation.x += (Math.sin(t * 61) + Math.sin(t * 23)) * 0.006 * s; cam.rotation.y += (Math.sin(t * 53 + 1) + Math.sin(t * 19)) * 0.006 * s; }
    this.audio.update({ height: cam.position.y, rain: w.wet, night: w.night, engine: this.vehicle ? Math.min(1, Math.abs(this.vehicle.speed) / this.vehicle.spec.top) : 0, rotor: this.rotorLoud(), breath: P.stamina < 25 || P.holding ? 1 : 0, time: t });
    this.r.update(this.phase === 'raid' ? P.body.pos : cam.position);
    this.r.render(t);
    this.hudDom();
    if (t - this.hudAt > 0.1) { this.hudAt = t; this.report(); }
  }

  /* ── Phases ── */
  /** Back to the safehouse (the round's start, after an extraction or going down). */
  toSafehouse(first = false) {
    this.phase = 'safehouse'; this.phaseAt = this.t;
    this.vehicle = null; this.nvg = false;
    if (!first) this.safe = loadSafehouse();
    document.exitPointerLock?.();
    this.cb.menu(null);
  }
  private safehouseCam(dt: number) {
    const cam = this.r.camera, a = this.t * 0.035;
    this.v.a.set(Math.cos(a) * 330, 150, Math.sin(a) * 330);
    cam.position.lerp(this.v.a, 1 - Math.exp(-1.5 * dt)); cam.lookAt(0, 10, 0);
    this.vm.group.visible = false;
  }
  /** Deploy: the helicopter takes you to a landing zone; you watch from the open door. */
  deploy(lzIndex: number) {
    this.safe = loadSafehouse();
    const lzs = this.m.places.filter((p) => p.kind === 'lz'), p = lzs[lzIndex] ?? lzs[0];
    this.loadout = kitFor(this.safe);
    this.safe.raids++; saveSafehouse(this.safe);
    this.hp = 100; this.bleeding = false; this.fracture = false; this.selfRevive = false; this.slot = this.loadout.primary[0] ? 0 : 2;
    this.vm.setGun(this.currentGun()!, true);
    const out = this.v.a.set(p.x, 0, p.z).normalize();
    const pad = new THREE.Vector3(p.x - out.x * 6, groundY(this, p.x - out.x * 6, p.z - out.z * 6) + 0.4, p.z - out.z * 6);
    this.insertFlight = { from: new THREE.Vector3(p.x + out.x * 260, 70, p.z + out.z * 260), to: pad, t0: this.t, dur: 11 };
    this.heli.group.visible = true; this.heli.doorOpen = 1; this.heli.spin = 1;
    this.phase = 'insert'; this.phaseAt = this.t;
    this.c.yaw = Math.atan2(out.x, out.z) + Math.PI / 2; this.c.pitch = -0.15;
    this.cb.menu(null);
    this.cb.banner({ title: p.name, sub: 'Inserting · find loot · get out alive', tone: 'info' });
    this.audio.radio('Overlord to Ridgeline, two minutes to the landing zone. Good hunting.', true);
  }
  private insertStep(dt: number) {
    const f = this.insertFlight!, k = flyAlong(this.heli, f, this.t);
    this.heli.update(dt);
    // Seated at the left door, looking out.
    this.seatCam(dt);
    if (k >= 1) {
      const P = this.player, side = this.v.a.set(Math.cos(this.heli.group.rotation.y), 0, -Math.sin(this.heli.group.rotation.y)).multiplyScalar(-3.2);
      P.body.pos.set(this.heli.group.position.x + side.x, 0, this.heli.group.position.z + side.z);
      P.body.pos.y = this.grid.ground(P.body.pos.x, P.body.pos.z) + 0.1; P.body.vel.set(0, 0, 0);
      P.setStance('stand');
      this.phase = 'raid'; this.phaseAt = this.t; this.raidStart = this.t; this.raidKills = 0; this.raidHeads = 0; this.raidCleared = 0;
      this.vm.group.visible = true; this.vm.raise();
      this.insertFlight = { from: this.heli.group.position.clone(), to: this.heli.group.position.clone().add(new THREE.Vector3(0, 80, 0)).addScaledVector(this.v.b.set(-Math.sin(this.heli.group.rotation.y), 0, -Math.cos(this.heli.group.rotation.y)), 300), t0: this.t, dur: 12 };
      this.heliLeaving = true;
    }
  }
  private heliLeaving = false;
  /** The camera in the helicopter's cabin, by the open door, free to look round. */
  private seatCam(dt: number) {
    const h = this.heli.group, cam = this.r.camera;
    h.updateMatrixWorld();
    // Just outside the hull at the open door (sitting in the doorway, legs out).
    this.v.a.set(-1.6, 1.95, 0.25).applyMatrix4(h.matrixWorld);
    cam.position.lerp(this.v.a, 1 - Math.exp(-30 * dt));
    this.v.e.set(this.c.pitch, this.c.yaw, Math.sin(this.t * 0.9) * 0.02);
    cam.quaternion.setFromEuler(this.v.e);
    this.vm.group.visible = false;
  }
  private exfilStep(dt: number) {
    const f = this.extract.flight!, k = flyAlong(this.heli, f, this.t);
    this.heli.update(dt); this.heli.doorOpen = 1;
    this.seatCam(dt);
    if (k >= 1 || this.t - this.exfilAt > 9) this.bank();
  }
  private downStep(dt: number) {
    const cam = this.r.camera, P = this.player;
    this.v.a.set(P.body.pos.x, P.body.pos.y + 0.35, P.body.pos.z);
    cam.position.lerp(this.v.a, 1 - Math.exp(-4 * dt));
    cam.rotation.z += (0.6 - cam.rotation.z) * Math.min(1, dt * 2);
    this.vm.group.visible = false;
    if (this.selfRevive && this.input.take('use')) {
      this.selfRevive = false; this.hp = 35; this.phase = 'raid'; this.cb.menu(null); this.vm.group.visible = true; this.vm.raise();
      this.cb.banner({ title: 'Back on your feet', tone: 'good' }); this.audio.ui('heal');
    } else if (this.t - this.phaseAt > 6) this.toSafehouse();
  }

  private raidStep(dt: number) {
    const P = this.player, cam = this.r.camera, t = this.t, menu = this.menuOpen;
    const gun = this.currentGun(), stats = gun ? gunStats(gun) : null;
    // Heli leaving after the insertion.
    if (this.heliLeaving && this.insertFlight) { const k = flyAlong(this.heli, this.insertFlight, t); this.heli.update(dt); if (k >= 1) { this.heliLeaving = false; this.heli.group.visible = false; } }
    // Using things.
    if (!menu) this.keys(stats);
    // Driving or on foot.
    if (this.vehicle) this.drive(dt);
    else {
      const weight = loadoutWeight(this.loadout), limit = carryLimit(this.loadout);
      const slow = (weight > limit * 1.25 ? 0.65 : weight > limit ? 0.82 : 1) * (this.fracture ? 0.7 : 1) * (stats ? (this.aiming ? 1 : stats.move) : 1);
      const ev = P.update(dt, t, this.input, { ads: this.aiming, slow, noSprint: this.fracture || weight > limit * 1.25 || this.reloadUntil > t && false, adrenaline: t < this.adrenalineUntil, busy: this.actionUntil > t });
      if (ev.landed > 13) { this.hurtMe((ev.landed - 13) * 7, 'leg', P.body.pos, 1); this.vm.land(3); } else if (ev.landed > 4) this.vm.land(ev.landed / 4);
      if (ev.step) this.audio.step(ev.step, P.sprinting ? 0.8 : P.stance === 'crouch' ? 0.3 : 0.5);
      if (ev.step && P.sprinting) this.squads.noise(P.body.pos, 14, false);
      if (ev.vaulted) this.audio.step('concrete', 0.7);
      // The camera at the eyes, leaning out from cover, rolling into a slide.
      this.camPos.set(P.body.pos.x, P.body.pos.y + P.eye, P.body.pos.z).addScaledVector(this.right, P.lean * 0.42);
      this.camPos.y -= Math.abs(P.lean) * 0.06;
      cam.position.copy(this.camPos);
      this.v.e.set(this.c.pitch, this.c.yaw, P.roll);
      cam.quaternion.setFromEuler(this.v.e);
      // Aiming, firing, reloading.
      this.aiming = !!gun && !menu && this.input.aim && !P.sprinting && !P.swimming && this.actionUntil <= t && !P.vaulting;
      if (stats) this.shoot(dt, gun!, stats);
      // Holding your breath with a scope (Shift while aiming).
      P.holding = this.aiming && !!stats && stats.zoom >= 4 && this.c.keys.has('shift') && P.stamina > 1;
      // The view narrows with the gun as it comes up: 75° at the hip, 55° on irons and dots, 40° on a
      // 3× and 25° behind a sniper scope (whose lens shows its own magnified picture); wider sprinting.
      const fovBase = 75, zoom = stats ? stats.zoom : 1;
      const adsFov = zoom >= 4 ? (this.r.quality === 'low' ? fovBase / (1 + (zoom - 1) * 0.6) : 25) : zoom >= 2.5 ? 40 : 55;
      const ads = this.vm.ads * this.vm.ads * (3 - 2 * this.vm.ads);
      const wantFov = this.supportAim ? 22 : fovBase + (adsFov - fovBase) * ads + (P.tac ? 8 : P.sprinting ? 4 : 0) + (P.slideT > 0 ? 6 : 0);
      if (Math.abs(cam.fov - wantFov) > 0.05) { cam.fov += (wantFov - cam.fov) * (1 - Math.exp(-22 * dt)); cam.updateProjectionMatrix(); }
      // The scope's own picture for magnified optics.
      const scoped = this.aiming && zoom >= 4 && this.vm.ads > 0.85;
      this.r.scope.on = scoped && this.r.quality !== 'low';
      if (this.r.scope.on) { this.r.scope.camera.fov = cam.fov / (zoom * 0.62); this.r.scope.camera.aspect = 1; this.r.scope.camera.updateProjectionMatrix(); }
      if (this.vm.rig?.lens && (this.vm.rig.lens.material as THREE.ShaderMaterial).uniforms?.live) (this.vm.rig.lens.material as THREE.ShaderMaterial).uniforms.live.value = this.r.scope.on ? 1 : 0;
      // Scope sway unless holding breath.
      if (scoped && !P.holding) this.c.turn(Math.sin(t * 0.9) * 0.00012 * zoom, Math.sin(t * 1.3) * 0.0001 * zoom);
      this.vm.group.visible = !P.swimming;
      this.vm.update(dt, { ads: this.aiming, speed: P.speed, sprint: P.sprinting, tac: P.tac, slide: P.slideT > 0, lookDX: this.lookDX, lookDY: this.lookDY, crouch: P.stance !== 'stand', lean: P.lean, breath: P.holding ? 0.1 : 1, time: t, adsTime: stats?.adsTime ?? 0.25, gait: P.gait });
    }
    // Statuses: bleeding, adrenaline, kit being used.
    if (this.bleeding) { this.hp -= BLEED_HP_S * dt; if (Math.random() < dt * 2) this.fx.impact(this.v.a.set(P.body.pos.x, P.body.pos.y + 0.05, P.body.pos.z), UP, 'flesh', false); }
    if (this.actionUntil && t >= this.actionUntil) { this.actionUntil = 0; const a = this.action; this.action = null; this.actionName = ''; a?.(); }
    if (this.hp <= 0) this.goDown();
    // What's near and in view: interactions.
    this.interact();
    // Extraction.
    this.extractStep(dt);
    // SAM sites: hold the launcher once it's clear.
    for (const p of this.m.places) if (p.kind === 'sam' && !this.samTaken.has(p.id) && this.clearedPlaces.has(p.id) && Math.hypot(P.body.pos.x - p.x, P.body.pos.z - p.z) < 8) {
      const held = (this.samHold.get(p.id) ?? 0) + dt; this.samHold.set(p.id, held);
      if (held > 5) { this.samTaken.add(p.id); this.combat += SCORE.sam; this.cb.banner({ title: `${p.name} captured`, sub: `+${SCORE.sam} · no enemy helicopters from here · free UAV`, tone: 'good' }); this.uavUntil = this.t + 40; this.audio.ui('buy'); this.scored(); }
    }
    // Reinforcements waiting to be sent.
    for (const [place, at] of this.calls) if (at > 0 && t > at) { this.calls.set(place, -1); this.sendBackup(place); }
  }

  /* ── Keys ── */
  private keys(stats: GunStats | null) {
    const I = this.input, l = this.loadout;
    if (I.take('inventory')) { this.openInventory(null); return; }
    if (I.take('map')) this.openMap();
    if (I.take('weather')) { this.sky.rainWant = this.sky.rainWant > 0.5 ? 0 : 1; this.cb.feed({ kind: 'info', text: this.sky.rainWant ? 'Rain rolling in' : 'Weather clearing' }); }
    if (I.take('nvg')) { if (l.helmet && HELMETS[l.helmet].nvg) { this.nvg = !this.nvg; this.audio.click(); } else this.cb.feed({ kind: 'bad', text: 'Night vision needs a tier 2 helmet or better' }); }
    if (this.vehicle) return;
    if (I.take('reload')) this.startReload();
    if (I.take('inspect')) this.vm.inspect();
    if (I.take('mode')) { const g = this.currentGun(); if (g && WEAPONS[g.base].modes.length > 1) { g.mode = nextMode(g); this.audio.click(); this.cb.feed({ kind: 'info', text: `${g.mode === 'auto' ? 'Full auto' : g.mode === 'burst' ? '3-round burst' : 'Semi-auto'}` }); } }
    for (const [k, s] of [['slot1', 0], ['slot2', 1], ['slot3', 2]] as const) if (I.take(k)) this.swapTo(s);
    if (I.take('swap')) this.swapTo(this.slot === 2 ? (l.primary[0] ? 0 : 1) : this.slot === 0 ? (l.primary[1] ? 1 : 2) : 2);
    if (I.take('plate')) this.usePlate();
    if (I.take('firstaid')) this.useMed('firstaid');
    if (I.take('bandage')) this.useMed('bandage');
    if (I.take('splint')) this.useMed('splint');
    if (I.take('adrenaline')) this.useMed('adrenaline');
    if (I.take('frag')) this.throwNade('frag');
    // V: your tactical grenade, a flashbang if you have one, otherwise smoke.
    if (I.take('flash')) this.throwNade(bagCount(l, (it) => it.kind === 'nade' && it.nade === 'flash') ? 'flash' : 'smoke');
    if (I.take('extract')) this.tryExtract();
    void stats;
  }
  currentGun(): Gun | null { return this.slot === 2 ? this.loadout.sidearm : this.loadout.primary[this.slot] ?? null; }
  private swapTo(s: number) {
    const g = s === 2 ? this.loadout.sidearm : this.loadout.primary[s];
    if (!g || s === this.slot) return;
    this.slot = s; this.reloadUntil = 0; this.vm.cancelReload(); this.vm.setGun(g); this.cool = 0.8; this.audio.foley('cloth');
  }
  private busy(name: string, dur: number, done: () => void) { this.actionUntil = this.t + dur; this.action = done; this.actionName = name; this.reloadUntil = 0; this.vm.cancelReload(); }
  private usePlate() {
    const l = this.loadout, slots = l.vest ? VESTS[l.vest].plates : 0;
    if (this.actionUntil > this.t) return;
    if (!slots) { this.cb.feed({ kind: 'bad', text: 'No plate carrier' }); return; }
    while (l.plates.length < slots) l.plates.push(0);
    const worst = l.plates.reduce((m, p, i) => (p < l.plates[m] ? i : m), 0);
    const kind = bagCount(l, (it) => it.kind === 'plate' && it.plate === 'steel') ? 'steel' : 'ceramic';
    if (l.plates[worst] >= PLATES[kind].hp - 1 || !bagCount(l, (it) => it.kind === 'plate')) { this.cb.feed({ kind: 'bad', text: bagCount(l, (it) => it.kind === 'plate') ? 'Plates are full' : 'No spare plates' }); return; }
    this.vm.act('plate', PLATE_S);
    this.busy('Plating up', PLATE_S, () => {
      if (!bagTake(l, (it) => it.kind === 'plate' && it.plate === kind, 1)) return;
      l.plates[worst] = PLATES[kind].hp; this.audio.ui('plate');
    });
  }
  private useMed(med: 'firstaid' | 'bandage' | 'splint' | 'adrenaline') {
    const l = this.loadout;
    if (this.actionUntil > this.t) return;
    if (!bagCount(l, (it) => it.kind === 'med' && it.med === med)) { this.cb.feed({ kind: 'bad', text: `No ${MEDS[med].name.toLowerCase()}` }); return; }
    if (med === 'bandage' && !this.bleeding) { this.cb.feed({ kind: 'info', text: 'Not bleeding' }); return; }
    if (med === 'splint' && !this.fracture) { this.cb.feed({ kind: 'info', text: 'No fracture' }); return; }
    if (med === 'firstaid' && this.hp >= 100) { this.cb.feed({ kind: 'info', text: 'Already at full health' }); return; }
    this.vm.act(med, MEDS[med].use);
    this.busy(MEDS[med].name, MEDS[med].use, () => {
      if (!bagTake(l, (it) => it.kind === 'med' && it.med === med, 1)) return;
      if (med === 'bandage') this.bleeding = false;
      if (med === 'splint') this.fracture = false;
      if (med === 'firstaid') { this.hp = Math.min(100, this.hp + FIRST_AID_HP); this.bleeding = false; }
      if (med === 'adrenaline') { this.adrenalineUntil = this.t + ADRENALINE_S; this.hp = Math.min(100, this.hp + ADRENALINE_HP); this.player.stamina = 100; }
      this.audio.ui('heal');
    });
  }
  private throwNade(kind: 'frag' | 'flash' | 'smoke') {
    if (this.actionUntil > this.t) return;
    if (!bagTake(this.loadout, (it) => it.kind === 'nade' && it.nade === kind, 1)) { this.cb.feed({ kind: 'bad', text: kind === 'frag' ? 'No frag grenades' : 'No flashbangs or smoke' }); return; }
    // The hand takes it out, pulls the pin and throws; it leaves the hand at the release.
    this.pendingNade = kind; this.vm.toss(kind);
    this.busy('', 0.85, () => {});
  }
  private releaseNade() {
    const kind = this.pendingNade; this.pendingNade = null;
    if (!kind) return;
    const from = this.v.a.copy(this.r.camera.position).addScaledVector(this.look, 0.6).addScaledVector(this.right, -0.15);
    this.nades.toss(kind, from, this.v.b.copy(this.look).multiplyScalar(17).add(this.v.c.set(0, 4, 0)).add(this.player.body.vel), 'me');
    this.audio.foley('cloth');
  }

  /* ── Shooting ── */
  private shoot(dt: number, gun: Gun, s: GunStats) {
    const t = this.t, P = this.player;
    this.cool -= dt;
    if (this.reloadUntil && t >= this.reloadUntil) this.finishReload(gun, s);
    if (this.menuOpen || this.actionUntil > t || P.sprinting || P.vaulting || P.swimming || this.reloadUntil > t || t < this.boltUntil) { this.c.take('fire'); return; }
    const pressed = this.c.take('fire'), held = this.input.fire;
    if (gun.mode === 'burst' && pressed && this.burstLeft <= 0) this.burstLeft = 3;
    const want = gun.mode === 'auto' ? held : gun.mode === 'burst' ? this.burstLeft > 0 : pressed;
    if (!want || this.cool > 0) return;
    if (gun.mag <= 0) { this.audio.click(); this.burstLeft = 0; if (ammoIn(this.loadout, s.pool) > 0) this.startReload(); return; }
    gun.mag--; if (this.burstLeft > 0) this.burstLeft--;
    this.cool = 60 / s.rpm;
    this.shots++;
    if (t - this.lastShot > 0.35) this.shotN = 0;
    this.shotN++; this.lastShot = t;
    // Where the shot goes: the crosshair, spread by stance, movement and firing.
    const moving = P.speed / 5, bloom = Math.min(1.8, 1 + this.shotN * 0.05);
    const spread = (this.aiming ? s.ads : s.hip * bloom) * (1 + moving * (this.aiming ? 0.6 : 1)) * (P.stance === 'prone' ? 0.55 : P.stance === 'crouch' ? 0.8 : 1) * (P.body.ground ? 1 : 2.5) * (P.holding ? 0.4 : 1);
    const cam = this.r.camera, aimDist = this.grid.cast(cam.position, this.look, 600), aimAt = this.v.d.copy(cam.position).addScaledVector(this.look, Math.max(4, aimDist));
    const muzzle = this.v.a.copy(this.vm.muzzleAt(this.v.a)).applyMatrix4(cam.matrixWorld);
    for (let i = 0; i < s.pellets; i++) {
      const r = spread * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
      const dir = this.v.b.subVectors(aimAt, muzzle).normalize();
      const up = this.v.c.crossVectors(dir, this.right).normalize();
      dir.addScaledVector(this.right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      this.bullets.fire(muzzle, dir, s.velocity, s, s.mods.armour, 'me', i === 0 && (s.pellets > 1 || this.shotN % 3 === 1));
    }
    // Kick: the view climbs and drifts; the gun jumps; brass flies; the muzzle flashes; it's heard.
    const k = recoilFor(s, this.shotN, Math.random()), steady = (this.aiming ? 0.85 : 1.15) * (P.stance === 'prone' ? 0.6 : P.stance === 'crouch' ? 0.85 : 1);
    this.c.turn(-k.side * steady, -k.up * steady);
    // Part of the climb comes back once you stop firing.
    this.recoverYaw += k.side * steady * 0.55; this.recoverPitch += k.up * steady * 0.55;
    this.vm.fire(s.kick / 0.01, s.bolt ?? 0, gun.mag === 0);
    this.heat = Math.min(3, this.heat + 0.12 * (s.cls === 'lmg' ? 1.4 : 1));
    if (s.bolt) { this.boltUntil = t + s.bolt; setTimeout(() => this.audio.reload(s.cls === 'shotgun' ? 'pump' : 'bolt'), 200); }
    if (s.mods.flash) { this.fx.muzzle(muzzle, this.look); this.muzzleLight.position.copy(muzzle); this.muzzleLight.intensity = 30; this.muzzleUntil = t + 0.035; } else this.vm.hideFlash();
    if (s.cls !== 'shotgun' && !s.bolt) this.fx.eject(this.v.c.copy(this.vm.portAt(this.v.c)).applyMatrix4(cam.matrixWorld), this.right, UP, 0.3);
    this.audio.gun(0, 0, { heavy: s.cls === 'marksman' ? 1.5 : s.cls === 'lmg' ? 1.15 : s.cls === 'pistol' ? 0.7 : s.cls === 'smg' ? 0.8 : s.cls === 'shotgun' ? 1.4 : 1, suppressed: s.mods.noise < 0.3, mine: true });
    this.squads.noise(P.body.pos, 190 * s.mods.noise, s.mods.noise > 0.5);
    if (gun.mag === 0 && ammoIn(this.loadout, s.pool) > 0) setTimeout(() => this.startReload(), 160);
  }
  startReload() {
    const g = this.currentGun();
    if (!g || this.reloadUntil > this.t || this.actionUntil > this.t) return;
    const s = gunStats(g);
    if (g.mag >= s.mag) return;
    if (ammoIn(this.loadout, s.pool) <= 0) { this.cb.feed({ kind: 'bad', text: `No ${AMMO[s.pool].name.toLowerCase()}` }); this.audio.click(); return; }
    this.reloadEmpty = g.mag === 0;
    const dur = this.reloadEmpty ? s.reloadEmpty : s.reload;
    this.reloadUntil = this.t + dur; this.vm.reload(dur, this.reloadEmpty, Math.min(s.mag - g.mag, ammoIn(this.loadout, s.pool)));
  }
  private finishReload(g: Gun, s: GunStats) {
    this.reloadUntil = 0;
    const need = s.mag - g.mag, got = bagTake(this.loadout, (it) => it.kind === 'ammo' && it.pool === s.pool, need);
    g.mag += got;
  }

  /* ── Hits ── */
  private targets(): Target[] {
    const out: Target[] = [];
    for (const f of this.squads.foes) if (f.active && !f.dead) out.push(f);
    for (const v of this.vehicles) if (!v.dead && v.center.distanceTo(this.player.body.pos) < 400) out.push(v);
    for (const tr of this.trucks) if (!tr.v.dead) out.push(tr.v);
    if (this.phase === 'raid' || this.phase === 'range') out.push(this.meTarget);
    if (this.range) for (const tg of this.range.targets) out.push({ id: -100, team: 'foe', center: tg.at, radius: 0.6, trace: (o, d, len) => { const h = new THREE.Ray(o, d).intersectSphere(new THREE.Sphere(tg.at, 0.45), this.v.c); if (!h) return null; const dd = h.distanceTo(o); if (dd > len) return null; this.rangeHit = tg; return { d: dd, part: 'body' }; } });
    return out;
  }
  private rangeHit: { at: THREE.Vector3; mesh: THREE.Mesh; dist: number } | null = null;
  private meTarget: Target = {
    id: 'me', team: 'me', center: new THREE.Vector3(), radius: 1.3,
    trace: (o, d, len) => {
      const P = this.player, b = P.body.pos, h = P.eye;
      this.meTarget.center.set(b.x, b.y + h / 2, b.z);
      const spheres: [number, number, Part][] = P.stance === 'prone' ? [[0.25, 0.35, 'body'], [0.3, 0.2, 'head']] : [[h - 0.05, 0.16, 'head'], [h - 0.4, 0.27, 'body'], [h * 0.5, 0.25, 'body'], [0.35, 0.18, 'leg']];
      let best: Hit | null = null;
      for (const [y, r, part] of spheres) {
        const c = this.v.c.set(b.x, b.y + y, b.z).sub(o), along = c.dot(d);
        if (along < 0 || along > len) continue;
        const d2 = c.lengthSq() - along * along;
        if (d2 > r * r) continue;
        const dd = along - Math.sqrt(r * r - d2);
        if (!best || dd < best.d) best = { d: dd, part };
      }
      return best;
    },
  };
  private onHit(tg: Target, part: Part, dmg: number, armour: number, at: THREE.Vector3, dir: THREE.Vector3, from: THREE.Vector3, owner: 'me' | number) {
    const nrm = this.v.c.copy(dir).negate();
    if (tg.id === 'me') { this.hurtMe(dmg, part, from, armour); this.fx.impact(at, nrm, 'flesh', false); return; }
    if (tg.id === -100 && this.rangeHit) { const tgt = this.rangeHit; this.audio.hit('armour'); this.cb.hit(part === 'head' ? 'head' : 'armour'); this.fx.impact(at, nrm, 'metal', false); this.cb.feed({ kind: 'info', text: `${tgt.dist} m · ${Math.round(dmg)} damage` }); tgt.mesh.rotation.x = -0.4; setTimeout(() => { tgt.mesh.rotation.x = 0; }, 300); return; }
    if (tg instanceof Vehicle) { this.fx.impact(at, nrm, 'metal'); if (owner === 'me') { this.cb.hit('armour'); this.audio.hit('armour'); } if (tg.damage(dmg, part)) this.vehicleBoom(tg); return; }
    if (!(tg instanceof Foe)) return;
    const f = tg, r = f.damage(dmg, part, armour, from, this.t);
    this.fx.impact(at, nrm, r.plateHit ? 'armour' : 'flesh', false);
    if (owner !== 'me') return;
    this.hits++;
    const kind = r.down ? 'kill' : part === 'head' ? 'head' : r.broke ? 'break' : r.plateHit ? 'armour' : 'flesh';
    this.cb.hit(kind); this.audio.hit(kind);
    if (r.down) this.killed(f, part === 'head');
  }
  private killed(f: Foe, head: boolean) {
    f.state = 'dead'; f.deadAt = this.t; if (f.laser) f.laser.visible = false;
    f.op.hold(null);
    this.kills++; this.raidKills++; if (head) { this.heads++; this.raidHeads++; }
    this.combat += SCORE.kill + (head ? SCORE.headshot : 0);
    this.contract('kills', 1); if (head) this.contract('headshots', 1);
    this.cb.feed({ kind: 'kill', text: `${head ? '⊕ ' : ''}${f.spec.name} · ${WEAPONS[this.currentGun()?.base ?? 'mcr4'].name}${head ? ' · headshot' : ''}  +${SCORE.kill + (head ? SCORE.headshot : 0)}`, color: head ? '#fca5a5' : undefined });
    // Others nearby hear about it.
    const near = this.squads.foes.find((o) => !o.dead && o !== f && o.pos.distanceTo(f.pos) < 40);
    if (near) { near.aware = 1; near.state = 'combat'; near.known.copy(this.player.body.pos); near.knownAt = this.t; if (Math.random() < 0.6) this.radio(say('down'), near.pos); }
    // Is the place clear?
    const p = this.m.places[f.spawn.place];
    if (p && !this.clearedPlaces.has(p.id) && this.squads.standing(p.id) === 0) {
      this.clearedPlaces.add(p.id); this.cleared++; this.raidCleared++;
      if (p.kind !== 'sam') { const pts = SCORE.poi[p.tier]; this.combat += pts; this.cb.banner({ title: `${p.name} cleared`, sub: `+${pts.toLocaleString()}`, tone: 'good' }); this.contract('poi', 1); }
      else this.cb.banner({ title: `${p.name} clear`, sub: 'Hold the launcher to capture it', tone: 'info' });
      this.flags.get(p.id)?.color.set(0x2f7d32);
      this.audio.ui('buy');
    }
    this.scored();
  }
  /** You're hit: plates, helmet, health, then bleeding or a broken leg; the red arrow toward who did it. */
  hurtMe(dmg: number, part: Part, from: THREE.Vector3, armourX: number) {
    if (this.phase !== 'raid' && this.phase !== 'range') return;
    if (this.vehicle) { dmg *= this.vehicle.kind === 'ltv' ? 0.25 : 0.8; if (this.vehicle.kind === 'ltv') part = 'body'; }
    const l = this.loadout, r = applyHit({ hp: this.hp, plates: l.plates, helmet: l.helmet }, dmg, part, armourX);
    this.hp = r.hp; l.plates = r.plates;
    if (fractures(part, r.dealt, Math.random())) { this.fracture = true; this.cb.feed({ kind: 'bad', text: 'Leg fractured: use a splint (6)' }); }
    if (bleeds(part, r.plateHit, r.dealt, Math.random())) { if (!this.bleeding) this.cb.feed({ kind: 'bad', text: 'Bleeding: bandage up (5)' }); this.bleeding = true; }
    if (r.broke) this.cb.feed({ kind: 'bad', text: 'Plate broken' });
    const ang = (Math.atan2(from.x - this.player.body.pos.x, from.z - this.player.body.pos.z) - Math.atan2(this.look.x, this.look.z)) * 180 / Math.PI;
    this.cb.hurt(ang); this.audio.hurt(r.plateHit);
    this.shake = Math.min(1, this.shake + 0.25); this.desatAt = this.t; this.hurtAt = this.t;
    if (this.hp <= 0) this.goDown();
  }
  private explode(at: THREE.Vector3, radius: number, dmg: number, owner: 'me' | number) {
    const d0 = at.distanceTo(this.r.camera.position);
    this.audio.boom(d0, this.panOf(at)); this.shake = Math.min(1, this.shake + Math.max(0, 1 - d0 / 40));
    this.squads.noise(at, 220, true);
    const lift = this.v.d.copy(at).setY(at.y + 0.5);
    for (const f of this.squads.foes) {
      if (f.dead || !f.active) continue;
      const d = f.pos.distanceTo(at); if (d > radius) continue;
      if (!this.grid.clear(lift, this.v.a.set(f.pos.x, f.pos.y + 1, f.pos.z))) continue;
      const r = f.damage(dmg * (1 - d / radius) + 20, 'body', 1.2, at, this.t);
      if (owner === 'me') { this.cb.hit(r.down ? 'kill' : 'flesh'); if (r.down) this.killed(f, false); }
      else if (r.down) { f.state = 'dead'; f.deadAt = this.t; f.op.hold(null); }
    }
    const P = this.player, dm = P.body.pos.distanceTo(at);
    if (dm < radius && this.grid.clear(lift, P.head)) this.hurtMe(dmg * (1 - dm / radius) * 0.75, 'body', at, 1);
    for (const v of [...this.vehicles, ...this.trucks.map((x) => x.v)]) if (!v.dead && v.pos.distanceTo(at) < radius) { v.lastTire = -1; if (v.damage(dmg * 2 * (1 - v.pos.distanceTo(at) / radius), 'body')) this.vehicleBoom(v); }
  }
  private vehicleBoom(v: Vehicle) {
    this.fx.boom(v.center, 1.6); this.smokes.push({ x: v.pos.x, y: v.pos.y + 1.5, z: v.pos.z, big: true });
    v.group.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m?.color) { m.color.multiplyScalar(0.25); } });
    if (this.vehicle === v) { this.exitVehicle(); this.hurtMe(70, 'body', v.pos, 1); }
    this.explode(v.center, 7, 120, 'me');
  }
  private flashbang(at: THREE.Vector3) {
    const P = this.player, d = P.head.distanceTo(at);
    this.audio.boom(d, this.panOf(at), 0.4); this.fx.impact(at, UP, 'metal', false);
    if (d < 18 && this.grid.clear(at, P.head)) {
      const facing = this.v.a.subVectors(at, P.head).normalize().dot(this.look);
      const power = Math.max(0, 1 - d / 18) * (facing > 0.3 ? 1 : 0.4);
      if (power > 0.1) { this.flashUntil = this.t + 3 * power + 0.5; this.audio.ring(power); }
    }
    for (const f of this.squads.foes) if (!f.dead && f.pos.distanceTo(at) < 12) { f.nextShot = this.t + 3; f.aware = Math.max(0.5, f.aware - 0.5); }
  }
  private goDown() {
    if (this.phase !== 'raid' && this.phase !== 'range') return;
    if (this.phase === 'range') { this.hp = 100; return; }
    if (this.vehicle) this.exitVehicle();
    this.phase = 'down'; this.phaseAt = this.t; this.actionUntil = 0; this.reloadUntil = 0; this.nvg = false;
    if (this.selfRevive) { this.cb.menu({ kind: 'down', selfRevive: true, lost: 0 }); return; }
    // Everything you carry stays where you fell (a body to come back to); the secure container comes home.
    const l = this.loadout, items: Item[] = [...l.bag];
    l.primary.forEach((g, i) => { if (g) items.push({ kind: 'gun', gun: g, fresh: l.fresh.primary[i] }); });
    if (l.sidearm) items.push({ kind: 'gun', gun: l.sidearm, fresh: l.fresh.sidearm });
    if (l.helmet) items.push({ kind: 'helmet', tier: l.helmet, fresh: l.fresh.helmet });
    if (l.vest) items.push({ kind: 'vest', tier: l.vest, fresh: l.fresh.vest });
    if (l.cash) items.push({ kind: 'cash', n: l.cash, fresh: l.freshCash > 0 });
    const lost = freshValue(l);
    const body: Box = { data: { id: -1, kind: 'body', place: -1, x: this.player.body.pos.x, y: this.player.body.pos.y, z: this.player.body.pos.z, turn: 0, items: [] }, mesh: new ContainerMesh('duffel', this.player.body.pos.x, this.player.body.pos.y, this.player.body.pos.z, 0), items, searched: false };
    this.r.scene.add(body.mesh.group); this.boxes.push(body);
    this.safe = loadSafehouse();
    this.safe.stash.push(...l.secure); this.safe.loadout = null; saveSafehouse(this.safe);
    for (const h of this.hostages) if (h.state === 'follow') h.state = 'wait';
    if (this.extract.state !== 'none') { this.extract.state = 'none'; this.heli.group.visible = false; }
    this.cb.menu({ kind: 'down', selfRevive: false, lost });
    this.cb.banner({ title: 'You’re down', sub: 'Your gear stays where you fell', tone: 'bad' });
  }

  /* ── Things to use ── */
  private interact() {
    const P = this.player, I = this.input, cam = this.r.camera, pos = P.body.pos;
    let prompt = '', act: (() => void) | null = null;
    // A vehicle to get into (or out of).
    if (this.vehicle) { prompt = 'F · Get out'; act = () => this.exitVehicle(); }
    else {
      const v = this.vehicles.find((x) => !x.dead && x.pos.distanceTo(pos) < (x.kind === 'ltv' ? 4 : 2.6));
      if (v) { prompt = `F · Drive the ${v.kind === 'ltv' ? 'armoured truck' : v.kind === 'bike' ? 'dirt bike' : 'boat'} (fuel ${Math.round(v.fuel * 100)}%)`; act = () => this.enterVehicle(v); }
    }
    // Hostages.
    if (!act) for (const h of this.hostages) if ((h.state === 'held' || h.state === 'wait') && h.pos.distanceTo(pos) < 2.4) { prompt = h.state === 'held' ? 'F · Cut the hostage free' : 'F · “On me”'; act = () => { if (h.state === 'held') this.cb.feed({ kind: 'info', text: 'Hostage freed: get them to the extraction' }); h.state = 'follow'; this.audio.ui('pick'); }; break; }
    // What's in view in reach: a container, a body, something on the ground, a buy station.
    if (!act) {
      let bestD = 2.6, best: (() => void) | null = null, label = '';
      const consider = (at: THREE.Vector3, reach: number, l: string, fn: () => void) => {
        const d = at.distanceTo(cam.position); if (d > reach) return;
        const dot = this.v.a.subVectors(at, cam.position).normalize().dot(this.look);
        if (dot < (d < 1.4 ? 0.3 : 0.8)) return;
        const score = d * (2 - dot);
        if (score < bestD) { bestD = score; best = fn; label = l; }
      };
      for (const b of this.boxes) {
        if (b.searched && !b.items.length) continue;
        consider(this.v.b.set(b.data.x, b.data.y + 0.5, b.data.z), 2.6, `F · ${b.searched ? 'Loot' : b.data.kind === 'safe' ? 'Open the safe' : 'Search'} ${CONTAINERS[b.data.kind].name.toLowerCase()}`, () => this.openBox(b));
      }
      for (const f of this.squads.foes) if (f.dead && !(f.searched && !f.loot.length)) consider(this.v.b.set(f.pos.x, f.pos.y + 0.3, f.pos.z), 2.4, `F · Search the ${f.spec.name.toLowerCase()}`, () => this.openBody(f));
      for (const g of this.ground) consider(g.at, 2.6, `F · Pick up ${itemName(g.item)}`, () => this.pickGround(g));
      for (const k of this.m.kiosks) consider(this.v.b.set(k.x, k.y + 1.3, k.z), 2.6, 'F · Buy station', () => { this.menuOpen = 'buy'; this.cb.menu({ kind: 'buy', cash: this.loadout.cash }); document.exitPointerLock?.(); });
      if (best) { prompt = label; act = best; }
    }
    // A landing zone: call the helicopter (E or F).
    const lz = this.m.places.find((p) => p.kind === 'lz' && Math.hypot(p.x - pos.x, p.z - pos.z) < 14);
    if (!act && lz && this.extract.state === 'none') { prompt = 'E / F · Call the extraction helicopter'; act = () => this.tryExtract(); }
    if (!act && this.extract.state === 'boarding' && this.heli.group.position.distanceTo(pos) < 8) { prompt = 'F · Board the helicopter'; act = () => this.board(); }
    if (this.range && Math.hypot(pos.x - 560, pos.z) < 5) { prompt = 'F · Leave the range'; act = () => this.leaveRange(); }
    this.prompt = prompt;
    if (I.take('use') && act) act();
  }
  private prompt = '';
  private openBox(b: Box) {
    if (b.data.kind === 'safe' && !b.searched) {
      const key = b.data.key, has = this.loadout.bag.some((it) => it.kind === 'key' && it.key === key) || this.loadout.secure.some((it) => it.kind === 'key' && it.key === key);
      if (!has) { this.cb.feed({ kind: 'bad', text: `Locked: it needs the ${key === 'radar' ? 'Radar office' : key === 'dam' ? 'Dam control room' : 'Bunker 07 vault'} key` }); this.audio.ui('deny'); return; }
    }
    if (!b.searched) { b.searched = true; b.mesh.openUp(); this.searched++; this.contract('containers', 1); this.audio.ui('pick'); }
    this.openInventory(b);
  }
  private openBody(f: Foe) { f.searched = true; this.openInventory(f); }
  openInventory(target: Box | Foe | null) {
    this.lootTarget = target; this.menuOpen = 'inventory';
    document.exitPointerLock?.();
    this.sendInventory();
  }
  private sendInventory() {
    const tg = this.lootTarget, items = tg ? (tg instanceof Foe ? tg.loot : tg.items) : null;
    const title = tg ? (tg instanceof Foe ? `${tg.spec.name} (body)` : CONTAINERS[tg.data.kind].name) : '';
    this.cb.menu({ kind: 'inventory', loadout: structuredClone(this.loadout), weight: loadoutWeight(this.loadout), limit: carryLimit(this.loadout), loot: items ? { title, items: structuredClone(items) } : null });
  }
  openMap() { this.menuOpen = 'map'; this.cb.menu({ kind: 'map', mortar: false }); document.exitPointerLock?.(); }
  closeMenu() { this.menuOpen = null; this.lootTarget = null; this.cb.menu(null); }

  /** Taking an item from what's being looted (−1: everything that fits). */
  take(index: number) {
    const tg = this.lootTarget;
    if (!tg) return;
    const list = tg instanceof Foe ? tg.loot : tg.items, picks = index < 0 ? list.map((_, i) => i).reverse() : [index];
    for (const i of picks) {
      const it = list[i]; if (!it) continue;
      if (this.gain(it)) list.splice(i, 1);
    }
    this.sendInventory();
  }
  /** Puts an item on you: cash to the wallet, a gun to an empty slot (or the bag), the rest in the bag. */
  private gain(it: Item): boolean {
    const l = this.loadout;
    if (it.kind === 'cash') { l.cash += it.n; if (it.fresh) l.freshCash += it.n; this.cb.feed({ kind: 'loot', text: `+$${it.n.toLocaleString()}`, color: '#86efac' }); this.audio.ui('pick'); return true; }
    if (it.kind === 'gun') {
      const pistol = WEAPONS[it.gun.base].cls === 'pistol';
      if (pistol && !l.sidearm) { l.sidearm = it.gun; l.fresh.sidearm = !!it.fresh; this.found(it); return true; }
      const free = l.primary.findIndex((g) => !g);
      if (!pistol && free >= 0) { l.primary[free] = it.gun; l.fresh.primary[free] = !!it.fresh; if (this.slot === free || !this.currentGun()) { this.slot = free; this.vm.setGun(it.gun); } this.found(it); return true; }
    }
    if (it.kind === 'helmet' && (!l.helmet || it.tier > l.helmet)) { if (l.helmet) this.dropItem({ kind: 'helmet', tier: l.helmet, fresh: l.fresh.helmet }); l.helmet = it.tier; l.fresh.helmet = !!it.fresh; this.found(it); return true; }
    if (it.kind === 'vest' && (!l.vest || it.tier > l.vest)) { if (l.vest) this.dropItem({ kind: 'vest', tier: l.vest, fresh: l.fresh.vest }); l.vest = it.tier; l.fresh.vest = !!it.fresh; while (l.plates.length < VESTS[it.tier].plates) l.plates.push(0); this.found(it); return true; }
    if (it.kind === 'pack' && PACKS[it.size].slots > PACKS[l.pack].slots) { l.pack = it.size; l.fresh.pack = !!it.fresh; this.found(it); return true; }
    const left = bagAdd(l, it);
    if (left) { this.cb.feed({ kind: 'bad', text: 'Backpack full' }); this.audio.ui('deny'); return false; }
    this.found(it);
    return true;
  }
  private found(it: Item) {
    const rar = itemRarity(it);
    this.cb.feed({ kind: 'loot', text: `+ ${itemName(it)}`, color: ['#d4d4d8', '#4ade80', '#60a5fa', '#c084fc', '#f59e0b'][rar] });
    this.audio.ui(rar >= 4 ? 'legend' : 'pick');
    if ('fresh' in it && it.fresh && (!this.bestFind || rar > this.bestFind.rarity)) this.bestFind = { name: itemName(it), rarity: rar };
    if (rar >= 4) this.cb.banner({ title: 'Legendary find', sub: itemName(it), tone: 'gold' });
  }
  /** Inventory actions from the menu. */
  invAction(a: { do: 'drop' | 'use' | 'secure' | 'unsecure' | 'equip' | 'unequip' | 'attach' | 'detach'; index?: number; slot?: number; att?: string }) {
    const l = this.loadout;
    if (a.do === 'drop' && a.index !== undefined) { const [it] = l.bag.splice(a.index, 1); if (it) this.dropItem(it); }
    if (a.do === 'secure' && a.index !== undefined && l.secure.length < 4) { const [it] = l.bag.splice(a.index, 1); if (it) l.secure.push(it); }
    if (a.do === 'unsecure' && a.index !== undefined) { const it = l.secure[a.index]; if (it && !bagAdd(l, it)) l.secure.splice(a.index, 1); }
    if (a.do === 'use' && a.index !== undefined) {
      const it = l.bag[a.index];
      if (it?.kind === 'med') { this.closeMenu(); this.useMed(it.med); }
      if (it?.kind === 'plate') { this.closeMenu(); this.usePlate(); }
    }
    if (a.do === 'equip' && a.index !== undefined) {
      const it = l.bag[a.index];
      if (it?.kind === 'gun') {
        const pistol = WEAPONS[it.gun.base].cls === 'pistol', slot = pistol ? 2 : (a.slot ?? (l.primary[0] ? 1 : 0));
        const old = slot === 2 ? l.sidearm : l.primary[slot];
        l.bag.splice(a.index, 1);
        if (slot === 2) { l.sidearm = it.gun; l.fresh.sidearm = !!it.fresh; } else { l.primary[slot] = it.gun; l.fresh.primary[slot] = !!it.fresh; }
        if (old) { const spill = bagAdd(l, { kind: 'gun', gun: old, fresh: false }); if (spill) this.dropItem(spill); }
        if (this.slot === slot) this.vm.setGun(it.gun);
      }
      if (it?.kind === 'att') {
        // On the current gun (the gunsmith calls 'attach' with a slot).
      }
    }
    if (a.do === 'unequip' && a.slot !== undefined) {
      const g = a.slot === 2 ? l.sidearm : l.primary[a.slot];
      if (g && !bagAdd(l, { kind: 'gun', gun: g, fresh: a.slot === 2 ? l.fresh.sidearm : l.fresh.primary[a.slot] })) {
        if (a.slot === 2) l.sidearm = null; else l.primary[a.slot] = null;
        if (this.slot === a.slot) { const next = [0, 1, 2].find((s) => (s === 2 ? l.sidearm : l.primary[s])); if (next !== undefined) { this.slot = next; this.vm.setGun(this.currentGun()!); } }
      }
    }
    if (a.do === 'attach' && a.index !== undefined && a.slot !== undefined) {
      const g = a.slot === 2 ? l.sidearm : l.primary[a.slot], it = l.bag[a.index];
      if (g && it?.kind === 'att') {
        const att = it.att, slotName = (({ reddot: 'optic', holo: 'optic', acog: 'optic', scope8: 'optic', suppressor: 'muzzle', comp: 'muzzle', flashhider: 'muzzle', vgrip: 'under', agrip: 'under', laser: 'under', extmag: 'mag', fastmag: 'mag', fmj: 'ammo', ap: 'ammo', subsonic: 'ammo' }) as Record<string, 'optic' | 'muzzle' | 'under' | 'mag' | 'ammo'>)[att];
        const old = g.att[slotName];
        l.bag.splice(a.index, 1);
        g.att[slotName] = att;
        if (old) bagAdd(l, { kind: 'att', att: old, fresh: false });
        g.mag = Math.min(g.mag, gunStats(g).mag);
        if (this.slot === a.slot) this.vm.setGun(g, true);
        this.audio.reload('in');
      }
    }
    if (a.do === 'detach' && a.slot !== undefined && a.att) {
      const g = a.slot === 2 ? l.sidearm : l.primary[a.slot], slotName = a.att as 'optic' | 'muzzle' | 'under' | 'mag' | 'ammo';
      if (g?.att[slotName] && !bagAdd(l, { kind: 'att', att: g.att[slotName]!, fresh: false })) { delete g.att[slotName]; g.mag = Math.min(g.mag, gunStats(g).mag); if (this.slot === a.slot) this.vm.setGun(g, true); this.audio.reload('out'); }
    }
    this.sendInventory();
  }
  private dropItem(it: Item) {
    const P = this.player, at = new THREE.Vector3(P.body.pos.x + this.look.x * 1.2, 0, P.body.pos.z + this.look.z * 1.2);
    at.y = this.grid.ground(at.x, at.z) + 0.15;
    const g = new THREE.Group();
    const mesh = it.kind === 'gun' ? liteGun(it.gun) : new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.25), new THREE.MeshStandardMaterial({ color: 0x6b5d44, roughness: 0.8 }));
    if (it.kind === 'gun') mesh.rotation.y = Math.PI / 2;
    g.add(mesh);
    const rar = itemRarity(it);
    if (rar > 0) { const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 3, 6, 1, true).translate(0, 1.5, 0), new THREE.MeshBasicMaterial({ color: [0xa1a1aa, 0x4ade80, 0x60a5fa, 0xc084fc, 0xf59e0b][rar], transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })); g.add(beam); }
    g.position.copy(at); this.r.scene.add(g);
    this.ground.push({ item: it, g, at: at.clone().setY(at.y + 0.2) });
  }
  private pickGround(g: Ground) { if (this.gain(g.item)) { this.r.scene.remove(g.g); this.ground.splice(this.ground.indexOf(g), 1); } }

  /** Buy station purchases (paid from the cash you carry). */
  buy(id: BuyId) {
    const l = this.loadout, price = BUY[id].price;
    if (l.cash < price) { this.audio.ui('deny'); return; }
    l.cash -= price; l.freshCash = Math.min(l.freshCash, l.cash);
    const add = (it: Item) => { if (bagAdd(l, it)) this.dropItem(it); };
    if (id === 'ammo') for (const g of [...l.primary, l.sidearm]) if (g) { const pool = WEAPONS[g.base].pool; add({ kind: 'ammo', pool, n: AMMO[pool].stack }); }
    if (id === 'plates') add({ kind: 'plate', plate: 'ceramic', n: 3 });
    if (id === 'firstaid') add({ kind: 'med', med: 'firstaid', n: 1 });
    if (id === 'frag') add({ kind: 'nade', nade: 'frag', n: 1 });
    if (id === 'uav') { this.uavUntil = this.t + 40; this.cb.banner({ title: 'UAV online', sub: 'Enemies near you show on the map for 40 s', tone: 'info' }); }
    if (id === 'revive') this.selfRevive = true;
    if (id === 'mortar') { this.mortarPending = true; this.menuOpen = 'map'; this.cb.menu({ kind: 'map', mortar: true }); this.audio.ui('buy'); return; }
    if (id === 'exfil') { this.closeMenu(); this.tryExtract(true); }
    this.audio.ui('buy');
    if (this.menuOpen === 'buy') this.cb.menu({ kind: 'buy', cash: l.cash });
  }
  /** A spot picked on the map (for the mortar): x, z in metres. */
  mapPick(x: number, z: number) {
    if (!this.mortarPending) return;
    this.mortarPending = false;
    this.mortars.push(...barrage(new THREE.Vector3(x, this.grid.ground(x, z), z), this.t));
    this.radio('Fire mission received, shells inbound!', this.player.body.pos);
    this.closeMenu();
  }

  /* ── Vehicles ── */
  private enterVehicle(v: Vehicle) {
    this.vehicle = v; v.driver = 'me'; this.aiming = false; this.vm.group.visible = false; this.player.setStance('stand');
    this.cb.feed({ kind: 'info', text: 'W/S drive · A/D steer · F get out' });
  }
  private exitVehicle() {
    const v = this.vehicle; if (!v) return;
    v.driver = null; this.vehicle = null;
    const at = v.side(this.v.a);
    this.player.body.pos.set(at.x, this.grid.ground(at.x, at.z) + 0.2, at.z); this.player.body.vel.set(0, 0, 0);
    this.vm.group.visible = true; this.vm.raise();
  }
  private drive(dt: number) {
    const v = this.vehicle!, c = this.c, k = c.keys;
    const throttle = ((k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0)) || -c.stick.y;
    const steer = ((k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0)) || c.stick.x;
    const crash = v.drive(dt, throttle, steer, this.grid, (x, z) => this.player.waterAt(x, z), this.sky.night);
    if (crash === -1) this.vehicleBoom(v);
    else if (crash > 6) { v.damage(crash * 12, 'body'); this.hurtMe(Math.max(0, crash - 9) * 4, 'body', v.pos, 1); this.shake = Math.min(1, this.shake + crash / 20); this.audio.boom(0, 0, 0.3); }
    // Running soldiers over.
    if (Math.abs(v.speed) > 6) for (const f of this.squads.foes) if (!f.dead && f.active && f.pos.distanceTo(v.pos) < v.spec.width) { f.damage(500, 'body', 1, v.pos, this.t); this.killed(f, false); }
    this.player.body.pos.copy(v.pos);
    // The camera behind and above, turned with the mouse.
    const cam = this.r.camera, dist = v.kind === 'ltv' ? 9 : 6;
    this.v.a.set(Math.sin(c.yaw) * Math.cos(c.pitch), -Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch));
    const anchor = this.v.b.copy(v.pos).setY(v.pos.y + (v.kind === 'ltv' ? 2.8 : 1.8));
    const want = this.v.c.copy(anchor).addScaledVector(this.v.a, dist);
    want.y = Math.max(want.y, this.grid.ground(want.x, want.z) + 0.8);
    cam.position.lerp(want, 1 - Math.exp(-10 * dt)); cam.lookAt(anchor);
    if (Math.abs(cam.fov - 74) > 0.05) { cam.fov += (74 - cam.fov) * 0.2; cam.updateProjectionMatrix(); }
  }
  /** Enemy trucks: reinforcements and the convoy, driving their roads. */
  private aiVehicles(dt: number, night: boolean) {
    for (const tr of this.trucks) {
      const v = tr.v;
      if (v.dead) continue;
      const target = tr.path[tr.i];
      let throttle = 0, steer = 0;
      if (target) {
        const dx = target[0] - v.pos.x, dz = target[1] - v.pos.z;
        if (Math.hypot(dx, dz) < 5) tr.i++;
        const want = Math.atan2(-dx, -dz), diff = Math.atan2(Math.sin(want - v.yaw), Math.cos(want - v.yaw));
        steer = Math.max(-1, Math.min(1, -diff * 2)); throttle = Math.abs(diff) > 1 ? 0.3 : 0.75;
      }
      // Stop and get out when they arrive, or when attacked on the way.
      const attacked = v.hp < v.spec.hp * 0.95 || (v.pos.distanceTo(this.player.body.pos) < 35 && this.phase === 'raid');
      if (!tr.dropped && (!target || attacked)) {
        tr.dropped = true; throttle = 0; v.speed = 0;
        tr.squad.forEach((s, i) => { const f = this.squads.add({ ...s, x: v.pos.x + Math.cos(i * 1.6) * 3, y: v.pos.y, z: v.pos.z + Math.sin(i * 1.6) * 3 }); f.state = 'combat'; f.aware = 1; f.known.copy(this.player.body.pos); f.knownAt = this.t; f.active = true; f.op.root.visible = true; this.r.prep(f.op.root); });
        this.radio('Dismount! Dismount!', v.pos);
      }
      if (tr.dropped) throttle = 0;
      v.drive(dt, throttle, steer, this.grid, (x, z) => this.player.waterAt(x, z), night);
    }
  }

  /* ── Reinforcements, events, extraction ── */
  private callBackup(f: Foe) {
    const place = f.spawn.place;
    if (place < 0 || this.calls.has(place) || this.reserveNext >= this.m.reserves.length) return;
    this.calls.set(place, this.t + 25 + Math.random() * 20);
    this.radio(say('call'), f.pos);
  }
  private takeReserves(n: number) { const out = this.m.reserves.slice(this.reserveNext, this.reserveNext + n); this.reserveNext += out.length; return out; }
  private sendBackup(placeId: number) {
    const p = this.m.places[placeId], squad = this.takeReserves(4);
    if (!squad.length) return;
    const samsUp = this.m.places.filter((x) => x.kind === 'sam').some((x) => !this.samTaken.has(x.id));
    if (samsUp && Math.random() < 0.5) {
      const h = new Heli(true), from = new THREE.Vector3(p.x * 2.2, 80, p.z * 2.2), hover = new THREE.Vector3(p.x + 8, p.y + 18, p.z + 8);
      h.group.position.copy(from); this.r.scene.add(h.group); this.r.prep(h.group);
      this.enemyHelis.push({ h, flight: { from, to: hover, t0: this.t, dur: 18 }, hover, squad, state: 'in', t: this.t });
      this.cb.feed({ kind: 'bad', text: `Enemy helicopter inbound to ${p.name}` });
    } else {
      // A truck down the nearest road, from 150 m out.
      let road = this.m.roads[0], idx = 0, bestD = 1e9;
      for (const rd of this.m.roads) rd.pts.forEach(([x, z], i) => { const d = Math.hypot(x - p.x, z - p.z); if (d < bestD) { bestD = d; road = rd; idx = i; } });
      const back = idx > road.pts.length / 2 ? -1 : 1, start = Math.max(0, Math.min(road.pts.length - 1, idx + back * 50));
      const path = (back > 0 ? road.pts.slice(idx, start + 1).reverse() : road.pts.slice(start, idx + 1)) as [number, number][];
      const [sx, sz] = path[0] ?? [p.x + 120, p.z];
      const v = new Vehicle(900 + this.trucks.length, 'ltv', sx, sz, 0, this.grid, true); v.driver = 'ai';
      this.r.scene.add(v.group); this.r.prep(v.group);
      this.trucks.push({ v, path, i: 1, squad, place: placeId, dropped: false });
      this.cb.feed({ kind: 'bad', text: `Enemy truck moving to ${p.name}` });
    }
  }
  private eventsStep(dt: number, t: number, progress: number) {
    // Enemy helicopters: fly in, drop their squad on ropes, fly off.
    for (const e of this.enemyHelis) {
      e.h.update(dt);
      if (e.state === 'in' && flyAlong(e.h, e.flight, t) >= 1) {
        e.state = 'drop'; e.t = t;
        e.squad.forEach((s, i) => setTimeout(() => { const g = this.grid.ground(e.hover.x, e.hover.z); const f = this.squads.add({ ...s, x: e.hover.x + (i - 1.5) * 1.5, y: g, z: e.hover.z }); f.state = 'combat'; f.aware = 1; f.known.copy(this.player.body.pos); f.knownAt = this.t; f.active = true; f.op.root.visible = true; this.r.prep(f.op.root); }, 900 * i));
        this.radio('Fast rope, fast rope!', e.hover);
      }
      if (e.state === 'drop' && t - e.t > 5) { e.state = 'out'; e.flight = { from: e.h.group.position.clone(), to: e.h.group.position.clone().add(new THREE.Vector3(300, 60, 300)), t0: t, dur: 14 }; }
      if (e.state === 'out' && flyAlong(e.h, e.flight, t) >= 1) e.h.group.visible = false;
    }
    // Supply drops: a plane, a crate under a parachute, then a container worth fighting over.
    for (const d of this.drops) {
      const spec = this.m.drops[d.i];
      const elapsed = progress * ROUND_S;
      if (d.state === 'wait' && elapsed > spec.at && this.phase !== 'safehouse') {
        d.state = 'plane';
        this.cb.banner({ title: 'Supply drop inbound', sub: 'High-value loot · marked on your map', tone: 'gold' });
        this.radio('Be advised, cargo aircraft on approach with a supply drop.', this.player.body.pos);
        this.plane.group.visible = true; this.r.prep(this.plane.group);
        this.planeFlight = { from: new THREE.Vector3(spec.x - 700, 150, spec.z - 300), to: new THREE.Vector3(spec.x + 700, 150, spec.z + 300), t0: t, dur: 22 };
      }
      if (d.state === 'plane' && this.planeFlight) {
        const k = Math.min(1, (t - this.planeFlight.t0) / this.planeFlight.dur);
        this.plane.group.position.lerpVectors(this.planeFlight.from, this.planeFlight.to, k);
        this.plane.group.lookAt(this.planeFlight.to); this.plane.group.rotateY(Math.PI);
        this.plane.update(dt);
        if (k >= 0.5 && !d.chute) {
          d.chute = new Chute(); d.box = { data: { id: 10_000 + d.i, kind: 'supply', place: -1, x: spec.x, y: 0, z: spec.z, turn: 0, items: spec.items }, mesh: new ContainerMesh('supply', 0, 0, 0, 0), items: structuredClone(spec.items), searched: false };
          d.chute.group.add(d.box.mesh.group); d.y = 140; d.chute.group.position.set(spec.x, d.y, spec.z);
          this.r.scene.add(d.chute.group); this.r.prep(d.chute.group); d.state = 'fall';
        }
        if (k >= 1) this.plane.group.visible = false;
      }
      if (d.state === 'fall' && d.chute && d.box) {
        const g = this.grid.ground(spec.x, spec.z);
        d.y -= dt * 6; d.chute.group.position.set(spec.x + Math.sin(t * 0.7) * 1.5, d.y, spec.z); d.chute.group.rotation.z = Math.sin(t * 1.3) * 0.08;
        if (this.planeFlight && t - this.planeFlight.t0 < this.planeFlight.dur) { const k = (t - this.planeFlight.t0) / this.planeFlight.dur; this.plane.group.position.lerpVectors(this.planeFlight.from, this.planeFlight.to, k); this.plane.update(dt); } else this.plane.group.visible = false;
        if (d.y <= g) {
          d.state = 'down'; d.chute.canopy.visible = false;
          d.chute.group.position.set(spec.x, g, spec.z); d.chute.group.rotation.set(0, 0, 0);
          d.box.data.y = g; this.boxes.push(d.box);
          this.smokes.push({ x: spec.x, y: g + 1, z: spec.z, big: false });
          // Soldiers head for it too.
          for (const s of this.takeReserves(3)) { const f = this.squads.add({ ...s, x: spec.x + 70, y: this.grid.ground(spec.x + 70, spec.z), z: spec.z }); f.state = 'search'; f.known.set(spec.x, g, spec.z); f.knownAt = t; this.r.prep(f.op.root); }
        }
      }
    }
    // The convoy rolls out once.
    if (!this.convoyOn && progress * ROUND_S > this.m.convoy.at && this.phase !== 'safehouse') {
      this.convoyOn = true;
      const road = this.m.convoy.road;
      for (let k = 0; k < 2; k++) {
        const [x, z] = road[k * 6] ?? road[0];
        const v = new Vehicle(950 + k, 'ltv', x, z, 0, this.grid, true); v.driver = 'ai'; this.r.scene.add(v.group); this.r.prep(v.group);
        this.trucks.push({ v, path: road.slice(k * 6) as [number, number][], i: 1, squad: this.m.convoy.foes.slice(k * 3, k * 3 + 3), place: -2, dropped: false });
      }
      this.cb.banner({ title: 'Armoured convoy on the move', sub: 'Two trucks with an officer aboard', tone: 'info' });
    }
    // Mortar shells.
    for (const s of this.mortars) {
      if (!s.whistled && t > s.t - 1.2) { s.whistled = true; this.audio.whiz(this.panOf(s.at), false); }
      if (t >= s.t) { s.at.y = this.grid.ground(s.at.x, s.at.z); this.fx.boom(s.at, 1.3); this.explode(s.at, 10, 260, 'me'); }
    }
    this.mortars = this.mortars.filter((s) => t < s.t);
  }
  private planeFlight: Flight | null = null;
  tryExtract(personal = false) {
    if (this.phase !== 'raid' || this.extract.state !== 'none') return;
    const pos = this.player.body.pos;
    const lz = this.m.places.find((p) => p.kind === 'lz' && Math.hypot(p.x - pos.x, p.z - pos.z) < 14);
    if (!lz && !personal) return;
    const at = personal ? pos.clone() : new THREE.Vector3(lz!.x, this.grid.ground(lz!.x, lz!.z), lz!.z);
    this.extract = { state: 'called', at, t0: this.t, waves: 0, flight: null, lines: 0, personal };
    this.radio('Copy, extraction inbound, sixty seconds. Hold the landing zone.', pos);
    this.cb.banner({ title: 'Extraction called', sub: 'Hold the landing zone for 60 seconds', tone: 'gold' });
    this.squads.noise(at, 260, true);
  }
  private extractStep(dt: number) {
    const e = this.extract, t = this.t;
    if (e.state === 'none') return;
    const left = EXTRACT_WAIT_S - (t - e.t0);
    // Radio calls and waves of soldiers on the landing zone.
    const lines: [number, string][] = [[30, 'Thirty seconds out.'], [10, 'Ten seconds, pop smoke!']];
    if (e.lines < lines.length && left < lines[e.lines][0]) { this.radio(lines[e.lines][1], e.at); e.lines++; }
    if (e.state === 'called' && e.waves < 3 && t - e.t0 > 8 + e.waves * 16) {
      e.waves++;
      const inland = this.v.a.set(-e.at.x, 0, -e.at.z).normalize();
      for (const s of this.takeReserves(3)) {
        const x = e.at.x + inland.x * 80 + (Math.random() - 0.5) * 40, z = e.at.z + inland.z * 80 + (Math.random() - 0.5) * 40;
        const f = this.squads.add({ ...s, x, y: this.grid.ground(x, z), z }); f.state = 'combat'; f.aware = 1; f.known.copy(e.at); f.knownAt = t; f.active = true; f.op.root.visible = true; this.r.prep(f.op.root);
      }
      this.cb.feed({ kind: 'bad', text: 'Enemies moving on the landing zone!' });
    }
    if (e.state === 'called' && left <= 14 && !e.flight) {
      const out = this.v.a.set(e.at.x, 0, e.at.z).normalize();
      e.flight = { from: new THREE.Vector3(e.at.x + out.x * 320, 90, e.at.z + out.z * 320), to: new THREE.Vector3(e.at.x + 4, e.at.y + 8, e.at.z + 4), t0: t, dur: 14 };
      this.heli.group.visible = true; this.heli.doorOpen = 0; this.heli.spin = 1;
    }
    if (e.flight && e.state === 'called') { flyAlong(this.heli, e.flight, t); this.heli.update(dt); }
    if (e.state === 'called' && left <= 0) { e.state = 'landing'; e.t0 = t; this.radio('Touching down, get on board!', e.at); }
    if (e.state === 'landing') {
      this.heli.update(dt);
      const g = this.grid.ground(this.heli.group.position.x, this.heli.group.position.z) + 0.1;
      this.heli.group.position.y += (g - this.heli.group.position.y) * Math.min(1, dt * 1.3);
      this.heli.group.rotation.x *= Math.exp(-3 * dt);
      this.heli.doorOpen = Math.min(1, this.heli.doorOpen + dt * 0.7);
      if (this.heli.group.position.y - g < 0.3) { e.state = 'boarding'; e.t0 = t; }
    }
    if (e.state === 'boarding') {
      this.heli.update(dt);
      if (this.heli.group.position.distanceTo(this.player.body.pos) < 4.5) this.board();
      else if (t - e.t0 > 40) { this.radio('We can’t wait any longer, we’re leaving!', e.at); e.state = 'none'; e.flight = { from: this.heli.group.position.clone(), to: this.heli.group.position.clone().add(new THREE.Vector3(0, 120, 300)), t0: t, dur: 12 }; this.heliLeaving = true; this.insertFlight = e.flight; }
    }
  }
  private board() {
    if (this.extract.state !== 'boarding') return;
    this.phase = 'exfil'; this.exfilAt = this.t;
    this.extract.flight = { from: this.heli.group.position.clone(), to: this.heli.group.position.clone().add(new THREE.Vector3(this.heli.group.position.x * 0.6, 110, this.heli.group.position.z * 0.6)), t0: this.t + 1.5, dur: 9 };
    this.extract.state = 'none';
    this.vm.group.visible = false;
    for (const h of this.hostages) if (h.state === 'follow' && h.pos.distanceTo(this.player.body.pos) < 30) { h.state = 'saved'; h.op.root.visible = false; this.saved++; this.combat += SCORE.hostage; this.contract('hostage', 1); }
  }
  /** Back at base: what you got out is banked (the score), stored in the stash, and summed up. */
  private bank() {
    const l = this.loadout, value = freshValue(l), long = this.t - this.raidStart >= EXTRACT_MIN_S, bonus = long && value > 0 ? SCORE.extract : 0;
    this.banked += value + bonus; this.extracts++;
    this.contract('extract-value', value);
    // Valuables and spare gear into the stash; cash into the wallet; the kit stays on you.
    this.safe = loadSafehouse();
    const keep: Item[] = [];
    for (const it of l.bag) (it.kind === 'valuable' || it.kind === 'gun' || it.kind === 'att' || it.kind === 'helmet' || it.kind === 'vest' || it.kind === 'pack' || it.kind === 'key' ? this.safe.stash : keep).push(it);
    l.bag = keep;
    this.safe.stash.push(...l.secure); l.secure = [];
    this.safe.cash += l.cash; l.cash = 0;
    bankAll(l);
    this.safe.stash = this.safe.stash.slice(-60);
    this.safe.loadout = l; this.safe.extracts++; this.safe.best = Math.max(this.safe.best, value);
    saveSafehouse(this.safe);
    this.scored();
    this.cb.menu({ kind: 'summary', title: 'Extracted', lines: [['Loot banked', `$${value.toLocaleString()}`], ['Extraction bonus', bonus ? `+${bonus}` : long ? '—' : `raids under ${EXTRACT_MIN_S} s don’t earn it`], ['Kills this raid', String(this.raidKills)], ['Headshots', String(this.raidHeads)], ['Places cleared', String(this.raidCleared)], ['Hostages saved (total)', String(this.saved)]] });
    this.phase = 'safehouse'; this.phaseAt = this.t; this.heli.group.visible = false;
    this.audio.ui('buy');
  }
  /** Contracts move on; finished ones pay the safehouse wallet. */
  private contract(track: string, n: number) {
    const s = loadSafehouse();
    let paid = 0;
    for (const c of s.contracts) {
      const spec = CONTRACTS.find((x) => x.id === c.id);
      if (!spec || c.done || spec.track !== track) continue;
      c.progress = track === 'extract-value' ? Math.max(c.progress, n) : c.progress + n;
      if (c.progress >= spec.goal) { c.done = true; s.cash += spec.pay; paid += spec.pay; this.cb.banner({ title: `Contract complete: ${spec.name}`, sub: `+$${spec.pay.toLocaleString()} to your safehouse`, tone: 'gold' }); }
    }
    saveSafehouse(s);
    if (paid) this.safe = s;
  }

  /* ── The firing range (from the safehouse) ── */
  toRange() {
    if (!this.range) {
      const group = new THREE.Group(), pad = new THREE.Mesh(new THREE.BoxGeometry(30, 2, 240), new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.9 }));
      pad.position.set(560, 1, -100); group.add(pad);
      this.grid.add(new THREE.Box3(new THREE.Vector3(545, -10, -220), new THREE.Vector3(575, 2, 20)), 'concrete');
      const targets: { at: THREE.Vector3; mesh: THREE.Mesh; dist: number }[] = [];
      for (const d of [10, 25, 50, 100, 150, 200]) for (const x of [-6, 0, 6]) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc9c9c2, metalness: 0.7, roughness: 0.4 }));
        m.position.set(560 + x, 3.2, -d); group.add(m);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x333333 })); post.position.set(560 + x, 2.4, -d); group.add(post);
        targets.push({ at: m.position.clone(), mesh: m, dist: d });
      }
      this.r.scene.add(group); this.r.prep(group);
      this.range = { group, targets };
    }
    this.loadout = kitFor(this.safe);
    this.slot = this.loadout.primary[0] ? 0 : 2; this.vm.setGun(this.currentGun()!, true);
    this.player.body.pos.set(560, 2.05, 2); this.player.body.vel.set(0, 0, 0);
    this.c.yaw = 0; this.c.pitch = 0;
    this.phase = 'range'; this.hp = 100;
    this.vm.group.visible = true; this.vm.raise();
    this.cb.menu(null);
    this.cb.banner({ title: 'Offshore range', sub: 'Steel at 10–200 m · F at the start to leave', tone: 'info' });
  }
  leaveRange() { for (const g of [...this.loadout.primary, this.loadout.sidearm]) if (g) g.mag = gunStats(g).mag; this.toSafehouse(); }

  /* ── Hostages ── */
  private hostageStep(dt: number) {
    for (const h of this.hostages) {
      if (h.state === 'saved') continue;
      const op = h.op;
      if (h.state === 'follow') {
        const P = this.player.body.pos, dx = P.x - h.pos.x, dz = P.z - h.pos.z, d = Math.hypot(dx, dz);
        if (d > 30) h.pos.set(P.x - this.look.x * 3, this.grid.ground(P.x - this.look.x * 3, P.z - this.look.z * 3), P.z - this.look.z * 3);
        const sp = d > 3 ? Math.min(6.5, d) : 0;
        h.vel.set(d > 0.1 ? (dx / d) * sp : 0, 0, d > 0.1 ? (dz / d) * sp : 0);
        h.pos.addScaledVector(h.vel, dt); h.pos.y = this.grid.ground(h.pos.x, h.pos.z);
        if (sp) h.yaw = Math.atan2(dx, dz);
      } else h.vel.set(0, 0, 0);
      op.root.rotation.y = h.yaw;
      if (op.root.position.distanceTo(this.r.camera.position) < 120) { op.pose(dt, { speed: h.vel.length(), handsUp: h.state === 'held', stance: h.state === 'held' ? 'crouch' : 'stand' }); }
    }
  }

  /* ── What soldiers see of you ── */
  private view(): PlayerView {
    const P = this.player, b = P.body.pos;
    return {
      feet: b, head: P.head.clone(), chest: this.v.d.set(b.x, b.y + P.eye * 0.7, b.z).clone(), stance: P.stance, speed: P.speed,
      inBush: this.foliage.inBush(b.x, b.z), inVehicle: !!this.vehicle, alive: this.phase === 'raid',
      light: (this.sky.night ? 0.42 : 1) * (1 - this.sky.rain * 0.25) * (this.t - this.lastShot < 1.5 ? 1.6 : 1),
    };
  }
  private radio(text: string, at: THREE.Vector3) {
    const d = at.distanceTo(this.player.body.pos);
    if (d > 90 && !text.includes('extraction') && !text.includes('Overlord') && !text.includes('cargo')) return;
    if (this.t < this.feedRadioAt) return;
    this.feedRadioAt = this.t + 1.5;
    this.cb.feed({ kind: 'radio', text });
    this.audio.radio(text, d < 70 || text.length > 30);
  }
  private panOf(at: THREE.Vector3) { const v = this.v.c.subVectors(at, this.r.camera.position).normalize(); return v.dot(this.right); }
  private rotorLoud() {
    let best = 0;
    for (const h of [this.heli, ...this.enemyHelis.map((e) => e.h)]) if (h.group.visible) best = Math.max(best, 1 - h.group.position.distanceTo(this.r.camera.position) / 250);
    return Math.max(0, best);
  }

  /* ── The HUD ── */
  private hudDom() {
    const refs = this.refs(), cam = this.r.camera;
    drawCompass(refs.compass, this.c.yaw, this.m, cam.position, this.extract.state !== 'none' ? this.extract.at : null);
    if (refs.reticle) {
      const g = this.currentGun(), s = g ? gunStats(g) : null, P = this.player;
      const spread = s ? (this.aiming ? s.ads : s.hip * Math.min(1.8, 1 + this.shotN * 0.05 * (this.t - this.lastShot < 0.35 ? 1 : 0))) * (1 + P.speed / 5) : 0.04;
      refs.reticle.style.setProperty('--gap', `${Math.min(60, 4 + spread * 900).toFixed(1)}px`);
      refs.reticle.style.setProperty('opacity', this.aiming || P.sprinting || this.phase !== 'raid' && this.phase !== 'range' || this.vehicle ? '0' : '1');
    }
    // A floating card on loot you're looking at.
    if (refs.card && refs.cardText) {
      let shown = false;
      if (this.phase === 'raid' && !this.vehicle) for (const g of this.ground) {
        const d = g.at.distanceTo(cam.position); if (d > 5) continue;
        const p = this.v.a.copy(g.at).setY(g.at.y + 0.5).project(cam);
        if (p.z > 1 || Math.abs(p.x) > 0.35 || Math.abs(p.y) > 0.4) continue;
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        refs.card.style.setProperty('transform', `translate3d(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px, 0) translate(-50%, -110%)`);
        const rar = itemRarity(g.item), text = `${itemName(g.item)}|${['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'][rar]}|${itemValue(g.item)}|${rar}`;
        if (refs.cardText.dataset.v !== text) { refs.cardText.dataset.v = text; refs.cardText.dataset.rarity = String(rar); const [n, r, v] = text.split('|'); refs.cardText.textContent = `${n} · ${r} · $${Number(v).toLocaleString()}`; }
        shown = true; break;
      }
      refs.card.style.setProperty('opacity', shown ? '1' : '0');
    }
    if (this.t - this.mapAt > (this.menuOpen === 'map' ? 0.2 : 0.1)) {
      this.mapAt = this.t;
      drawMaps(refs.mini, this.menuOpen === 'map' || this.phase === 'safehouse' ? refs.big : null, {
        m: this.m, me: this.player.body.pos, yaw: this.c.yaw, t: this.t, uav: this.uavUntil > this.t, foes: this.squads.foes, cleared: this.clearedPlaces,
        extract: this.extract.state !== 'none' ? this.extract.at : null, drops: this.drops.filter((d) => d.state !== 'wait').map((d) => this.m.drops[d.i]), hostages: this.hostages.filter((h) => h.state !== 'saved').map((h) => h.pos),
        vehicles: this.vehicles.filter((v) => !v.dead).map((v) => v.pos), trucks: this.trucks.filter((x) => !x.v.dead).map((x) => x.v.pos), raid: this.phase === 'raid',
        bodies: this.boxes.filter((b) => b.data.id === -1 && b.items.length).map((b) => b.data),
      });
    }
  }
  private report() {
    const P = this.player, l = this.loadout, g = this.currentGun(), s = g ? gunStats(g) : null, t = this.t;
    let detect = 0;
    for (const f of this.squads.foes) if (f.active && !f.dead && f.state !== 'idle') detect = Math.max(detect, f.state === 'combat' ? 1 : f.aware);
    this.detect += (detect - this.detect) * 0.3;
    const h: HudState = {
      phase: this.phase, hp: Math.max(0, Math.round(this.hp)), plates: l.plates.map((p) => Math.round(p)), plateMax: l.vest ? VESTS[l.vest].plates : 0,
      bleeding: this.bleeding, fracture: this.fracture, adrenaline: Math.max(0, Math.ceil(this.adrenalineUntil - t)), nvg: this.nvg, nvgOk: !!l.helmet && HELMETS[l.helmet].nvg,
      heavy: loadoutWeight(l) > carryLimit(l), hidden: this.foliage.inBush(P.body.pos.x, P.body.pos.z) && P.stance !== 'stand', swimming: P.swimming, stamina: Math.round(P.stamina),
      gun: g && s ? { name: s.name, rarity: g.rarity, cls: s.cls, mag: g.mag, magMax: s.mag, reserve: ammoIn(l, s.pool), mode: g.mode, modes: [...WEAPONS[g.base].modes], att: Object.values(g.att).filter(Boolean) as string[] } : null,
      slot: this.slot, slots: [l.primary[0], l.primary[1], l.sidearm].map((x) => ({ name: x ? WEAPONS[x.base].name : '—', rarity: x?.rarity ?? 0 })),
      frags: bagCount(l, (it) => it.kind === 'nade' && it.nade === 'frag'), flashes: bagCount(l, (it) => it.kind === 'nade' && it.nade === 'flash'), smokes: bagCount(l, (it) => it.kind === 'nade' && it.nade === 'smoke'), support: { have: [...this.supportHave], streak: this.streak }, spares: bagCount(l, (it) => it.kind === 'plate'),
      meds: { bandage: bagCount(l, (it) => it.kind === 'med' && it.med === 'bandage'), firstaid: bagCount(l, (it) => it.kind === 'med' && it.med === 'firstaid'), adrenaline: bagCount(l, (it) => it.kind === 'med' && it.med === 'adrenaline'), splint: bagCount(l, (it) => it.kind === 'med' && it.med === 'splint') },
      cash: l.cash, fresh: freshValue(l), banked: this.banked + this.combat, kills: this.kills,
      prompt: this.phase === 'raid' || this.phase === 'range' ? this.prompt : '', objective: this.objective(),
      extract: this.extract.state !== 'none' ? { left: Math.max(0, Math.ceil(EXTRACT_WAIT_S - (t - this.extract.t0))), state: this.extract.state } : null,
      vehicle: this.vehicle ? { speed: Math.round(Math.abs(this.vehicle.speed) * 3.6), fuel: this.vehicle.fuel, hp: this.vehicle.hp / this.vehicle.spec.hp, flat: this.vehicle.flat, kind: this.vehicle.kind } : null,
      uav: Math.max(0, Math.ceil(this.uavUntil - t)), hour: this.sky.hour, rain: this.sky.rainWant > 0.5, detect: Math.round(this.detect * 20) / 20,
      aiming: this.aiming, scope: this.aiming && !!s && s.zoom >= 4, reloading: this.reloadUntil > t, selfRevive: this.selfRevive,
    };
    const key = JSON.stringify(h);
    if (key !== this.lastHud) { this.lastHud = key; this.cb.hud(h); }
  }
  private objective() {
    if (this.phase !== 'raid') return '';
    if (this.extract.state === 'called') return 'Hold the landing zone';
    if (this.extract.state === 'landing' || this.extract.state === 'boarding') return 'Get on the helicopter';
    if (this.hostages.some((h) => h.state === 'follow')) return 'Get the hostage to an extraction';
    const fresh = freshValue(this.loadout);
    if (fresh > 6000) return `Carrying $${fresh.toLocaleString()} · extract to bank it`;
    const near = this.m.places.filter((p) => ['pine', 'radar', 'harbor', 'airfield', 'dam', 'bunker'].includes(p.kind) && !this.clearedPlaces.has(p.id)).sort((a, b) => Math.hypot(a.x - this.player.body.pos.x, a.z - this.player.body.pos.z) - Math.hypot(b.x - this.player.body.pos.x, b.z - this.player.body.pos.z))[0];
    return near ? `Raid ${near.name}` : 'Loot and extract';
  }
  scored() {
    const score = this.banked + this.combat;
    if (score === this.lastScore) return;
    this.lastScore = score;
    const stats: GameStat[] = [
      { label: 'Kills', value: String(this.kills) }, { label: 'Headshots', value: `${this.kills ? Math.round((100 * this.heads) / this.kills) : 0}%` },
      { label: 'Accuracy', value: `${this.shots ? Math.round((100 * this.hits) / this.shots) : 0}%` }, { label: 'Loot extracted', value: `$${this.banked.toLocaleString()}` },
      { label: 'Extractions', value: String(this.extracts) }, { label: 'Hostages saved', value: String(this.saved) }, { label: 'Places cleared', value: String(this.cleared) },
      { label: 'Containers searched', value: String(this.searched) }, { label: 'Best find', value: this.bestFind?.name ?? '—' },
    ];
    this.cb.score(score, this.kills, stats);
  }

  dispose() {
    this.pause();
    document.removeEventListener('visibilitychange', this.vis);
    this.input.dispose(); this.c.dispose();
    try { speechSynthesis.cancel(); } catch { /* none */ }
    this.r.dispose();
  }
}

const groundY = (g: OpsGame, x: number, z: number) => g.grid.ground(x, z);

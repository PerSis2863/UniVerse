import { MAP_SIZE, groundAt, roadAt, type Container, type OpsMap } from '@/lib/play/ops';
import type { THREE } from '../world/core';
import type { Foe } from './ai';

// The HUD parts drawn straight onto the page every frame or ten times a second, never through
// React: the degree compass with markers for the places, the round minimap that turns with you
// (with a UAV's sweep), and the full island map (for picking a landing zone, a mortar target, or
// just looking). The island picture is made once from the height grid.

const POI_KINDS = ['pine', 'radar', 'harbor', 'airfield', 'dam', 'bunker', 'village'];
let island: HTMLCanvasElement | null = null, islandSeed = -1;
function islandPicture(m: OpsMap) {
  if (island && islandSeed === m.seed) return island;
  const px = 400, c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d')!, img = g.createImageData(px, px), k = MAP_SIZE / px;
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const wx = x * k - MAP_SIZE / 2, wz = y * k - MAP_SIZE / 2, h = groundAt(m.heights, wx, wz), o = (y * px + x) * 4;
    const shade = Math.max(0.6, Math.min(1.35, 1 + (groundAt(m.heights, wx - 2, wz - 2) - h) * 0.1));
    let r: number, gg: number, b: number;
    if (h < -0.3) { const d = Math.min(1, -h / 9); r = 22 - d * 8; gg = 52 - d * 18; b = 64 - d * 18; }
    else if (Math.hypot(wx - m.lake.x, wz - m.lake.z) < m.lake.r && h < m.lake.y) { r = 28; gg = 62; b = 66; }
    else if (roadAt(m, wx, wz) < 4) { r = 92; gg = 90; b = 84; }
    else if (h < 2.4) { r = 168; gg = 154; b = 116; }
    else { const hi = Math.min(1, h / 55); r = (70 + hi * 60) * shade; gg = (86 + hi * 40) * shade; b = (52 + hi * 50) * shade; }
    img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = 'rgba(28,28,26,0.8)';
  for (const p of m.places) for (const bl of p.blocks) if (bl.kind !== 'deck' && bl.kind !== 'roof') g.fillRect((bl.x - bl.w / 2 + MAP_SIZE / 2) / k, (bl.z - bl.d / 2 + MAP_SIZE / 2) / k, Math.max(1, bl.w / k), Math.max(1, bl.d / k));
  island = c; islandSeed = m.seed;
  return c;
}

/** The compass strip: 2 px per degree, markers for the places, the extraction when it's called. */
export function drawCompass(el: HTMLDivElement | null, yaw: number, m: OpsMap, at: THREE.Vector3, extract: THREE.Vector3 | null) {
  if (!el) return;
  const heading = ((-yaw * 180) / Math.PI % 360 + 360) % 360;
  const strip = el.firstElementChild as HTMLDivElement | null;
  strip?.style.setProperty('transform', `translate3d(${-(720 + heading * 2)}px, 0, 0)`);
  // Markers: one per named place, placed by bearing (the element's children after the strip).
  const marks = el.querySelectorAll<HTMLElement>('[data-mark]');
  marks.forEach((mk) => {
    const id = Number(mk.dataset.mark), p = id >= 0 ? m.places[id] : null, tx = p ? p.x : extract?.x, tz = p ? p.z : extract?.z;
    if (tx === undefined || tz === undefined || (!p && !extract)) { mk.style.setProperty('opacity', '0'); return; }
    const bearing = ((Math.atan2(tx - at.x, -(tz - at.z)) * 180) / Math.PI + 360) % 360;
    let rel = bearing - heading; rel = ((rel + 540) % 360) - 180;
    const vis = Math.abs(rel) < 70;
    mk.style.setProperty('opacity', vis ? '1' : '0');
    mk.style.setProperty('transform', `translate3d(${rel * 2}px, 0, 0)`);
    const dist = mk.querySelector('i');
    if (dist) { const d = Math.round(Math.hypot(tx - at.x, tz - at.z)); if (dist.textContent !== `${d}m`) dist.textContent = `${d}m`; }
  });
}
export const compassPlaces = (m: OpsMap) => m.places.filter((p) => POI_KINDS.includes(p.kind) || p.kind === 'lz');

export interface MapData {
  m: OpsMap; me: THREE.Vector3; yaw: number; t: number; uav: boolean; foes: Foe[]; cleared: Set<number>;
  extract: THREE.Vector3 | null; drops: { x: number; z: number }[]; hostages: THREE.Vector3[]; vehicles: THREE.Vector3[]; trucks: THREE.Vector3[]; raid: boolean; bodies: Container[];
}
export function drawMaps(mini: HTMLCanvasElement | null, big: HTMLCanvasElement | null, d: MapData) {
  const pic = islandPicture(d.m), k = pic.width / MAP_SIZE;
  if (mini) {
    const g = mini.getContext('2d')!, S = mini.width, R = S / 2, scale = S / 200; // 200 m across
    g.clearRect(0, 0, S, S);
    g.save(); g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#0b1015'; g.fillRect(0, 0, S, S);
    g.translate(R, R); g.rotate(d.yaw);
    g.globalAlpha = 0.85;
    g.drawImage(pic, -(d.me.x + MAP_SIZE / 2) * scale, -(d.me.z + MAP_SIZE / 2) * scale, MAP_SIZE * scale, MAP_SIZE * scale);
    g.globalAlpha = 1;
    void k;
    const dot = (x: number, z: number, color: string, r: number, square = false) => { const sx = (x - d.me.x) * scale, sz = (z - d.me.z) * scale; g.fillStyle = color; if (square) g.fillRect(sx - r, sz - r, r * 2, r * 2); else { g.beginPath(); g.arc(sx, sz, r, 0, Math.PI * 2); g.fill(); } };
    for (const p of d.m.places) {
      if (p.kind === 'lz') { dot(p.x, p.z, '#facc15', S * 0.03, true); continue; }
      if (POI_KINDS.includes(p.kind) || p.kind === 'sam') dot(p.x, p.z, d.cleared.has(p.id) ? '#4ade80' : '#ef4444', S * 0.024, true);
    }
    for (const k2 of d.m.kiosks) dot(k2.x, k2.z, '#34d399', S * 0.018);
    for (const v of d.vehicles) dot(v.x, v.z, '#93c5fd', S * 0.016);
    for (const v of d.trucks) dot(v.x, v.z, '#f97316', S * 0.022);
    for (const h of d.hostages) dot(h.x, h.z, '#fb923c', S * 0.02);
    for (const dr of d.drops) dot(dr.x, dr.z, '#fde047', S * 0.026);
    for (const b of d.bodies) dot(b.x, b.z, '#ffffff', S * 0.022);
    if (d.extract) dot(d.extract.x, d.extract.z, '#f43f5e', S * 0.04);
    // Soldiers: the ones that just fired (seen on the map like in the big games), or all near you while a UAV is up.
    for (const f of d.foes) if (!f.dead && f.active && (d.uav ? f.pos.distanceTo(d.me) < 180 : d.t - (f.op.root.userData.firedAt ?? -9) < 2.5)) dot(f.pos.x, f.pos.z, '#f87171', S * 0.018);
    // The UAV's sweep.
    if (d.uav) { const a = (d.t * 2) % (Math.PI * 2), grad = g.createConicGradient?.(a, 0, 0); if (grad) { grad.addColorStop(0, 'rgba(248,113,113,0.35)'); grad.addColorStop(0.12, 'rgba(248,113,113,0)'); grad.addColorStop(1, 'rgba(248,113,113,0)'); g.fillStyle = grad; g.fillRect(-R / scale * scale, -R, S, S); } }
    g.restore();
    // You: an arrow pointing up (the map turns, not you), and a view cone.
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(R, R); g.arc(R, R, R, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); g.closePath(); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(R, R - S * 0.05); g.lineTo(R + S * 0.035, R + S * 0.035); g.lineTo(R, R + S * 0.015); g.lineTo(R - S * 0.035, R + S * 0.035); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2); g.stroke();
  }
  if (big) {
    const g = big.getContext('2d')!, S = big.width, kk = S / MAP_SIZE, at = (v: number) => (v + MAP_SIZE / 2) * kk;
    g.drawImage(pic, 0, 0, S, S);
    g.textAlign = 'center'; g.font = `700 ${Math.round(S / 46)}px system-ui, sans-serif`;
    for (const p of d.m.places) {
      if (p.kind === 'ruin' || p.kind === 'wreck') continue;
      const x = at(p.x), z = at(p.z);
      if (p.kind === 'lz') { g.fillStyle = '#facc15'; g.fillRect(x - 6, z - 6, 12, 12); g.fillStyle = '#1c1917'; g.font = `900 ${Math.round(S / 60)}px system-ui`; g.fillText('H', x, z + 4); g.font = `700 ${Math.round(S / 46)}px system-ui, sans-serif`; continue; }
      g.fillStyle = d.cleared.has(p.id) ? '#4ade80' : '#ef4444'; g.beginPath(); g.arc(x, z, 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillText(p.name, x + 1, z - 10); g.fillStyle = '#f5f5f4'; g.fillText(p.name, x, z - 11);
      if (p.hostage) { g.fillStyle = '#fb923c'; g.beginPath(); g.arc(x + 10, z + 8, 4, 0, Math.PI * 2); g.fill(); }
    }
    for (const k2 of d.m.kiosks) { g.fillStyle = '#34d399'; g.fillRect(at(k2.x) - 4, at(k2.z) - 4, 8, 8); }
    for (const dr of d.drops) { g.fillStyle = '#fde047'; g.beginPath(); g.arc(at(dr.x), at(dr.z), 7, 0, Math.PI * 2); g.fill(); }
    for (const b of d.bodies) { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(at(b.x), at(b.z), 5, 0, Math.PI * 2); g.fill(); }
    if (d.extract) { g.strokeStyle = '#f43f5e'; g.lineWidth = 3; g.beginPath(); g.arc(at(d.extract.x), at(d.extract.z), 12, 0, Math.PI * 2); g.stroke(); }
    if (d.raid) {
      g.save(); g.translate(at(d.me.x), at(d.me.z)); g.rotate(-d.yaw);
      g.fillStyle = '#ffffff'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -11); g.lineTo(7, 7); g.lineTo(-7, 7); g.closePath(); g.stroke(); g.fill();
      g.restore();
    }
  }
}

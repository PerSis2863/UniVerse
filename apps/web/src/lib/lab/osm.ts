// Hyperion's OpenStreetMap roads (M576, the owner, 27 Nov: "to access and visualize geographic map data, you can use
// … OpenStreetMap"): an .osm file's drivable ways (highway=motorway … service) as roads in metres around the map's
// centre, each with its lanes (the lanes tag, or what its kind usually has) and name, for a driving scenario.

import type { RoadSpec } from './scenario';

const DRIVABLE: Record<string, number> = { motorway: 3, trunk: 2, primary: 2, secondary: 2, tertiary: 2, unclassified: 2, residential: 2, living_street: 1, service: 1, motorway_link: 1, trunk_link: 1, primary_link: 1, secondary_link: 1, tertiary_link: 1, road: 2 };
const attr = (tag: string, name: string) => new RegExp(`\\b${name}=["']([^"']*)["']`).exec(tag)?.[1];
/** The drivable roads of an OSM XML file, in metres east (x) and north (y) of the centre of its nodes (or `origin`
 *  [lat lon]); ways shorter than 2 points dropped, repeated points removed. */
export function readOSM(xml: string, o: { origin?: [number, number]; laneWidth?: number; kinds?: string[] } = {}) {
  const nodes = new Map<string, [number, number]>();
  for (const m of xml.matchAll(/<node\b[^>]*>/g)) { const id = attr(m[0], 'id'), lat = Number(attr(m[0], 'lat')), lon = Number(attr(m[0], 'lon')); if (id && Number.isFinite(lat) && Number.isFinite(lon)) nodes.set(id, [lat, lon]); }
  if (!nodes.size) throw new Error('No nodes in this OpenStreetMap file.');
  const all = [...nodes.values()], lat0 = o.origin?.[0] ?? (Math.min(...all.map((p) => p[0])) + Math.max(...all.map((p) => p[0]))) / 2, lon0 = o.origin?.[1] ?? (Math.min(...all.map((p) => p[1])) + Math.max(...all.map((p) => p[1]))) / 2;
  const R = 6371008.8, k = Math.PI / 180, toXY = ([lat, lon]: [number, number]): [number, number] => [R * (lon - lon0) * k * Math.cos(lat0 * k), R * (lat - lat0) * k];
  const roads: (RoadSpec & { kind: string; oneway: boolean })[] = [];
  for (const m of xml.matchAll(/<way\b[^>]*>([\s\S]*?)<\/way>/g)) {
    const tags: Record<string, string> = {};
    for (const t of m[1].matchAll(/<tag\b[^>]*>/g)) { const kk = attr(t[0], 'k'), vv = attr(t[0], 'v'); if (kk && vv !== undefined) tags[kk] = vv; }
    const kind = tags.highway;
    if (!kind || !(kind in DRIVABLE) || (o.kinds && !o.kinds.includes(kind))) continue;
    const pts: [number, number][] = [];
    for (const nd of m[1].matchAll(/<nd\b[^>]*>/g)) { const p = nodes.get(attr(nd[0], 'ref') ?? ''); if (!p) continue; const xy = toXY(p); const last = pts[pts.length - 1]; if (!last || Math.hypot(xy[0] - last[0], xy[1] - last[1]) > 0.5) pts.push(xy); }
    if (pts.length < 2) continue;
    const oneway = tags.oneway === 'yes' || kind === 'motorway', lanes = Math.max(1, Math.min(8, Number.parseInt(tags.lanes ?? '', 10) || DRIVABLE[kind]));
    roads.push({ centers: pts, lanes, laneWidth: o.laneWidth ?? 3.5, name: tags.name || `${kind} ${roads.length + 1}`, kind, oneway });
  }
  if (!roads.length) throw new Error('No drivable roads (highway=…) in this OpenStreetMap file.');
  return { roads, origin: [lat0, lon0] as [number, number] };
}

import { subsolar, sunPosition, sunTimes } from './travel-local';

// M336 (the owner, 19 Nov: "upgrade the map like how google maps and apple map looks … check other maps also
// which has unique features"): the maths behind the map's new layers and tools, pure so it can be tested.
// Plus Codes (Google Maps' short address for any spot), day and night on the globe (Google Earth), the sun's
// directions from a spot (the photographers' apps), walking reach along real streets (Mapbox's isochrones),
// heights from the terrain tiles and a route's climb (Komoot, Apple Maps' cycling), NASA's rain and clouds
// (Zoom Earth). Every source is free and goes straight to the browser: no Worker CPU.

type LonLat = [number, number];
const RAD = Math.PI / 180;

/** Google's Open Location Code (a "Plus Code") of a spot, to 10 digits: about 14 × 14 m. */
export function plusCode(lat: number, lon: number): string {
  const A = '23456789CFGHJMPQRVWX';
  let la = Math.min(89.99999, Math.max(-90, lat)) + 90, lo = ((((lon + 180) % 360) + 360) % 360);
  let code = '', res = 20;
  for (let i = 0; i < 5; i++) {
    const a = Math.floor(la / res), b = Math.floor(lo / res);
    code += A[a] + A[b];
    la -= a * res; lo -= b * res; res /= 20;
    if (i === 3) code += '+';
  }
  return code.slice(0, 8) + '+' + code.slice(9);
}

/** The night side of the Earth at a moment, as one polygon (clipped to the map's ±85°). */
export function nightArea(at: Date): GeoJSON.FeatureCollection {
  const s = subsolar(at), dec = Math.abs(s.lat) < 0.05 ? 0.05 : s.lat, edge: LonLat[] = [];
  for (let lon = -180; lon <= 180; lon += 2) {
    const lat = Math.atan(-Math.cos((lon - s.lon) * RAD) / Math.tan(dec * RAD)) / RAD;
    edge.push([lon, Math.max(-85, Math.min(85, lat))]);
  }
  const pole = dec > 0 ? -85 : 85; // the sun north of the equator: the south pole is in the dark
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...edge, [180, pole], [-180, pole], edge[0]]] } }] };
}

/** The point `km` from a spot along a compass bearing. */
export function destination(lat: number, lon: number, bearing: number, km: number): LonLat {
  const d = km / 6371.0088, b = bearing * RAD, p1 = lat * RAD, l1 = lon * RAD;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [l2 / RAD, p2 / RAD];
}

/** Lines from a spot to where the sun rises and sets that day, and where it is at `at` (when it's up). */
export function sunLines(lat: number, lon: number, zoom: number, at: Date, clock: (d: Date) => string): GeoJSON.FeatureCollection {
  const km = (24000 * Math.cos(lat * RAD)) / 2 ** zoom, t = sunTimes(lat, lon, at), features: GeoJSON.Feature[] = [];
  const line = (az: number, role: string, label: string) => {
    const end = destination(lat, lon, az, km);
    features.push({ type: 'Feature', properties: { role }, geometry: { type: 'LineString', coordinates: [[lon, lat], end] } });
    features.push({ type: 'Feature', properties: { role, label }, geometry: { type: 'Point', coordinates: end } });
  };
  if (t) {
    line(sunPosition(lat, lon, t.rise).azimuth, 'rise', `Sunrise ${clock(t.rise)}`);
    line(sunPosition(lat, lon, t.set).azimuth, 'set', `Sunset ${clock(t.set)}`);
  }
  const now = sunPosition(lat, lon, at);
  if (now.altitude > 0) line(now.azimuth, 'now', `Sun ${clock(at)}, ${Math.round(now.altitude)}° up`);
  return { type: 'FeatureCollection', features };
}

// ——— Heights (the free Terrain Tiles the 3D hills use: height = R·256 + G + B/256 − 32768 metres) ———

export const terrarium = (r: number, g: number, b: number) => r * 256 + g + b / 256 - 32768;

/** Which tile (and which pixel of its 256) holds a spot at a zoom. */
export function tileOf(lat: number, lon: number, z: number) {
  const n = 2 ** z, x = ((lon + 180) / 360) * n, s = Math.sin(Math.max(-85.05, Math.min(85.05, lat)) * RAD);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return { x: Math.floor(x), y: Math.floor(y), px: Math.min(255, Math.floor((x % 1) * 256)), py: Math.min(255, Math.floor((y % 1) * 256)) };
}

/** Up to `n` points evenly along a path (by distance), with how far along each is (km). */
export function samples(path: LonLat[], n = 60): { at: LonLat; km: number }[] {
  if (path.length < 2) return path.map((at) => ({ at, km: 0 }));
  const legs = path.slice(1).map((p, i) => hav(path[i], p)), total = legs.reduce((a, b) => a + b, 0), out: { at: LonLat; km: number }[] = [];
  for (let k = 0, i = 0, done = 0; k < n; k++) {
    const want = (total * k) / (n - 1);
    while (i < legs.length - 1 && done + legs[i] < want) { done += legs[i]; i++; }
    const f = legs[i] ? Math.min(1, (want - done) / legs[i]) : 0, a = path[i], b = path[i + 1];
    out.push({ at: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], km: want });
  }
  return out;
}
function hav(a: LonLat, b: LonLat) {
  const h = Math.sin(((b[1] - a[1]) * RAD) / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(((b[0] - a[0]) * RAD) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
}

/** A route's climb and descent (metres), ignoring wobbles under 3 m (the tiles' noise), and its lowest and highest. */
export function climbOf(heights: number[]) {
  let up = 0, down = 0, last = heights[0] ?? 0;
  for (const h of heights) { const d = h - last; if (Math.abs(d) >= 3) { if (d > 0) up += d; else down -= d; last = h; } }
  return { up: Math.round(up), down: Math.round(down), low: Math.round(Math.min(...heights)), high: Math.round(Math.max(...heights)) };
}

/** The zoom (≤ 12) at which a set of spots needs at most `max` tiles. */
export function tileZoom(pts: LonLat[], max = 12) {
  for (let z = 12; z > 4; z--) if (new Set(pts.map(([lon, lat]) => { const t = tileOf(lat, lon, z); return `${t.x}/${t.y}`; })).size <= max) return z;
  return 4;
}

// ——— Walking reach along real streets (FOSSGIS's public Valhalla, as the walking route uses FOSSGIS's OSRM) ———

export const REACH = [5, 10, 15] as const;
export const reachUrl = (lat: number, lon: number) =>
  `https://valhalla1.openstreetmap.de/isochrone?json=${encodeURIComponent(JSON.stringify({ locations: [{ lat: +lat.toFixed(5), lon: +lon.toFixed(5) }], costing: 'pedestrian', contours: REACH.map((time) => ({ time })), polygons: true, denoise: 0.5, generalize: 20 }))}`;
/** Valhalla's answer as the map's rings: each a polygon labelled "10 min walk", the widest first. */
export function reachOf(answer: unknown): GeoJSON.FeatureCollection | null {
  const fs = (answer as { features?: GeoJSON.Feature[] } | null)?.features;
  if (!Array.isArray(fs)) return null;
  const features = fs.filter((f) => f?.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') && Number.isFinite(Number(f.properties?.contour)))
    .map((f) => ({ type: 'Feature' as const, geometry: f.geometry, properties: { label: `${Number(f.properties!.contour)} min walk`, min: Number(f.properties!.contour) } }))
    .sort((a, b) => b.properties.min - a.properties.min);
  return features.length ? { type: 'FeatureCollection', features } : null;
}

// ——— NASA's GIBS (public domain): rain of the last hours (IMERG) and yesterday's picture from space (VIIRS) ———

const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
export const RAIN_TILES = `${GIBS}/IMERG_Precipitation_Rate/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`;
/** Yesterday (UTC): the newest day the satellites have covered all of the Earth. */
export const cloudTiles = (now: number) => `${GIBS}/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${new Date(now - 86_400_000).toISOString().slice(0, 10)}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;

/** An OpenStreetMap note at a spot: how a wrong map gets fixed (Google and Apple Maps' "Report a problem"). */
export const reportUrl = (lat: number, lon: number) => `https://www.openstreetmap.org/note/new#map=19/${lat.toFixed(5)}/${lon.toFixed(5)}`;

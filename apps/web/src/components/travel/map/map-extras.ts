import type { GeoJSONSource, Map as MLMap } from 'maplibre-gl';
import { cloudTiles, RAIN_TILES, terrarium, tileOf, tileZoom } from '@/lib/map-extras';
import { DEM } from './map-layers';

// M336: the map's new layers (Google Earth's day and night, Zoom Earth's rain and clouds, Komoot's and Apple Maps'
// trails, Google's crisis map, the photographers' sun directions), the real walking reach under the rings, Apple's
// Flyover, and heights read from the terrain tiles. The maths is in src/lib/map-extras.ts.

export type Extras = { rain: boolean; clouds: boolean; night: boolean; sun: boolean; trails: boolean; alerts: boolean };
const EMPTY = { type: 'FeatureCollection' as const, features: [] };
export const TRAILS = (kind: 'hiking' | 'cycling') => `https://tile.waymarkedtrails.org/${kind}/{z}/{x}/{y}.png`;
export const ALERT_LAYERS = ['uv-alerts', 'uv-alerts-label'];

/** Added after the map's own layers on every style load (light and dark). */
export function addExtraLayers(map: MLMap, dark: boolean, now: number) {
  const layers = map.getStyle().layers ?? [], label = layers.find((l) => l.type === 'symbol')?.id;
  const font = ((layers.find((l) => l.type === 'symbol')?.layout as { 'text-font'?: string[] } | undefined)?.['text-font']) ?? ['Noto Sans Regular'];
  const bold = font.map((f) => f.replace('Regular', 'Bold'));
  const raster = (id: string, tiles: string, maxzoom: number, attribution: string) => { if (!map.getSource(id)) map.addSource(id, { type: 'raster', tiles: [tiles], tileSize: 256, maxzoom, attribution }); };
  raster('uv-clouds', cloudTiles(now), 9, 'Clouds: NASA GIBS (VIIRS)');
  raster('uv-rain', RAIN_TILES, 6, 'Rain: NASA GIBS (IMERG)');
  raster('uv-trails-hike', TRAILS('hiking'), 17, 'Trails: Waymarked Trails (CC BY-SA)');
  raster('uv-trails-bike', TRAILS('cycling'), 17, 'Trails: Waymarked Trails (CC BY-SA)');
  for (const id of ['uv-night', 'uv-sun', 'uv-alerts']) if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY });
  const hidden = { visibility: 'none' as const };
  // Under the names, so streets and places stay readable over them.
  map.addLayer({ id: 'uv-clouds', type: 'raster', source: 'uv-clouds', layout: hidden, paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.95, 9, 0.75], 'raster-fade-duration': 250 } }, label);
  map.addLayer({ id: 'uv-night', type: 'fill', source: 'uv-night', layout: hidden, paint: { 'fill-color': '#06102e', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.42, 8, 0.25], 'fill-antialias': false } }, label);
  map.addLayer({ id: 'uv-rain', type: 'raster', source: 'uv-rain', layout: hidden, paint: { 'raster-opacity': 0.75, 'raster-fade-duration': 250, 'raster-resampling': 'linear' } }, label);
  map.addLayer({ id: 'uv-trails-bike', type: 'raster', source: 'uv-trails-bike', minzoom: 7, layout: hidden, paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 200 } }, label);
  map.addLayer({ id: 'uv-trails-hike', type: 'raster', source: 'uv-trails-hike', minzoom: 7, layout: hidden, paint: { 'raster-opacity': 0.9, 'raster-fade-duration': 200 } }, label);
  map.addLayer({ id: 'uv-rings-fill', type: 'fill', source: 'uv-rings', filter: ['!=', ['geometry-type'], 'LineString'], paint: { 'fill-color': '#0ea5e9', 'fill-opacity': 0.07 } }, 'uv-rings');
  // On top: the sun's lines (the colours of dawn, dusk and the sun) and the alerts.
  const halo = dark ? '#0b0c0e' : '#ffffff', sunColour: unknown = ['match', ['get', 'role'], 'rise', '#f59e0b', 'set', '#e11d48', '#eab308'];
  map.addLayer({ id: 'uv-sun', type: 'line', source: 'uv-sun', filter: ['==', ['geometry-type'], 'LineString'], layout: { ...hidden, 'line-cap': 'round' }, paint: { 'line-color': sunColour as never, 'line-width': 3, 'line-dasharray': ['match', ['get', 'role'], 'now', ['literal', [1, 0]], ['literal', [2, 1.5]]] as never } });
  map.addLayer({ id: 'uv-sun-label', type: 'symbol', source: 'uv-sun', filter: ['==', ['geometry-type'], 'Point'], layout: { ...hidden, 'text-field': ['get', 'label'], 'text-font': bold, 'text-size': 12, 'text-anchor': 'bottom', 'text-offset': [0, -0.4], 'text-allow-overlap': true }, paint: { 'text-color': sunColour as never, 'text-halo-color': halo, 'text-halo-width': 1.8 } });
  const level: unknown = ['match', ['get', 'level'], 'red', '#dc2626', 'orange', '#f97316', '#16a34a'];
  map.addLayer({ id: 'uv-alerts', type: 'circle', source: 'uv-alerts', layout: hidden, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 5, 8, 10], 'circle-color': level as never, 'circle-opacity': 0.9, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
  map.addLayer({ id: 'uv-alerts-label', type: 'symbol', source: 'uv-alerts', minzoom: 3, layout: { ...hidden, 'text-field': ['get', 'short'], 'text-font': bold, 'text-size': 11, 'text-anchor': 'left', 'text-offset': [1, 0], 'text-optional': true, 'text-max-width': 10 }, paint: { 'text-color': level as never, 'text-halo-color': halo, 'text-halo-width': 1.6 } });
}

export function applyExtras(map: MLMap, x: Extras) {
  const vis = (id: string, on: boolean) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
  vis('uv-clouds', x.clouds); vis('uv-rain', x.rain); vis('uv-night', x.night);
  vis('uv-trails-hike', x.trails); vis('uv-trails-bike', x.trails);
  vis('uv-sun', x.sun); vis('uv-sun-label', x.sun);
  for (const id of ALERT_LAYERS) vis(id, x.alerts);
}

export const setExtra = (map: MLMap, id: 'uv-night' | 'uv-sun' | 'uv-alerts', data: GeoJSON.FeatureCollection) => (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);

/** Heights (metres) of spots, read from the same free Terrain Tiles as the 3D hills (fetched once each, kept). */
const tiles = new Map<string, Promise<ImageData | null>>();
function tile(z: number, x: number, y: number) {
  const k = `${z}/${x}/${y}`;
  if (!tiles.has(k)) {
    if (tiles.size > 40) tiles.delete(tiles.keys().next().value!);
    tiles.set(k, fetch(DEM.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)))
      .then((r) => (r.ok ? r.blob() : null)).then((b) => (b ? createImageBitmap(b) : null))
      .then((img) => { if (!img) return null; const c = new OffscreenCanvas(256, 256), g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0); return g.getImageData(0, 0, 256, 256); })
      .catch(() => { tiles.delete(k); return null; }));
  }
  return tiles.get(k)!;
}
export async function heightsAt(pts: [number, number][]): Promise<number[] | null> {
  if (!pts.length || typeof OffscreenCanvas === 'undefined') return null;
  const z = tileZoom(pts);
  const out = await Promise.all(pts.map(async ([lon, lat]) => {
    const t = tileOf(lat, lon, z), img = await tile(z, t.x, t.y);
    if (!img) return null;
    const i = (t.py * 256 + t.px) * 4;
    return terrarium(img.data[i], img.data[i + 1], img.data[i + 2]);
  }));
  return out.some((h) => h === null) ? null : (out as number[]);
}

/** Apple Maps' Flyover: tilt over a spot and circle it slowly until the person touches the map (or `stop`). */
export function flyAround(map: MLMap, lat: number, lon: number, calm: boolean, onEnd: () => void): () => void {
  let over = false;
  const box = map.getContainer();
  const stop = () => {
    if (over) return;
    over = true; map.stop(); onEnd();
    for (const ev of ['pointerdown', 'wheel', 'keydown'] as const) box.removeEventListener(ev, stop);
  };
  for (const ev of ['pointerdown', 'wheel', 'keydown'] as const) box.addEventListener(ev, stop, { passive: true });
  const turn = () => { if (!over) map.easeTo({ bearing: map.getBearing() + 90, duration: 9000, easing: (t) => t }); };
  map.once('moveend', () => { if (over) return; if (calm) { stop(); return; } map.on('moveend', function next() { if (over) map.off('moveend', next); else turn(); }); turn(); });
  map.flyTo({ center: [lon, lat], zoom: Math.max(16.2, Math.min(17, map.getZoom())), pitch: 62, bearing: map.getBearing() - 20, duration: calm ? 0 : 2200, essential: true });
  return stop;
}

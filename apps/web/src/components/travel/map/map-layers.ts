import type { ExpressionSpecification, FilterSpecification, GeoJSONSource, Map as MLMap } from 'maplibre-gl';
import { sunPosition } from '@/lib/travel-local';
import { mapStyle } from './map-style';
import { labelColor, pinOfClass } from './pins';

// The layers UniVerse adds to Travel's map (M209) on top of OpenFreeMap's style: 3D buildings and places
// where the style has none (its dark one), the chosen kind of place, the selected place, Wikipedia's
// stories, UniVerse's reviews and a walk; M214: relief and 3D terrain, satellite pictures, public transport,
// street-level photo coverage, walking-distance rings and where I am. Added again whenever the style
// changes (light and dark). Every tile comes straight from its free source to the browser: no Worker CPU.

/** Travel's own map design (M233, map-style.ts), on OpenFreeMap's tiles. */
export const STYLE = { light: mapStyle(false), dark: mapStyle(true) } as const;
export const ACCENT = '#0ea5e9';
/** The walk's blue, as directions are drawn in Apple Maps (M233). */
const ROUTE = '#1f87ff', ROUTE_EDGE = '#0b5bd3';
const EMPTY = { type: 'FeatureCollection' as const, features: [] };
const NOTHING: ExpressionSpecification = ['==', ['get', 'class'], '__none__'];
export const SOURCES = ['uv-sel', 'uv-stories', 'uv-reviews', 'uv-walk', 'uv-rings', 'uv-me'] as const;

// M214: free sources the browser reads directly (no Worker in between): elevation for relief and 3D terrain
// (AWS's open Terrain Tiles, terrarium encoding), satellite pictures (EOX's Sentinel-2 cloudless 2016,
// CC BY 4.0, sharp to about a city block) and street-level photos (Panoramax, CC BY-SA 4.0).
export const DEM = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';
export const SATELLITE = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg';
export const STREET = 'https://api.panoramax.xyz/api/map/{z}/{x}/{y}.mvt';
export type Look = { satellite: boolean; d3: boolean; transit: boolean; street: boolean };
export type SourceId = (typeof SOURCES)[number];

/** The style's own label font (both of OpenFreeMap's styles bring theirs). */
function fontOf(map: MLMap): string[] {
  for (const l of map.getStyle().layers ?? []) {
    const f = l.type === 'symbol' ? (l.layout as Record<string, unknown> | undefined)?.['text-font'] : undefined;
    if (Array.isArray(f) && f.every((x) => typeof x === 'string')) return f as string[];
  }
  return ['Noto Sans Regular'];
}

export function addLayers(map: MLMap, dark: boolean) {
  const font = fontOf(map), bold = font.map((f) => f.replace('Regular', 'Bold')), layers = map.getStyle().layers ?? [];
  const label = layers.find((l) => l.type === 'symbol')?.id; // ours go under the street names
  for (const id of SOURCES) if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY });
  // M214: relief under the roads, satellite under the names, transit, street-level coverage.
  const firstLine = layers.find((l) => (l as { 'source-layer'?: string })['source-layer'] === 'transportation')?.id ?? label;
  if (!map.getSource('uv-dem')) map.addSource('uv-dem', { type: 'raster-dem', tiles: [DEM], tileSize: 256, maxzoom: 14, encoding: 'terrarium', attribution: 'Elevation: Terrain Tiles (AWS Open Data)' });
  if (!map.getSource('uv-dem-shade')) map.addSource('uv-dem-shade', { type: 'raster-dem', tiles: [DEM], tileSize: 256, maxzoom: 14, encoding: 'terrarium', attribution: 'Elevation: Terrain Tiles (AWS Open Data)' });
  map.addLayer({ id: 'uv-hillshade', type: 'hillshade', source: 'uv-dem-shade', paint: { 'hillshade-exaggeration': dark ? 0.45 : 0.35, 'hillshade-shadow-color': dark ? '#000000' : '#5b6472', 'hillshade-highlight-color': dark ? '#3d434c' : '#ffffff', 'hillshade-accent-color': dark ? '#11151a' : '#8d96a3' } }, firstLine);
  if (!map.getSource('uv-sat')) map.addSource('uv-sat', { type: 'raster', tiles: [SATELLITE], tileSize: 256, maxzoom: 14, attribution: 'Sentinel-2 cloudless 2016 by EOX (CC BY 4.0, modified Copernicus data)' });
  // Satellite over the style's areas (land, water, flat buildings), under its roads and names.
  const lastArea = layers.reduce((i, l, k) => (l.type === 'fill' || l.type === 'background' ? k : i), -1);
  map.addLayer({ id: 'uv-sat', type: 'raster', source: 'uv-sat', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 200, 'raster-saturation': 0.1, 'raster-contrast': 0.08 } }, layers[lastArea + 1]?.id ?? label);
  const rail: ExpressionSpecification = ['in', ['get', 'class'], ['literal', ['rail', 'transit']]];
  const kind = (sub: string[]): ExpressionSpecification => ['in', ['get', 'subclass'], ['literal', sub]];
  map.addLayer({ id: 'uv-transit', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 9, layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' }, filter: ['any', rail, ['==', ['get', 'class'], 'ferry']],
    paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 15, 4], 'line-color': ['case', kind(['subway']), dark ? '#60a5fa' : '#1d4ed8', kind(['tram', 'light_rail']), '#0d9488', kind(['monorail', 'funicular', 'narrow_gauge']), '#7c3aed', ['==', ['get', 'class'], 'ferry'], '#0891b2', dark ? '#9aa4af' : '#4b5563'] } }, label);
  map.addLayer({ id: 'uv-stations', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 12, filter: ['in', ['get', 'class'], ['literal', ['railway', 'ferry_terminal', 'harbor']]],
    layout: { visibility: 'none', 'icon-image': 'uv-pin-go', 'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 16, 0.72], 'icon-padding': 2, 'symbol-sort-key': ['get', 'rank'], 'text-field': ['step', ['zoom'], '', 13, ['coalesce', ['get', 'name_en'], ['get', 'name']]], 'text-font': font, 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true, 'text-max-width': 8 },
    paint: { 'text-color': dark ? '#e5e7eb' : '#111827', 'text-halo-color': dark ? '#0b0c0e' : '#ffffff', 'text-halo-width': 1.4 } });
  if (!map.getSource('uv-street')) map.addSource('uv-street', { type: 'vector', tiles: [STREET], minzoom: 14, maxzoom: 15, attribution: 'Street photos: Panoramax (CC BY-SA 4.0)' });
  map.addLayer({ id: 'uv-street', type: 'line', source: 'uv-street', 'source-layer': 'sequences', minzoom: 14, layout: { visibility: 'none', 'line-cap': 'round' }, paint: { 'line-color': '#f97316', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1, 18, 3], 'line-opacity': 0.7 } });
  // Walking distance rings and where I am.
  map.addLayer({ id: 'uv-rings', type: 'line', source: 'uv-rings', paint: { 'line-color': ACCENT, 'line-width': 1.5, 'line-dasharray': [2, 2], 'line-opacity': 0.9 } });
  map.addLayer({ id: 'uv-rings-label', type: 'symbol', source: 'uv-rings', layout: { 'symbol-placement': 'line', 'text-field': ['get', 'label'], 'text-font': font, 'text-size': 11 }, paint: { 'text-color': ACCENT, 'text-halo-color': dark ? '#0b0c0e' : '#ffffff', 'text-halo-width': 1.5 } });
  map.addLayer({ id: 'uv-me-area', type: 'fill', source: 'uv-me', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.12 } });
  // 3D buildings, where the style has none.
  if (!layers.some((l) => l.type === 'fill-extrusion')) {
    map.addLayer({
      id: 'uv-buildings', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
      paint: {
        'fill-extrusion-color': dark ? '#33373f' : '#d8dbe0', 'fill-extrusion-opacity': 0.92,
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, ['coalesce', ['get', 'render_height'], 8]],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      },
    }, label);
  }
  const halo = dark ? '#0b0c0e' : '#ffffff', ink = dark ? '#f4f6f8' : '#111214';
  const name: ExpressionSpecification = ['coalesce', ['get', 'name_en'], ['get', 'name']];
  /** A place's name, but a long one (over 26 letters) only from this zoom: a map's names stay a line or two. */
  const short: ExpressionSpecification = ['case', ['<=', ['length', name], 26], name, ''];
  const shortName = (from: number): ExpressionSpecification => ['step', ['zoom'], short, from, name]; // zoom only at the top
  // M236: every other place as Apple Maps shows it: a small round icon in its kind's colour with its name beside
  // it in that colour, close in only and never over anything else (M214: the map was a sea of dots). Names too
  // long for a map (some artworks' titles) are left off until very close.
  if (!layers.some((l) => (l as { 'source-layer'?: string })['source-layer'] === 'poi')) {
    const kinds = pinOfClass();
    const byKind = (value: (id: (typeof kinds)[number][1]) => string, fallback: string): ExpressionSpecification =>
      ['match', ['get', 'class'], ...kinds.flatMap(([classes, id]) => [classes, value(id)]), fallback] as unknown as ExpressionSpecification;
    map.addLayer({ id: 'uv-poi', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 15.5, filter: ['<=', ['get', 'rank'], 20],
      layout: { 'icon-image': byKind((id) => `uv-pin-${id}`, 'uv-pin-other'), 'icon-size': ['interpolate', ['linear'], ['zoom'], 15.5, 0.5, 18, 0.62], 'symbol-sort-key': ['get', 'rank'], 'icon-padding': ['interpolate', ['linear'], ['zoom'], 15.5, 10, 18, 4],
        'text-field': shortName(17), 'text-font': font, 'text-size': 11.5, 'text-anchor': 'left', 'text-justify': 'left', 'text-offset': [0.95, 0], 'text-max-width': 8, 'text-optional': true, 'text-padding': 3 },
      paint: { 'text-color': byKind((id) => labelColor(id, dark), dark ? '#aeb6c0' : '#6b6f78'), 'text-halo-color': halo, 'text-halo-width': 1.5 } });
  }
  // The chosen place: a ring under its pin.
  map.addLayer({ id: 'uv-sel', type: 'circle', source: 'uv-sel', paint: { 'circle-radius': 22, 'circle-color': 'rgba(14,165,233,0.22)', 'circle-stroke-color': ACCENT, 'circle-stroke-width': 3, 'circle-pitch-alignment': 'map' } });
  // Wikipedia's stories: book pins, below the chosen kind (which wins a crowded spot).
  map.addLayer({ id: 'uv-stories', type: 'symbol', source: 'uv-stories', layout: { 'icon-image': 'uv-pin-story', 'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 16, 0.78], 'icon-padding': 2 } });
  // The chosen kind of place: its pin and name, the notable first, none over another.
  map.addLayer({ id: 'uv-hit', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 12, filter: NOTHING,
    layout: { 'icon-image': 'uv-pin-see', 'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.62, 15, 0.85, 17, 1], 'icon-padding': ['interpolate', ['linear'], ['zoom'], 12, 14, 15, 7, 17, 3], 'symbol-sort-key': ['get', 'rank'],
      // Apple Maps' way (M233): the name beside the pin, bold, in the pin's colour (showClasses sets it).
      'text-field': ['step', ['zoom'], '', 14, short, 16.5, name], 'text-font': bold, 'text-size': 12.5, 'text-anchor': 'left', 'text-justify': 'left', 'text-offset': [1.15, 0], 'text-max-width': 9, 'text-optional': true, 'text-padding': 3 },
    paint: { 'text-color': ink, 'text-halo-color': halo, 'text-halo-width': 1.8 } });
  // UniVerse's reviews: a star pin with the average beside it, always shown.
  map.addLayer({ id: 'uv-reviews', type: 'symbol', source: 'uv-reviews', layout: { 'icon-image': 'uv-pin-review', 'icon-size': 0.9, 'icon-allow-overlap': true, 'text-field': ['get', 'label'], 'text-font': font, 'text-size': 11, 'text-offset': [1.3, 0], 'text-anchor': 'left', 'text-optional': true }, paint: { 'text-color': ink, 'text-halo-color': halo, 'text-halo-width': 1.6 } });
  // M233: the walk, drawn the way Apple Maps draws directions: one clean blue line with a darker blue edge along
  // the streets (dashed only when the walking router didn't answer and it is straight), a blue "you start here"
  // dot, numbered blue stops with their names, and the walking time in one blue bubble just above its longest stretch. Added
  // last, so above every pin.
  if (!map.hasImage('uv-bubble')) map.addImage('uv-bubble', bubbleImage(), { pixelRatio: 2, stretchX: [[28, 36]], stretchY: [[26, 30]], content: [14, 10, 50, 46] });
  const walkLine = (exact: boolean): FilterSpecification => ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'exact'], exact]];
  const width = (a: number, b: number): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], 12, a, 16, b];
  map.addLayer({ id: 'uv-walk-edge', type: 'line', source: 'uv-walk', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ROUTE_EDGE, 'line-width': width(7, 12) } });
  map.addLayer({ id: 'uv-walk-line', type: 'line', source: 'uv-walk', filter: walkLine(true), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ROUTE, 'line-width': width(4.5, 8.5) } });
  map.addLayer({ id: 'uv-walk-straight', type: 'line', source: 'uv-walk', filter: walkLine(false), layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': ROUTE, 'line-width': width(4.5, 8.5), 'line-dasharray': [1.6, 1] } });
  map.addLayer({ id: 'uv-walk-start-glow', type: 'circle', source: 'uv-walk', filter: ['==', ['get', 'role'], 'start'], paint: { 'circle-radius': 20, 'circle-color': ROUTE, 'circle-opacity': 0.2, 'circle-pitch-alignment': 'map' } });
  map.addLayer({ id: 'uv-walk-start', type: 'circle', source: 'uv-walk', filter: ['==', ['get', 'role'], 'start'], paint: { 'circle-radius': 8, 'circle-color': ROUTE, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3.5 } });
  map.addLayer({ id: 'uv-walk-stop', type: 'circle', source: 'uv-walk', filter: ['==', ['get', 'role'], 'stop'], paint: { 'circle-radius': 13, 'circle-color': ROUTE, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } });
  map.addLayer({ id: 'uv-walk-num', type: 'symbol', source: 'uv-walk', filter: ['==', ['get', 'role'], 'stop'], layout: { 'text-field': ['get', 'n'], 'text-font': bold, 'text-size': 13, 'text-allow-overlap': true, 'text-padding': 8 }, paint: { 'text-color': '#ffffff' } });
  map.addLayer({ id: 'uv-walk-name', type: 'symbol', source: 'uv-walk', filter: ['==', ['get', 'role'], 'stop'],
    layout: { 'text-field': ['get', 'name'], 'text-font': bold, 'text-size': 13.5, 'text-anchor': 'left', 'text-justify': 'left', 'text-offset': [1.4, 0], 'text-max-width': 10, 'text-optional': true, 'text-padding': 2, 'symbol-sort-key': ['get', 'order'] },
    paint: { 'text-color': ink, 'text-halo-color': halo, 'text-halo-width': 2 } });
  map.addLayer({ id: 'uv-walk-time', type: 'symbol', source: 'uv-walk', filter: ['==', ['get', 'role'], 'time'],
    layout: { 'text-field': ['get', 'label'], 'text-font': bold, 'text-size': 16, 'icon-image': 'uv-bubble', 'icon-text-fit': 'both', 'icon-text-fit-padding': [4, 9, 4, 9], 'icon-allow-overlap': true, 'text-allow-overlap': true, 'text-anchor': 'bottom', 'text-offset': [0, -0.7] },
    paint: { 'text-color': '#ffffff' } });
  map.addLayer({ id: 'uv-me-dot', type: 'circle', source: 'uv-me', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 7, 'circle-color': '#3b82f6', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } });
  // The globe when zoomed out (flat close in, as MapLibre does by itself).
  map.setProjection({ type: 'globe' });
}

/** Show places of these classes with this kind's pin (none: nothing). */
export function showClasses(map: MLMap, classes: readonly string[] | null, pin: string, color?: string) {
  const f: ExpressionSpecification = classes ? ['in', ['get', 'class'], ['literal', [...classes]]] : NOTHING;
  if (map.getLayer('uv-hit')) { map.setFilter('uv-hit', f); map.setLayoutProperty('uv-hit', 'icon-image', pin); if (color) map.setPaintProperty('uv-hit', 'text-color', color); }
  // The other places (dark style) leave the chosen ones to their pins, so no name shows twice.
  if (map.getLayer('uv-poi')) map.setFilter('uv-poi', ['all', ['<=', ['get', 'rank'], 20], ['!', f]]);
}

export const setData = (map: MLMap, id: SourceId, data: GeoJSON.FeatureCollection) => (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
export const points = (list: { lat: number; lon: number; props: Record<string, unknown> }[]): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection', features: list.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: p.props })),
});

/** Light the 3D buildings from where the sun really is at that place and time: warm low sun, a dim blue night. */
export function sunlight(map: MLMap, lat: number, lon: number, at: Date) {
  const s = sunPosition(lat, lon, at), up = s.altitude > 0;
  map.setLight({
    anchor: 'map', position: [1.2, s.azimuth, up ? Math.max(10, 90 - s.altitude) : 80],
    color: !up ? '#c3cbf2' : s.altitude < 10 ? '#ffc98f' : '#ffffff', intensity: !up ? 0.22 : s.altitude < 10 ? 0.42 : 0.32,
  });
  return s;
}

/** M214: what the map shows: satellite pictures (with the names over them, no 3D blocks), 3D terrain and
 *  buildings, transit lines and stations, street-level photo lines. */
export function applyLook(map: MLMap, look: Look) {
  const vis = (id: string, on: boolean) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
  vis('uv-sat', look.satellite);
  for (const l of map.getStyle().layers ?? []) if (l.type === 'fill-extrusion') vis(l.id, look.d3 && !look.satellite);
  for (const id of ['uv-transit', 'uv-stations']) vis(id, look.transit);
  vis('uv-hillshade', !look.satellite); // under the pictures it only costs downloads
  vis('uv-street', look.street);
  map.setTerrain(look.d3 ? { source: 'uv-dem', exaggeration: 1.3 } : null);
}

/** A sky that follows the sun there: blue by day, warm at golden hour, deep blue at night (seen when tilted). */
export function skyFor(map: MLMap, altitude: number, dark: boolean) {
  const night = altitude < -4, low = altitude < 10;
  map.setSky({
    'sky-color': night ? '#0b1230' : low ? '#f2a65a' : dark ? '#3c6fb0' : '#7fb8f0',
    'horizon-color': night ? '#1c2a5e' : low ? '#ffd7a8' : dark ? '#9cb8d8' : '#dfeeff',
    'fog-color': night ? '#0e1528' : low ? '#f7cfa3' : dark ? '#222a33' : '#e7eef6',
    'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.4,
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 8, 1, 11, 0],
  });
}

/** Rings of how far you can walk from a point in 5, 10 and 15 minutes (about 4.5 km/h along streets). */
export function rings(lat: number, lon: number): GeoJSON.FeatureCollection {
  const ring = (km: number) => Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * 2 * Math.PI;
    return [lon + (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (km / 110.57) * Math.sin(a)];
  });
  return { type: 'FeatureCollection', features: [5, 10, 15].map((min) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: ring((min / 60) * 4.5 / 1.3) }, properties: { label: `${min} min walk` } })) };
}
/** Where I am, with how sure the phone is (a circle of its accuracy). */
export function meArea(lat: number, lon: number, metres: number): GeoJSON.FeatureCollection {
  const km = Math.min(2, Math.max(0.01, metres / 1000));
  const coords = Array.from({ length: 41 }, (_, i) => { const a = (i / 40) * 2 * Math.PI; return [lon + (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (km / 110.57) * Math.sin(a)]; });
  return { type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: {} },
  ] };
}

/** M233: the time bubble: a blue rounded box with a white rim, stretched around its text (64 × 56 at 2x). */
function bubbleImage(): ImageData {
  const w = 64, h = 56, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.shadowColor = 'rgba(0,0,0,0.3)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
  g.beginPath(); g.roundRect(4, 4, w - 8, h - 10, 18); g.fillStyle = '#ffffff'; g.fill();
  g.shadowColor = 'transparent';
  g.beginPath(); g.roundRect(7, 7, w - 14, h - 16, 15); g.fillStyle = ROUTE; g.fill();
  return g.getImageData(0, 0, w, h);
}

const FADED = 0.28, BUILDINGS_FADED = 0.3; // the flat footprints at 0.7
/** M233: while a walk is shown, everything else steps back (other pins and their names, the map's own places,
 *  the 3D buildings) so the walk can be read; put back as the style had it when the walk ends. `fresh`: a new
 *  style was just loaded, so what was kept from the old one no longer applies. */
export function focusWalk(map: MLMap, on: boolean, fresh = false) {
  const m = map as MLMap & { __uvFaded?: Map<string, unknown> };
  if (fresh || !m.__uvFaded) m.__uvFaded = new Map<string, unknown>();
  const kept = m.__uvFaded;
  const set = (id: string, prop: string, value: unknown, layout = false) => {
    const k = `${id}|${prop}`, get = () => (layout ? map.getLayoutProperty(id, prop as never) : map.getPaintProperty(id, prop as never));
    const put = (v: unknown) => (layout ? map.setLayoutProperty(id, prop as never, v as never) : map.setPaintProperty(id, prop as never, v as never));
    if (on) { if (!kept.has(k)) kept.set(k, get()); put(value); }
    else if (kept.has(k)) { put(kept.get(k)); kept.delete(k); }
  };
  for (const l of map.getStyle().layers ?? []) {
    if (l.id.startsWith('uv-walk') || l.id === 'uv-me-dot' || l.id === 'uv-sel') continue;
    const placesLayer = l.id === 'uv-hit' || l.id === 'uv-stories' || l.id === 'uv-reviews' || l.id === 'uv-poi' || (l as { 'source-layer'?: string })['source-layer'] === 'poi';
    if (l.type === 'symbol' && placesLayer) { set(l.id, 'icon-opacity', FADED); set(l.id, 'text-opacity', 0); }
    // The 3D buildings step out (the flat footprints stay, under the walk): with the hills on, buildings are
    // drawn after the flat map, so even lying flat they covered the walk.
    else if (l.type === 'fill-extrusion') set(l.id, 'visibility', 'none', true);
    else if (l.type === 'fill' && l.id === 'building') set(l.id, 'fill-opacity', BUILDINGS_FADED + 0.4);
  }
}

import type { ExpressionSpecification, GeoJSONSource, Map as MLMap } from 'maplibre-gl';
import { sunPosition } from '@/lib/travel-local';

// The layers UniVerse adds to Travel's map (M209) on top of OpenFreeMap's style: 3D buildings and places
// where the style has none (its dark one), the chosen kind of place, the selected place, Wikipedia's
// stories, UniVerse's reviews and a walk. Added again whenever the style changes (light and dark).

export const STYLE = { light: 'https://tiles.openfreemap.org/styles/liberty', dark: 'https://tiles.openfreemap.org/styles/dark' } as const;
export const ACCENT = '#0ea5e9';
const EMPTY = { type: 'FeatureCollection' as const, features: [] };
const NOTHING: ExpressionSpecification = ['==', ['get', 'class'], '__none__'];
export const SOURCES = ['uv-sel', 'uv-stories', 'uv-reviews', 'uv-walk'] as const;
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
  const font = fontOf(map), layers = map.getStyle().layers ?? [];
  const label = layers.find((l) => l.type === 'symbol')?.id; // ours go under the street names
  for (const id of SOURCES) if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY });
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
  // Places, where the style shows none: a dot and a name for the notable ones.
  if (!layers.some((l) => (l as { 'source-layer'?: string })['source-layer'] === 'poi')) {
    map.addLayer({ id: 'uv-poi-dot', type: 'circle', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 14, filter: ['<=', ['get', 'rank'], 25], paint: { 'circle-radius': 3, 'circle-color': '#9aa4af', 'circle-stroke-color': '#0b0c0e', 'circle-stroke-width': 1 } });
    map.addLayer({ id: 'uv-poi-name', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 15, filter: ['<=', ['get', 'rank'], 25], layout: { 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']], 'text-font': font, 'text-size': 11, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-max-width': 8, 'text-optional': true }, paint: { 'text-color': '#c9d0d8', 'text-halo-color': '#0b0c0e', 'text-halo-width': 1.2 } });
  }
  const halo = dark ? '#0b0c0e' : '#ffffff', ink = dark ? '#f4f6f8' : '#111214';
  // The chosen kind of place, in the accent.
  map.addLayer({ id: 'uv-hit', type: 'circle', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 12, filter: NOTHING, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 16, 8], 'circle-color': ACCENT, 'circle-stroke-color': halo, 'circle-stroke-width': 2 } });
  map.addLayer({ id: 'uv-hit-name', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 14, filter: NOTHING, layout: { 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']], 'text-font': font, 'text-size': 12, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-max-width': 9, 'text-optional': true }, paint: { 'text-color': ink, 'text-halo-color': halo, 'text-halo-width': 1.5 } });
  // Wikipedia's stories: amber; UniVerse's reviews: their stars; the walk: a dashed line with numbers.
  map.addLayer({ id: 'uv-stories', type: 'circle', source: 'uv-stories', paint: { 'circle-radius': 7, 'circle-color': '#f59e0b', 'circle-stroke-color': halo, 'circle-stroke-width': 2 } });
  map.addLayer({ id: 'uv-reviews', type: 'circle', source: 'uv-reviews', paint: { 'circle-radius': 11, 'circle-color': '#10b981', 'circle-stroke-color': halo, 'circle-stroke-width': 2 } });
  map.addLayer({ id: 'uv-reviews-stars', type: 'symbol', source: 'uv-reviews', layout: { 'text-field': ['get', 'label'], 'text-font': font, 'text-size': 10, 'text-allow-overlap': true }, paint: { 'text-color': '#ffffff' } });
  map.addLayer({ id: 'uv-walk-line', type: 'line', source: 'uv-walk', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ACCENT, 'line-width': 4, 'line-dasharray': [0.6, 1.6] } });
  map.addLayer({ id: 'uv-walk-stop', type: 'circle', source: 'uv-walk', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 11, 'circle-color': ACCENT, 'circle-stroke-color': halo, 'circle-stroke-width': 2 } });
  map.addLayer({ id: 'uv-walk-num', type: 'symbol', source: 'uv-walk', filter: ['==', ['geometry-type'], 'Point'], layout: { 'text-field': ['get', 'n'], 'text-font': font, 'text-size': 12, 'text-allow-overlap': true }, paint: { 'text-color': '#ffffff' } });
  map.addLayer({ id: 'uv-sel', type: 'circle', source: 'uv-sel', paint: { 'circle-radius': 14, 'circle-color': 'rgba(14,165,233,0.18)', 'circle-stroke-color': ACCENT, 'circle-stroke-width': 3 } });
}

/** Show places of these classes in the accent (none: nothing). */
export function showClasses(map: MLMap, classes: readonly string[] | null) {
  const f: ExpressionSpecification = classes ? ['in', ['get', 'class'], ['literal', [...classes]]] : NOTHING;
  for (const id of ['uv-hit', 'uv-hit-name']) if (map.getLayer(id)) map.setFilter(id, f);
  // The plain dots and names (dark style) leave the chosen ones to the accent, so no name shows twice.
  const rest: ExpressionSpecification = ['all', ['<=', ['get', 'rank'], 25], ['!', f]];
  for (const id of ['uv-poi-dot', 'uv-poi-name']) if (map.getLayer(id)) map.setFilter(id, rest);
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

import type { ExpressionSpecification, FilterSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';

// M229 (the owner, 16 Nov 2026, showing Apple Maps: "make the whole map design like this"): Travel's own map
// design in place of OpenFreeMap's ready-made ones, drawn from the same OpenFreeMap tiles (OpenMapTiles
// schema) and fonts, straight to the browser as before. Calm land, soft green parks, clear blue water, white
// (light) or slate (dark) streets with a quiet edge, street names in small spaced capitals, district names in
// spaced capitals, towns bold. No icons of its own: the places are UniVerse's pins (pins.tsx, map-layers.ts).

const TILES = 'https://tiles.openfreemap.org/planet';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const REGULAR = ['Noto Sans Regular'], BOLD = ['Noto Sans Bold'], ITALIC = ['Noto Sans Italic'];

const LIGHT = {
  land: '#f5f2ec', urban: '#efebe3', park: '#cfe8bd', wood: '#c4e2b0', grass: '#d9edca', sand: '#f2e8c8', ice: '#ffffff',
  water: '#a8d4f4', waterLine: '#8fc5ee', building: '#e7e2d9', buildingTall: '#e2ddd3',
  minor: '#ffffff', minorEdge: '#e0dace', major: '#ffffff', majorEdge: '#d3c9ba', fast: '#fcd877', fastEdge: '#e4b94c',
  path: '#c7beae', rail: '#c6c0b6', border: '#b3a6c6',
  street: '#7b766c', district: '#8a8478', town: '#3f434b', city: '#1f2228', waterText: '#4b84b8', halo: '#ffffff',
};
const DARK: typeof LIGHT = {
  // Apple Maps' dark look: blue-slate ground, building blocks a shade lighter, deep green parks, blue water.
  land: '#2f3340', urban: '#343846', park: '#1d5240', wood: '#1a4b3a', grass: '#22503f', sand: '#454437', ice: '#4a5263',
  water: '#1f4a80', waterLine: '#2b5c99', building: '#434959', buildingTall: '#4a5163',
  minor: '#4d5364', minorEdge: '#2c303c', major: '#5a6173', majorEdge: '#2c303c', fast: '#8a774b', fastEdge: '#5e5237',
  path: '#5a6070', rail: '#565c6b', border: '#7a7596',
  street: '#bcc2ce', district: '#aab1be', town: '#dfe3ea', city: '#f4f6f9', waterText: '#8ab6e6', halo: '#272b36',
};

const name: ExpressionSpecification = ['coalesce', ['get', 'name_en'], ['get', 'name']];
const cls = (...c: string[]): ExpressionSpecification => ['in', ['get', 'class'], ['literal', c]];
const line: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
const area: ExpressionSpecification = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false];
/** A width growing with the zoom (exponential, as streets do on a real map). */
const grow = (...stops: number[]): ExpressionSpecification => ['interpolate', ['exponential', 1.5], ['zoom'], ...stops];

const SRC = { source: 'openmaptiles' } as const;
/** A road kind: its edge (under) and its fill. */
function road(id: string, f: ExpressionSpecification, fill: string, edge: string, width: ExpressionSpecification, edgeWidth: ExpressionSpecification, minzoom: number): [LayerSpecification, LayerSpecification] {
  const filter: FilterSpecification = ['all', line, f];
  return [
    { id: `${id}-edge`, type: 'line', ...SRC, 'source-layer': 'transportation', minzoom, filter, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': edge, 'line-width': edgeWidth } },
    { id, type: 'line', ...SRC, 'source-layer': 'transportation', minzoom, filter, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': fill, 'line-width': width } },
  ];
}

export function mapStyle(dark: boolean): StyleSpecification {
  const c = dark ? DARK : LIGHT;
  const minor = road('road-minor', cls('minor', 'service', 'track'), c.minor, c.minorEdge, grow(12, 0.6, 14, 2.6, 16, 7, 18, 18), grow(12, 1.2, 14, 4, 16, 9.5, 18, 21), 12);
  const major = road('road-major', cls('primary', 'secondary', 'tertiary'), c.major, c.majorEdge, grow(8, 0.6, 12, 2, 14, 4.5, 16, 10, 18, 24), grow(8, 1, 12, 3.2, 14, 6.5, 16, 12.5, 18, 27), 7);
  const fast = road('road-fast', cls('motorway', 'trunk'), c.fast, c.fastEdge, grow(5, 0.6, 10, 2, 14, 6, 16, 12, 18, 28), grow(5, 1, 10, 3, 14, 8, 16, 14.5, 18, 31), 5);
  const layers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': c.land } },
    { id: 'relief', type: 'raster', source: 'relief', maxzoom: 7, paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 0, dark ? 0.35 : 0.5, 6, 0.08], 'raster-saturation': -0.6, ...(dark ? { 'raster-brightness-max': 0.45 } : {}) } },
    { id: 'urban', type: 'fill', ...SRC, 'source-layer': 'landuse', filter: cls('residential', 'commercial', 'retail', 'industrial', 'suburb', 'neighbourhood', 'quarter'), paint: { 'fill-color': c.urban, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 13, 1] } },
    { id: 'grass', type: 'fill', ...SRC, 'source-layer': 'landcover', filter: cls('grass', 'farmland', 'scrub', 'wetland'), paint: { 'fill-color': c.grass, 'fill-opacity': 0.6 } },
    { id: 'wood', type: 'fill', ...SRC, 'source-layer': 'landcover', filter: cls('wood', 'forest'), paint: { 'fill-color': c.wood, 'fill-opacity': 0.85 } },
    { id: 'sand', type: 'fill', ...SRC, 'source-layer': 'landcover', filter: cls('sand', 'beach'), paint: { 'fill-color': c.sand } },
    { id: 'ice', type: 'fill', ...SRC, 'source-layer': 'landcover', filter: cls('ice', 'glacier'), paint: { 'fill-color': c.ice, 'fill-opacity': 0.8 } },
    { id: 'green-uses', type: 'fill', ...SRC, 'source-layer': 'landuse', filter: cls('cemetery', 'pitch', 'stadium', 'playground', 'garden'), paint: { 'fill-color': c.park, 'fill-opacity': 0.75 } },
    { id: 'park', type: 'fill', ...SRC, 'source-layer': 'park', filter: area, paint: { 'fill-color': c.park, 'fill-opacity': 0.9 } },
    { id: 'water', type: 'fill', ...SRC, 'source-layer': 'water', filter: ['all', area, ['!=', ['get', 'intermittent'], 1]], paint: { 'fill-color': c.water } },
    { id: 'waterway', type: 'line', ...SRC, 'source-layer': 'waterway', filter: line, layout: { 'line-cap': 'round' }, paint: { 'line-color': c.waterLine, 'line-width': grow(8, 0.5, 13, 1.5, 18, 6) } },
    { id: 'building', type: 'fill', ...SRC, 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': c.building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 1] } },
    { id: 'path', type: 'line', ...SRC, 'source-layer': 'transportation', minzoom: 14, filter: ['all', line, cls('path', 'pedestrian')], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.path, 'line-width': grow(14, 0.8, 18, 2.4), 'line-dasharray': [2, 1.5] } },
    { id: 'rail', type: 'line', ...SRC, 'source-layer': 'transportation', minzoom: 11, filter: ['all', line, cls('rail', 'transit')], paint: { 'line-color': c.rail, 'line-width': grow(11, 0.6, 16, 2) } },
    minor[0], major[0], fast[0], minor[1], major[1], fast[1],
    { id: 'building-3d', type: 'fill-extrusion', ...SRC, 'source-layer': 'building', minzoom: 14, filter: ['!=', ['get', 'hide_3d'], true],
      paint: { 'fill-extrusion-color': c.buildingTall, 'fill-extrusion-opacity': 0.9, 'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, ['coalesce', ['get', 'render_height'], 8]], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0] } },
    { id: 'border-country', type: 'line', ...SRC, 'source-layer': 'boundary', filter: ['all', ['<=', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': c.border, 'line-width': grow(2, 0.6, 10, 1.6), 'line-dasharray': [3, 1.5] } },
    { id: 'border-region', type: 'line', ...SRC, 'source-layer': 'boundary', minzoom: 4, filter: ['all', ['in', ['get', 'admin_level'], ['literal', [3, 4]]], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': c.border, 'line-opacity': 0.5, 'line-width': 0.8, 'line-dasharray': [2, 2] } },
    // Names: streets first (their font is the one UniVerse's own labels use), then water, then places.
    { id: 'street-names', type: 'symbol', ...SRC, 'source-layer': 'transportation_name', minzoom: 14, filter: ['all', line, ['!', cls('path', 'pedestrian', 'rail', 'transit', 'ferry')]],
      layout: { 'symbol-placement': 'line', 'text-field': name, 'text-font': REGULAR, 'text-size': grow(14, 9.5, 17, 12), 'text-transform': 'uppercase', 'text-letter-spacing': 0.1, 'text-max-angle': 30, 'text-padding': 4 },
      paint: { 'text-color': c.street, 'text-halo-color': c.halo, 'text-halo-width': 1.4 } },
    { id: 'waterway-names', type: 'symbol', ...SRC, 'source-layer': 'waterway', minzoom: 13, filter: line,
      layout: { 'symbol-placement': 'line', 'text-field': name, 'text-font': ITALIC, 'text-size': 12, 'text-letter-spacing': 0.06 }, paint: { 'text-color': c.waterText, 'text-halo-color': c.halo, 'text-halo-width': 1.2 } },
    { id: 'water-names', type: 'symbol', ...SRC, 'source-layer': 'water_name', filter: ['==', ['geometry-type'], 'Point'],
      layout: { 'text-field': name, 'text-font': ITALIC, 'text-size': ['interpolate', ['linear'], ['zoom'], 2, 11, 10, 14], 'text-max-width': 6, 'text-letter-spacing': 0.06 }, paint: { 'text-color': c.waterText, 'text-halo-color': c.halo, 'text-halo-width': 1.2 } },
    { id: 'district-names', type: 'symbol', ...SRC, 'source-layer': 'place', minzoom: 12, filter: cls('suburb', 'neighbourhood', 'quarter'),
      layout: { 'text-field': name, 'text-font': BOLD, 'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 16, 13], 'text-transform': 'uppercase', 'text-letter-spacing': 0.12, 'text-max-width': 8, 'text-padding': 6 },
      paint: { 'text-color': c.district, 'text-halo-color': c.halo, 'text-halo-width': 1.4 } },
    { id: 'village-names', type: 'symbol', ...SRC, 'source-layer': 'place', minzoom: 10, filter: cls('village', 'hamlet'),
      layout: { 'text-field': name, 'text-font': REGULAR, 'text-size': 12, 'text-max-width': 8 }, paint: { 'text-color': c.town, 'text-halo-color': c.halo, 'text-halo-width': 1.4 } },
    { id: 'town-names', type: 'symbol', ...SRC, 'source-layer': 'place', minzoom: 6, filter: cls('town'),
      layout: { 'text-field': name, 'text-font': BOLD, 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 11, 12, 15], 'text-max-width': 8 }, paint: { 'text-color': c.town, 'text-halo-color': c.halo, 'text-halo-width': 1.6 } },
    { id: 'city-names', type: 'symbol', ...SRC, 'source-layer': 'place', minzoom: 3, maxzoom: 15, filter: cls('city'),
      layout: { 'text-field': name, 'text-font': BOLD, 'text-size': ['interpolate', ['linear'], ['zoom'], 3, 11, 8, 15, 12, 19], 'text-max-width': 8, 'symbol-sort-key': ['get', 'rank'] }, paint: { 'text-color': c.city, 'text-halo-color': c.halo, 'text-halo-width': 1.8 } },
    { id: 'country-names', type: 'symbol', ...SRC, 'source-layer': 'place', maxzoom: 7, filter: cls('country'),
      layout: { 'text-field': name, 'text-font': BOLD, 'text-size': ['interpolate', ['linear'], ['zoom'], 1, 10, 6, 15], 'text-transform': 'uppercase', 'text-letter-spacing': 0.1, 'text-max-width': 7 },
      paint: { 'text-color': c.district, 'text-halo-color': c.halo, 'text-halo-width': 1.4 } },
  ];
  return {
    version: 8, glyphs: GLYPHS,
    sources: {
      openmaptiles: { type: 'vector', url: TILES },
      relief: { type: 'raster', tiles: ['https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 6 },
    },
    layers,
  };
}

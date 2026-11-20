import type { ExpressionSpecification, FilterSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';

// M233 (the owner, 16 Nov 2026, showing Apple Maps: "make the whole map design like this"): Travel's own map
// design in place of OpenFreeMap's ready-made ones, drawn from the same OpenFreeMap tiles (OpenMapTiles
// schema) and fonts, straight to the browser as before. Calm land, soft green parks, clear blue water, white
// (light) or slate (dark) streets with a quiet edge, street names in small spaced capitals, district names in
// spaced capitals, towns bold. No icons of its own: the places are UniVerse's pins (pins.tsx, map-layers.ts).

const TILES = 'https://tiles.openfreemap.org/planet';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
// M237: the labels in Inter (the site's own font, the nearest to Apple's San Francisco), made into the map's glyph
// files by scripts/map-glyphs.py (public/fonts/map). Scripts Inter lacks (Greek, Cyrillic, Arabic…) come from the map
// service's Noto Sans, through mapRequest.
const REGULAR = ['InterRegular'], BOLD = ['InterBold'];
/** The glyph ranges public/fonts/map holds (as scripts/map-glyphs.py printed them). */
const GLYPH_RANGES = new Set(['0-255', '256-511', '512-767', '768-1023', '7424-7679', '7680-7935', '8192-8447', '8448-8703', '8704-8959', '11264-11519', '42752-43007', '65024-65279']);
/** The map's requests (MapLibre's transformRequest): Inter's glyphs from the site, other scripts from Noto Sans. */
export function mapRequest(url: string): { url: string } {
  const m = /^https:\/\/tiles\.openfreemap\.org\/fonts\/(InterRegular|InterBold)\/(\d+-\d+)\.pbf$/.exec(url);
  if (!m) return { url };
  if (GLYPH_RANGES.has(m[2])) return { url: `${location.origin}/fonts/map/${m[1]}/${m[2]}.pbf` };
  return { url: `https://tiles.openfreemap.org/fonts/${m[1] === 'InterBold' ? 'Noto%20Sans%20Bold' : 'Noto%20Sans%20Regular'}/${m[2]}.pbf` };
}

const LIGHT = {
  // M236: Apple Maps' own tones (its land is #f9f5ed): warm off-white ground, soft greens, bright blue water,
  // light buildings with a fine edge, white streets, yellow motorways, tinted hospital, school and rail grounds.
  land: '#f9f5ed', urban: '#f6f1e8', park: '#cbe8bb', wood: '#bddfa9', grass: '#d8edc8', sand: '#f4ead0', ice: '#ffffff',
  water: '#94cff5', waterLine: '#94cff5', building: '#e9e5de', buildingEdge: '#d6cec2', buildingTall: '#e9e5de',
  minor: '#ffffff', minorEdge: '#e3ddd2', major: '#ffffff', majorEdge: '#d5cdbf', fast: '#fcd572', fastEdge: '#e5ac3d',
  path: '#ffffff', pathEdge: '#e4ded2', square: '#f0ece5', rail: '#c2bec8', border: '#b3a6c6',
  health: '#fbe4e2', school: '#f5ecd9', works: '#efecf0', sport: '#d3ebc6',
  street: '#6f6a62', streetMajor: '#57524b', district: '#9a9286', town: '#3f434b', city: '#1f2228', waterText: '#2f7fc0', halo: '#ffffff',
};
const DARK: typeof LIGHT = {
  // Apple Maps' dark look: blue-slate ground, building blocks a shade lighter, deep green parks, blue water.
  land: '#2f3340', urban: '#323644', park: '#1d5240', wood: '#1a4b3a', grass: '#22503f', sand: '#454437', ice: '#4a5263',
  water: '#1f4a80', waterLine: '#1f4a80', building: '#3c4252', buildingEdge: '#4a5163', buildingTall: '#4a5163',
  minor: '#4d5364', minorEdge: '#2c303c', major: '#5a6173', majorEdge: '#2c303c', fast: '#8a774b', fastEdge: '#5e5237',
  path: '#4a5060', pathEdge: '#2c303c', square: '#383d4b', rail: '#5a6070', border: '#7a7596',
  health: '#4a3a44', school: '#463f3a', works: '#363a47', sport: '#22503f',
  street: '#bcc2ce', streetMajor: '#d5dae3', district: '#aab1be', town: '#dfe3ea', city: '#f4f6f9', waterText: '#8ab6e6', halo: '#272b36',
};

const name: ExpressionSpecification = ['coalesce', ['get', 'name_en'], ['get', 'name']];
const cls = (...c: string[]): ExpressionSpecification => ['in', ['get', 'class'], ['literal', c]];
const line: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
/** Not underground (Apple doesn't draw tunnels over the streets above). */
const above: ExpressionSpecification = ['!=', ['get', 'brunnel'], 'tunnel'];
const area: ExpressionSpecification = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false];
/** A width growing with the zoom (exponential, as streets do on a real map). */
const grow = (...stops: number[]): ExpressionSpecification => ['interpolate', ['exponential', 1.5], ['zoom'], ...stops];

const SRC = { source: 'openmaptiles' } as const;
/** A road kind: its edge (under) and its fill. */
function road(id: string, f: ExpressionSpecification, fill: string, edge: string, width: ExpressionSpecification, edgeWidth: ExpressionSpecification, minzoom: number): [LayerSpecification, LayerSpecification] {
  const filter: FilterSpecification = ['all', line, above, f];
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
    { id: 'urban', type: 'fill', ...SRC, 'source-layer': 'landuse', filter: cls('residential', 'commercial', 'retail', 'suburb', 'neighbourhood', 'quarter'), paint: { 'fill-color': c.urban, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 13, 1] } },
    { id: 'health', type: 'fill', ...SRC, 'source-layer': 'landuse', minzoom: 12, filter: cls('hospital'), paint: { 'fill-color': c.health } },
    { id: 'school', type: 'fill', ...SRC, 'source-layer': 'landuse', minzoom: 12, filter: cls('school', 'university', 'college', 'kindergarten'), paint: { 'fill-color': c.school } },
    { id: 'works', type: 'fill', ...SRC, 'source-layer': 'landuse', minzoom: 12, filter: cls('railway', 'industrial', 'military'), paint: { 'fill-color': c.works } },
    { id: 'grass', type: 'fill', ...SRC, 'source-layer': 'landcover', filter: cls('grass', 'farmland', 'scrub', 'wetland'), paint: { 'fill-color': c.grass, 'fill-opacity': 0.6 } },
    { id: 'wood', type: 'fill', ...SRC, 'source-layer': 'landcover', filter: cls('wood', 'forest'), paint: { 'fill-color': c.wood, 'fill-opacity': 0.85 } },
    { id: 'sand', type: 'fill', ...SRC, 'source-layer': 'landcover', filter: cls('sand', 'beach'), paint: { 'fill-color': c.sand } },
    { id: 'ice', type: 'fill', ...SRC, 'source-layer': 'landcover', filter: cls('ice', 'glacier'), paint: { 'fill-color': c.ice, 'fill-opacity': 0.8 } },
    { id: 'green-uses', type: 'fill', ...SRC, 'source-layer': 'landuse', filter: cls('cemetery', 'pitch', 'stadium', 'playground', 'garden'), paint: { 'fill-color': c.sport } },
    { id: 'park', type: 'fill', ...SRC, 'source-layer': 'park', filter: area, paint: { 'fill-color': c.park, 'fill-opacity': 0.9 } },
    { id: 'water', type: 'fill', ...SRC, 'source-layer': 'water', filter: ['all', area, ['!=', ['get', 'intermittent'], 1]], paint: { 'fill-color': c.water } },
    { id: 'waterway', type: 'line', ...SRC, 'source-layer': 'waterway', filter: line, layout: { 'line-cap': 'round' }, paint: { 'line-color': c.waterLine, 'line-width': grow(8, 0.5, 13, 1.5, 18, 6) } },
    { id: 'building', type: 'fill', ...SRC, 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': c.building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 1] } },
    { id: 'building-edge', type: 'line', ...SRC, 'source-layer': 'building', minzoom: 15.5, paint: { 'line-color': c.buildingEdge, 'line-width': grow(15.5, 0.4, 18, 1) } },
    // Squares and pedestrian streets drawn as areas: a light grey ground.
    { id: 'square', type: 'fill', ...SRC, 'source-layer': 'transportation', minzoom: 14, filter: ['all', area, cls('path', 'pedestrian')], paint: { 'fill-color': c.square } },
    // Footpaths as Apple draws them: thin, solid and quiet (no dashes), a faint edge so they read on light ground.
    { id: 'path-edge', type: 'line', ...SRC, 'source-layer': 'transportation', minzoom: 15, filter: ['all', line, above, cls('path', 'pedestrian')], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.pathEdge, 'line-width': grow(15, 1.8, 18, 5) } },
    { id: 'path', type: 'line', ...SRC, 'source-layer': 'transportation', minzoom: 14, filter: ['all', line, above, cls('path', 'pedestrian')], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.path, 'line-width': grow(14, 0.6, 18, 3.4) } },
    { id: 'rail', type: 'line', ...SRC, 'source-layer': 'transportation', minzoom: 11, filter: ['all', line, above, cls('rail', 'transit')], paint: { 'line-color': c.rail, 'line-width': grow(11, 0.6, 16, 1.6, 18, 2.6) } },
    minor[0], major[0], fast[0], minor[1], major[1], fast[1],
    { id: 'building-3d', type: 'fill-extrusion', ...SRC, 'source-layer': 'building', minzoom: 14, filter: ['!=', ['get', 'hide_3d'], true],
      paint: { 'fill-extrusion-color': c.buildingTall, 'fill-extrusion-opacity': 0.9, 'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, ['coalesce', ['get', 'render_height'], 8]], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0] } },
    { id: 'border-country', type: 'line', ...SRC, 'source-layer': 'boundary', filter: ['all', ['<=', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': c.border, 'line-width': grow(2, 0.6, 10, 1.6), 'line-dasharray': [3, 1.5] } },
    { id: 'border-region', type: 'line', ...SRC, 'source-layer': 'boundary', minzoom: 4, filter: ['all', ['in', ['get', 'admin_level'], ['literal', [3, 4]]], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': c.border, 'line-opacity': 0.5, 'line-width': 0.8, 'line-dasharray': [2, 2] } },
    // Names: streets first (their font is the one UniVerse's own labels use), then water, then places.
    { id: 'street-names', type: 'symbol', ...SRC, 'source-layer': 'transportation_name', minzoom: 14, filter: ['all', line, ['!', cls('path', 'pedestrian', 'rail', 'transit', 'ferry')]],
      layout: { 'symbol-placement': 'line', 'text-field': name, 'text-font': REGULAR, 'text-size': grow(14, 10.5, 17, 13), 'text-max-angle': 30, 'text-padding': 4 },
      paint: { 'text-color': ['match', ['get', 'class'], ['primary', 'secondary', 'trunk', 'motorway'], c.streetMajor, c.street], 'text-halo-color': c.halo, 'text-halo-width': 1.5 } },
    { id: 'waterway-names', type: 'symbol', ...SRC, 'source-layer': 'waterway', minzoom: 13, filter: line,
      layout: { 'symbol-placement': 'line', 'text-field': name, 'text-font': REGULAR, 'text-size': 12, 'text-letter-spacing': 0.04 }, paint: { 'text-color': c.waterText, 'text-halo-color': c.halo, 'text-halo-width': 1.2 } },
    { id: 'water-names', type: 'symbol', ...SRC, 'source-layer': 'water_name', filter: ['==', ['geometry-type'], 'Point'],
      layout: { 'text-field': name, 'text-font': REGULAR, 'text-size': ['interpolate', ['linear'], ['zoom'], 2, 11, 10, 14], 'text-max-width': 6, 'text-letter-spacing': 0.04 }, paint: { 'text-color': c.waterText, 'text-halo-color': c.halo, 'text-halo-width': 1.2 } },
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

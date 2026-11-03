import { geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';

// The country outlines projected into the maps' base square (see engine.ts), as plain numbers:
// no DOM here, so a background thread can do it (world.worker.ts, M86). Projecting the 1:50m world
// took close to a second on a phone-class CPU, all of it on the page, every time a map opened or
// zoomed in; now the page only replays the finished outlines into Path2D objects (engine.ts).

export const BASE = 1024;
export const projection = geoMercator().scale(BASE / (2 * Math.PI)).translate([BASE / 2, BASE / 2]).precision(0.2);

/** Every country's outline as drawing steps (0 move, 1 line, 2 close) with their points, plus
 *  its name, box, label point and the area of its biggest piece. Country i's steps end at ends[i]. */
export interface WorldShapes {
  names: string[];
  boxes: Float64Array;
  labels: Float64Array;
  areas: Float64Array;
  steps: Uint8Array;
  points: Float64Array;
  ends: Uint32Array;
}

/** The drawing calls d3 makes for a polygon outline, written down instead of drawn. */
class Recorder {
  steps: number[] = [];
  points: number[] = [];
  moveTo(x: number, y: number) { this.steps.push(0); this.points.push(x, y); }
  lineTo(x: number, y: number) { this.steps.push(1); this.points.push(x, y); }
  closePath() { this.steps.push(2); }
  arc() { /* points only: countries have none */ }
}

export function projectWorld(topo: Topology): WorldShapes {
  const fc = feature(topo, topo.objects.countries as GeometryCollection<{ name?: string }>);
  const bounds = geoPath(projection);
  const rec = new Recorder();
  const draw = geoPath(projection, rec as unknown as CanvasRenderingContext2D);
  const countries = fc.features.filter((f) => f.id !== '010'); // no Antarctica
  const n = countries.length;
  const out = { names: [] as string[], boxes: new Float64Array(n * 4), labels: new Float64Array(n * 2), areas: new Float64Array(n), ends: new Uint32Array(n) };
  countries.forEach((f, i) => {
    draw(f);
    out.ends[i] = rec.steps.length;
    const [[x0, y0], [x1, y1]] = bounds.bounds(f);
    out.boxes.set([x0, y0, x1, y1], i * 4);
    // The label sits on the country's biggest piece (France's name in France, not off Guiana).
    const parts = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.map((coordinates) => ({ type: 'Polygon' as const, coordinates })) : [f.geometry];
    const main = parts.reduce((a, b) => (bounds.area(b) > bounds.area(a) ? b : a));
    out.labels.set(bounds.centroid(main), i * 2);
    out.areas[i] = bounds.area(main);
    out.names.push(f.properties?.name ?? '');
  });
  return { ...out, steps: Uint8Array.from(rec.steps), points: Float64Array.from(rec.points) };
}

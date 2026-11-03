import { readFileSync } from 'node:fs';
import { geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import { projection, projectWorld } from './world-shapes';

// The outlines worked out on a background thread (M86) are replayed into Path2D on the page: they
// must be exactly the calls d3 makes when it draws each country by itself.
describe('the map outlines from the background thread', () => {
  it('match what d3 draws, country by country, to the last digit', () => {
    const topo = JSON.parse(readFileSync(new URL('../../../../public/geo/world-110m.json', import.meta.url), 'utf8')) as Topology;
    const w = projectWorld(topo);
    const countries = feature(topo, topo.objects.countries as GeometryCollection).features.filter((f) => f.id !== '010');
    expect(w.names).toHaveLength(countries.length);
    expect(countries.length).toBeGreaterThan(150);
    let step = 0, pt = 0;
    countries.forEach((f, i) => {
      const drawn: number[] = [];
      geoPath(projection, { moveTo: (x: number, y: number) => drawn.push(0, x, y), lineTo: (x: number, y: number) => drawn.push(1, x, y), closePath: () => drawn.push(2), arc: () => undefined } as unknown as CanvasRenderingContext2D)(f);
      const replayed: number[] = [];
      for (; step < w.ends[i]; step++) {
        const k = w.steps[step];
        if (k === 2) replayed.push(2);
        else { replayed.push(k, w.points[pt], w.points[pt + 1]); pt += 2; }
      }
      expect(replayed).toEqual(drawn);
    });
    expect(pt).toBe(w.points.length);
  });
});

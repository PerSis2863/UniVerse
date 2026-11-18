// Travel's world of destinations (M259): every town and city of 15,000 people or more, and every capital, from
// GeoNames (CC BY 4.0) through the all-the-cities package, into public/geo/destinations.json for Travel's map.
// It also carries the Commons folder of each hand-picked place's photo (src/lib/travel-ideas.ts), so the map can draw
// it as a round picture pin from upload.wikimedia.org's small thumbnails. Run by hand when either changes, from
// apps/web, with the package unpacked somewhere outside the repo:
//   npm pack all-the-cities@3.1.0 && tar xzf all-the-cities-3.1.0.tgz   (in a scratch folder, with pbf@3 beside it)
//   npx tsx scripts/gen-destinations.mts <that folder>/package
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { IDEAS } from '../src/lib/travel-ideas';

const dir = process.argv[2];
if (!dir) throw new Error('Give the unpacked all-the-cities folder.');
const cities = createRequire(import.meta.url)(resolve(dir, 'index.js')) as { name: string; country: string; featureCode: string; population: number; loc: { coordinates: [number, number] } }[];
const round = (x: number) => Math.round(x * 100) / 100;
const places = cities
  .filter((c) => c.population >= 15_000 || c.featureCode === 'PPLC')
  .sort((a, b) => b.population - a.population)
  .map((c) => [c.name, c.country, round(c.loc.coordinates[1]), round(c.loc.coordinates[0]), Math.round(c.population / 1000)]);
// A Commons file's folder is the first one and two letters of the MD5 of its name (spaces as underscores).
const photos: Record<string, string> = {};
for (const i of IDEAS) {
  const file = (i.photo ?? i.banner)?.replace(/ /g, '_');
  if (!file || !/\.(jpe?g|png)$/i.test(file) || /disambiguation/i.test(file)) continue;
  const h = createHash('md5').update(file).digest('hex');
  photos[i.title] = `${h[0]}/${h.slice(0, 2)}/${file}`;
}
writeFileSync('public/geo/destinations.json', JSON.stringify({ source: 'GeoNames (geonames.org), CC BY 4.0, via all-the-cities 3.1.0', fields: ['name', 'country', 'lat', 'lon', 'population (thousands)'], places, photos }));
console.log(`${places.length} destinations, ${Object.keys(photos).length} photos`);

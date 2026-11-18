import { describe, expect, it } from 'vitest';
import { colour } from './render';

// M290: a shared spreadsheet's cell colours reach the version preview's HTML only as real colours.
describe('cell colours', () => {
  it('lets real colours through', () => {
    for (const c of ['#fff', '#1a2b3c', '#11223344', 'rgb(1, 2, 3)', 'rgba(1,2,3,0.5)', 'hsl(200 50% 40%)', 'red', 'rebeccapurple']) expect(colour(c)).toBe(true);
  });
  it('stops anything else', () => {
    for (const c of ['url(https://x.example/p.png)', 'red;position:fixed', 'red}body{display:none', 'expression(alert(1))', '', null, 5]) expect(colour(c)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { FileStore } from './files';
import type { Cell, Mat, Struct } from './values';

const setup = () => { let out = ''; const lab = new Lab({ out: (t) => { out += t; }, files: new FileStore() }); return { lab, out: () => out, v: (n: string) => lab.vars.get(n) }; };
const nums = (v: unknown) => [...(v as Mat).d];
const texts = (v: unknown) => (v as Cell).d.map((x) => (x as { v: string }).v);
const make = "T = table({'Ada'; 'Alan'; 'Grace'; 'Linus'}, [36; 41; 85; 54], [165; 178; 160; 180], 'VariableNames', {'Name', 'Age', 'Height'});";

describe('Hyperion: table rows and columns (M385)', () => {
  it('picks rows and columns by number, name and condition', () => {
    const { lab, v } = setup();
    lab.run(`${make} A = T(1:2, :); B = T(T.Age > 50, {'Name', 'Age'}); C = T(end, 'Height'); s = size(T); ages = T{:, 'Age'}; both = T{2:3, {'Age', 'Height'}};`);
    expect(texts((v('A') as Struct).f.get('Name'))).toEqual(['Ada', 'Alan']);
    expect([...(v('B') as Struct).f.keys()]).toEqual(['Name', 'Age']);
    expect(texts((v('B') as Struct).f.get('Name'))).toEqual(['Grace', 'Linus']);
    expect(nums((v('C') as Struct).f.get('Height'))).toEqual([180]);
    expect(nums(v('s'))).toEqual([4, 3]);
    expect(nums(v('ages'))).toEqual([36, 41, 85, 54]);
    expect(nums(v('both'))).toEqual([41, 85, 178, 160]);
  });
  it('changes, deletes, adds and renames', () => {
    const { lab, v } = setup();
    lab.run(`${make} T{2, 'Age'} = 42; T(3, :) = []; T.BMI = [22; 23; 24]; T.Properties.VariableNames{1} = 'Who'; n = T.Properties.VariableNames; U = [T; T(1, :)];`);
    const T = v('T') as Struct;
    expect(nums(T.f.get('Age'))).toEqual([36, 42, 54]);
    expect(texts(v('n'))).toEqual(['Who', 'Age', 'Height', 'BMI']);
    expect(nums((v('U') as Struct).f.get('BMI'))).toEqual([22, 23, 24, 22]);
    expect(() => lab.run('T.Bad = [1; 2];')).toThrow(/3 rows/);
  });
  it('sorts, summarises, groups and joins', () => {
    const { lab, v, out } = setup();
    lab.run(`${make} S = sortrows(T, 'Age', 'descend'); first = head(S, 2); T.Team = {'x'; 'y'; 'x'; 'y'}; G = groupsummary(T, 'Team', 'mean', 'Age'); P = table({'x'; 'y'}, {'Ann'; 'Bo'}, 'VariableNames', {'Team', 'Lead'}); J = join(T, P); summary(T)`);
    expect(texts((v('S') as Struct).f.get('Name'))).toEqual(['Grace', 'Linus', 'Alan', 'Ada']);
    expect(texts((v('first') as Struct).f.get('Name'))).toEqual(['Grace', 'Linus']);
    expect(nums((v('G') as Struct).f.get('mean_Age'))).toEqual([60.5, 47.5]);
    expect(nums((v('G') as Struct).f.get('GroupCount'))).toEqual([2, 2]);
    expect(texts((v('J') as Struct).f.get('Lead'))).toEqual(['Ann', 'Bo', 'Ann', 'Bo']);
    expect(out()).toMatch(/Age: numbers\n\s+Min 36/);
  });
  it('converts to and from cells, structs and arrays', () => {
    const { lab, v } = setup();
    lab.run("C = {1, 'a'; 2, 'b'}; T = cell2table(C, 'VariableNames', {'n', 'tag'}); back = table2cell(T); T2 = addvars(T, [10; 20], 'NewVariableNames', 'score', 'Before', 'tag'); T3 = removevars(T2, 'n'); T4 = renamevars(T3, 'score', 'points'); is = istable(T4);");
    expect([...(v('T2') as Struct).f.keys()]).toEqual(['n', 'score', 'tag']);
    expect([...(v('T4') as Struct).f.keys()]).toEqual(['points', 'tag']);
    expect((v('back') as Cell).r).toBe(2);
    expect(nums(v('is'))).toEqual([1]);
  });
});

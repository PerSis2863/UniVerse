import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Struct, type Value } from './values';
import { table } from './table';
import * as vd from './vehicle';

// Hyperion's vehicle dynamics in the language (M486): vehicle, vehicleSim, vehicleHandling, magicFormula, accelRun,
// brakingDistance. MATLAB keeps these in Vehicle Dynamics Blockset blocks (Vehicle Body 3DOF, the Magic Formula tyre);
// here a car is a plain struct and the runs are functions.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const row = (v: ArrayLike<number>) => mat(1, v.length, v);
const col = (v: ArrayLike<number>) => mat(v.length, 1, v);
const pairs = (a: Value[], from: number) => { const o = new Map<string, Value>(); for (let i = from; i < a.length; i += 2) { if (a[i]?.k !== 'str') throw new LabError('Options come as name, value pairs.'); o.set((a[i] as { v: string }).v.toLowerCase(), a[i + 1] ?? num(NaN)); } return o; };
const sfield = (s: Struct, k: string) => toMat(s.f.get(k) ?? num(NaN)).d[0];

const NUMS: [string, keyof vd.Vehicle][] = [['Mass', 'm'], ['Inertia', 'iz'], ['Lf', 'lf'], ['Lr', 'lr'], ['CgHeight', 'h'], ['Cf', 'cf'], ['Cr', 'cr'], ['Mu', 'mu'], ['Cd', 'cd'], ['Area', 'area'], ['Crr', 'crr'], ['Power', 'power'], ['MaxSteer', 'maxSteer']];
// Body roll (M486b): any of these turns it on ('Roll', true for the defaults); NaN in the struct when it's off.
type RollNum = 'track' | 'kf' | 'kr' | 'c' | 'ix' | 'hr' | 'sens';
const ROLLS: [string, RollNum][] = [['Track', 'track'], ['RollStiffFront', 'kf'], ['RollStiffRear', 'kr'], ['RollDamping', 'c'], ['RollInertia', 'ix'], ['RollCentre', 'hr'], ['LoadSensitivity', 'sens']];
const GEOM: [string, 'camber' | 'rollSteer'][] = [['CamberRoll', 'camber'], ['RollSteer', 'rollSteer']];
const pair = (x: [number, number] | undefined) => mat(1, 2, x ?? [0, 0]);
export function vehicleStruct(v: vd.Vehicle): Struct {
  const h = vd.handling(v), rg = vd.rollGradient(v);
  return { k: 'struct', f: new Map<string, Value>([['Type', str('vehicle')], ...NUMS.map(([k, f]) => [k, num(v[f] as number)] as [string, Value]), ['Drive', str(v.drive)], ['Tyre', str(v.tyre)], ...ROLLS.map(([k, f]) => [k, num(v.roll ? v.roll[f] : NaN)] as [string, Value]), ...GEOM.map(([k, f]) => [k, pair(v.roll?.[f])] as [string, Value]), ['CamberStiffness', num(v.roll?.camberStiff ?? 0)], ['Wheelbase', num(h.wheelbase)], ['UndersteerGradient', num(h.K)], ['CharacteristicSpeed', num(h.characteristic)], ['CriticalSpeed', num(h.critical)], ['RollGradient', num(rg.gradient)]]) };
}
export function vehicleOf(x: Value | undefined): vd.Vehicle {
  if (!x || x.k !== 'struct' || x.f.get('Type')?.k !== 'str' || textOf(x.f.get('Type')!) !== 'vehicle') throw new LabError("A vehicle was expected: vehicle('Mass', 1500).");
  const out = { ...vd.CAR_DEFAULT };
  for (const [k, f] of NUMS) (out as Record<string, unknown>)[f] = sfield(x, k);
  out.drive = textOf(x.f.get('Drive')!) as vd.Vehicle['drive']; out.tyre = textOf(x.f.get('Tyre')!) as vd.Vehicle['tyre'];
  if (sfield(x, 'Track') > 0) {
    const r = Object.fromEntries(ROLLS.map(([k, f]) => [f, sfield(x, k)])) as unknown as vd.Roll;
    for (const [k, f] of GEOM) { const g = x.f.get(k); if (g) { const d = toMat(g).d; if (d.length === 2 && (d[0] || d[1])) r[f] = [d[0], d[1]]; } }
    const cs = x.f.get('CamberStiffness'); if (cs && toMat(cs).d[0]) r.camberStiff = toMat(cs).d[0];
    out.roll = r;
  }
  return out;
}
def('vehicle', (a) => {
  const v = { ...vd.CAR_DEFAULT };
  for (let i = 0; i < a.length; i += 2) {
    const key = a[i]?.k === 'str' ? (a[i] as { v: string }).v.toLowerCase() : '';
    if (key === 'drive' || key === 'tyre' || key === 'tire') {
      const t = textOf(a[i + 1] ?? str('')).toLowerCase();
      if (key === 'drive') { if (!['front', 'rear', 'all'].includes(t)) throw new LabError("'Drive' is 'front', 'rear' or 'all'."); v.drive = t as vd.Vehicle['drive']; }
      else { if (!['linear', 'magic'].includes(t)) throw new LabError("'Tyre' is 'linear' or 'magic' (Pacejka's Magic Formula)."); v.tyre = t as vd.Vehicle['tyre']; }
      continue;
    }
    if (key === 'roll') { v.roll = toMat(a[i + 1] ?? num(0)).d[0] ? { ...vd.ROLL_DEFAULT } : undefined; continue; }
    // Suspension geometry (M486c): [front rear] pairs, and the camber stiffness; they need the roll model, so turn it on.
    const gh = GEOM.find(([k]) => k.toLowerCase() === key);
    if (gh) {
      const d = toMat(a[i + 1] ?? num(NaN)).d;
      if (d.length !== 2 || ![...d].every((x) => Math.abs(x) <= 1.5)) throw new LabError(`'${gh[0]}' is [front rear], each between -1.5 and 1.5 (radians per radian of roll).`);
      v.roll = { ...(v.roll ?? vd.ROLL_DEFAULT), [gh[1]]: [d[0], d[1]] };
      continue;
    }
    if (key === 'camberstiffness') {
      const x = toMat(a[i + 1] ?? num(NaN)).d[0];
      if (!(x >= 0 && x <= 0.5)) throw new LabError("'CamberStiffness' is 0 to 0.5 of the cornering stiffness (about 0.1 for car tyres).");
      v.roll = { ...(v.roll ?? vd.ROLL_DEFAULT), camberStiff: x };
      continue;
    }
    const rh = ROLLS.find(([k]) => k.toLowerCase() === key);
    if (rh) {
      const x = toMat(a[i + 1] ?? num(NaN)).d[0];
      if (!(x >= 0) || (rh[1] !== 'sens' && rh[1] !== 'hr' && !(x > 0))) throw new LabError(`'${rh[0]}' must be above 0.`);
      if (rh[1] === 'sens' && x > 0.4) throw new LabError("'LoadSensitivity' is 0 to 0.4 (0.15 is typical).");
      v.roll = { ...(v.roll ?? vd.ROLL_DEFAULT), [rh[1]]: x };
      continue;
    }
    const hit = NUMS.find(([k]) => k.toLowerCase() === key);
    if (!hit) throw new LabError(`vehicle takes ${NUMS.map(([k]) => `'${k}'`).join(', ')}, 'Drive', 'Tyre', and for body roll 'Roll' or ${ROLLS.map(([k]) => `'${k}'`).join(', ')}, with the geometry ${GEOM.map(([k]) => `'${k}'`).join(', ')}, 'CamberStiffness' (name, value pairs).`);
    const x = toMat(a[i + 1] ?? num(NaN)).d[0];
    if (!(x > 0)) throw new LabError(`'${hit[0]}' must be above 0.`);
    (v as Record<string, unknown>)[hit[1]] = x;
  }
  return [vehicleStruct(v)];
});

/** A number, a handle @(t) …, or one of the standard tests by name ('step', 'ramp', 'sinedwell'). */
function steerOf(lab: Lab, x: Value | undefined, amp: number): (t: number) => number {
  if (!x) return () => 0;
  if (x.k === 'fn') { const cache = new Map<number, number>(); return (t) => { const k = Math.round(t * 1e4); let y = cache.get(k); if (y === undefined) { y = toMat(lab.callFn(x, [num(k / 1e4)])[0], 'The steering').d[0]; cache.set(k, y); } return y; }; }
  if (x.k === 'str') {
    const name = textOf(x).toLowerCase();
    if (name === 'step') return vd.stepSteer(amp);
    if (name === 'ramp') return vd.rampSteer(amp);
    if (name === 'sinedwell') return vd.sineWithDwell(amp);
    if (name === 'fishhook') return vd.fishhook(amp);
    throw new LabError("The steering is a number, @(t) …, or 'step', 'ramp', 'sinedwell' or 'fishhook' (with 'Amplitude').");
  }
  const d = toMat(x, 'The steering').d[0];
  return () => d;
}
const timeFn = (lab: Lab, x: Value | undefined, what: string) => {
  if (!x) return undefined;
  if (x.k === 'fn') { const cache = new Map<number, number>(); return (t: number) => { const k = Math.round(t * 1e4); let y = cache.get(k); if (y === undefined) { y = toMat(lab.callFn(x, [num(k / 1e4)])[0], what).d[0]; cache.set(k, y); } return y; }; }
  const d = toMat(x, what).d[0];
  return () => d;
};

/** The car's outline (4.6 × 1.8 m about its centre of mass) at a pose. */
const outline = (x: number, y: number, psi: number, v: vd.Vehicle) => {
  const c = Math.cos(psi), s = Math.sin(psi), f = v.lf + 0.9, b = -(v.lr + 0.9), w = 0.9;
  return [[b, -w], [f, -w], [f, w], [b, w], [b, -w]].map(([u, q]) => [x + u * c - q * s, y + u * s + q * c]);
};
// The people inside after a tumble (M486g; size, seat and front airbags M486h): 'Belts' 1/0, 'Curtains' 1/0,
// 'Occupant' 'small' | 'average' | 'tall', 'Seat' 'near' | 'far' (M486m: or 'middle').
const peopleOf = (o: Map<string, Value>) => {
  const flag = (k: string) => { const x = o.get(k) ? toMat(o.get(k)!).d[0] : undefined; if (x !== undefined && x !== 0 && x !== 1) throw new LabError("'Belts' and 'Curtains' are 1 or 0."); return x; };
  const size = o.get('occupant') ? textOf(o.get('occupant')!).toLowerCase() : 'average', seat = o.get('seat') ? textOf(o.get('seat')!).toLowerCase() : undefined;
  if (!(size in vd.SIZES)) throw new LabError("'Occupant' is 'small', 'average' or 'tall'.");
  if (seat !== undefined && seat !== 'near' && seat !== 'far' && seat !== 'middle') throw new LabError("'Seat' is 'near' (the side it tips towards), 'middle' or 'far'.");
  // M486i: 'Row' 'front' (default) or 'rear'.
  const rowName = o.get('row') ? textOf(o.get('row')!).toLowerCase() : 'front';
  if (rowName !== 'front' && rowName !== 'rear') throw new LabError("'Row' is 'front' or 'rear'.");
  return { belt: flag('belts') !== 0, curtains: flag('curtains') === 1, size: size as keyof typeof vd.SIZES, seat: seat as 'near' | 'far' | 'middle' | undefined, row: rowName as 'front' | 'rear' };
};
const peopleFields = (ins: vd.Inside | null): [string, Value][] => [['HeadG', num(ins?.headG ?? 0)], ['ThrownOutAt', num(ins?.thrownOut ?? NaN)], ['PartlyOut', num(ins?.partly ? 1 : 0)], ['WindscreenCracked', num(ins?.screenCracked ?? NaN)], ['WindscreenOut', num(ins?.screenOut ?? NaN)], ['FrontAirbags', num(ins?.frontBags ?? NaN)], ['PersonHeadroom', num(ins?.headroom ?? vd.HEADROOM)],
  // M486s: arms and legs.
  ['ArmForce', num(ins?.armForce ?? 0)], ['LegForce', num(ins?.legForce ?? 0)], ['ArmOutAt', num(ins?.armOut ?? NaN)], ['ArmCrushed', num(ins?.armCrushed ? 1 : 0)], ['FootCaughtAt', num(ins?.footCaught ?? NaN)], ['HandCaughtAt', num(ins?.handCaught ?? NaN)], ['AnkleForce', num(ins?.ankleForce ?? 0)], ['WristForce', num(ins?.wristForce ?? 0)], ['Trapped', num(ins?.trapped ? 1 : 0)], ['HeldByFootAt', num(ins?.heldByFoot ?? NaN)], ['BodyCrushed', num(ins?.bodyCrushed ? 1 : 0)], ['Injury', str(ins?.risk ?? 'low')]];
// After a rollover (M486d): how many quarter turns, what it rests on, how far it slid sideways, how long.
const tumbleFields = (tb: vd.Tumble): [string, Value][] => [['Rolls', num(tb.quarters)], ['RestsOn', str(tb.rests)], ['TumbleDistance', num(tb.slid)], ['TumbleTime', num(tb.time)], ['RoofCrush', num(tb.crush)], ['Spin', num((tb.spin * 180) / Math.PI)], ['WindowsBroken', num(tb.windows.filter((x) => !Number.isNaN(x)).length)], ['PeakG', num(tb.peakG)], ['Headroom', num(tb.headroom)]];
/** The car's cross-section (wheels and roof) at a tumble's moment, for drawing from behind. */
const section = (v: vd.Vehicle, y: number, z: number, th: number) => {
  const sh = vd.shape(v), rot = (a: number, b: number) => [y + a * Math.cos(th) + b * Math.sin(th), z - a * Math.sin(th) + b * Math.cos(th)];
  return [[sh.t / 2, -v.h], [sh.roofW / 2, sh.roof - v.h], [-sh.roofW / 2, sh.roof - v.h], [-sh.t / 2, -v.h], [sh.t / 2, -v.h]].map(([a, b]) => rot(a, b));
};
// vehicleTrip(car, speed, 'Kerb', 0.15, 'Ground', 'tarmac'): sliding sideways at `speed` m/s into a kerb (or, with
// 'Kerb', 0, across the ground: 'tarmac', 'grass' or 'soil'). Drawn from behind, or [table, info].
// M486j: a head-on crash into a wall or another car, the front person with belts and airbags.
def('vehicleCrash', (a, nout, lab) => {
  if (a.length < 2) throw new LabError("vehicleCrash needs the vehicle and its speed (m/s): vehicleCrash(car, 15.6, 'Into', 'wall').");
  const v = vehicleOf(a[0]), sp = toMat(a[1]).d[0], o = pairs(a, 2);
  if (!(sp > 0 && sp <= 45)) throw new LabError('The speed is above 0 up to 45 m/s.');
  const into = o.get('into') ? textOf(o.get('into')!).toLowerCase() : 'wall', other = o.get('othermass') ? toMat(o.get('othermass')!).d[0] : undefined;
  // M486r: 'mpdb', Euro NCAP's moving barrier (a 1,400 kg trolley coming the other way at the speed, half the front in it).
  if (into !== 'wall' && into !== 'car' && into !== 'barrier' && into !== 'mpdb') throw new LabError("'Into' is 'wall', 'barrier' (Euro NCAP's soft one), 'mpdb' (its moving barrier) or 'car' (head on, both at the speed).");
  if (other !== undefined && !(other >= 100 && other <= 60000)) throw new LabError("'OtherMass' is the other vehicle's mass, 100 to 60,000 kg.");
  const flag = (k: string) => { const x = o.get(k) ? toMat(o.get(k)!).d[0] : 1; if (x !== 0 && x !== 1) throw new LabError("'Belts' and 'Airbags' are 1 or 0."); return x === 1; };
  // M486k: 'Overlap' (the share of the front that hits), 'Seat' 'front' or 'rear', 'Behind' (who sits behind the front person).
  const overlap = o.get('overlap') ? toMat(o.get('overlap')!).d[0] : into === 'mpdb' ? 0.5 : 1, seat = o.get('seat') ? textOf(o.get('seat')!).toLowerCase() : 'front', behind = o.get('behind') ? textOf(o.get('behind')!).toLowerCase() : 'none';
  if (!(overlap >= 0.1 && overlap <= 1)) throw new LabError("'Overlap' is the share of the front that hits, 0.1 to 1 (0.4 Euro NCAP's offset, 0.25 the small overlap).");
  if (seat !== 'front' && seat !== 'rear') throw new LabError("'Seat' is 'front' or 'rear'.");
  if (behind !== 'none' && behind !== 'belted' && behind !== 'unbelted') throw new LabError("'Behind' is 'none', 'belted' or 'unbelted'.");
  // M486z: 'Front' (the moving barrier's face): 'typical', 'suv', 'small', 'spread', or rows [share yFrom yTo zFrom zTo]
  // (m; y across from the car's outer side, negative counted from the other side; z up from the road).
  let front: vd.FrontPart[] | keyof typeof vd.FRONTS = 'typical';
  const fo = o.get('front');
  if (fo && fo.k === 'str') {
    const nm = textOf(fo).toLowerCase();
    if (!(nm in vd.FRONTS)) throw new LabError("'Front' is 'typical', 'suv', 'small', 'spread', or rows [share yFrom yTo zFrom zTo].");
    front = nm as keyof typeof vd.FRONTS;
  } else if (fo) {
    const m = toMat(fo), rows = m.r;
    if (m.c !== 5 || rows < 1 || rows > 12) throw new LabError("'Front' as parts is 1 to 12 rows of [share yFrom yTo zFrom zTo].");
    front = Array.from({ length: rows }, (_, i) => { const g = (k: number) => m.d[i + k * rows]; return { name: `part ${i + 1}`, share: g(0), y: [[g(1), g(2)]] as [number, number][], z: [g(3), g(4)] as [number, number] }; });
    const at = (y: number) => (y < 0 || Object.is(y, -0) ? vd.CAR_WIDTH + y : y);
    if (front.some((q) => !(q.share >= 0 && q.z[0] >= 0 && q.z[1] > q.z[0] && q.z[1] <= 1.5 && Math.abs(q.y[0][0]) <= vd.CAR_WIDTH && Math.abs(q.y[0][1]) <= vd.CAR_WIDTH && at(q.y[0][1]) > at(q.y[0][0]))) || !front.some((q) => q.share > 0)) throw new LabError("'Front' parts need shares of 0 or more (some above 0), y within the car's 1.8 m width (from below to), and z from below to, 0 to 1.5 m.");
  }
  const c = vd.frontalCrash(v, sp, { into, other, belt: flag('belts'), bags: flag('airbags'), overlap, seat, behind, front });
  const info: Struct = { k: 'struct', f: new Map<string, Value>([['WallSpeed', num(c.vEq)], ['Crush', num(c.crush)], ['BarrierCrush', num(c.barrier)], ['TrolleySpeedChange', num(c.trolleyDv)], ['OLC', num(c.olc)], ['BarrierSD', num(c.faceSD)], ['BarrierMax', num(c.faceMax)], ['BottomedOut', num(c.bottomed ? 1 : 0)], ['CompatibilityPenalty', num(c.compat)], ['CompatibilityShare2026', num(c.compatShare)], ['BarrierFace', c.face.length ? mat(c.face.length, c.face[0].length, Float64Array.from({ length: c.face.length * c.face[0].length }, (_, q) => c.face[q % c.face.length][Math.floor(q / c.face.length)])) : mat(0, 0, [])], ['SpeedChange', num(c.dv)], ['AirbagAt', num(c.bagAt)], ['AirbagLate', num(c.late ? 1 : 0)], ['BeltForce', num(c.beltPeak)], ['ChestG', num(c.chestG)], ['Travel', num(c.travelMax)], ['HitWheel', num(c.hitWheel ? 1 : 0)], ['HeadHitWheel', num(c.headHit ? 1 : 0)], ['Intrusion', num(c.intrusion)], ['SlidOffAirbag', num(c.slidOff ? 1 : 0)], ['HitFrontSeat', num(c.hitSeat ? 1 : 0)], ['BackLoad', num(c.backLoad)], ['Injury', str(c.risk)]]) };
  if (nout > 0) return [table([['Time', col(c.t)], ['CarG', col(c.carG)], ['PersonG', col(c.personG)], ['Travel', col(c.travel)]]), info];
  call(lab, 'plot', row(c.t.map((t) => t * 1000)), row(c.carG), str('LineWidth'), num(2)); call(lab, 'hold', str('on'));
  call(lab, 'plot', row(c.t.map((t) => t * 1000)), row(c.personG), str('LineWidth'), num(2)); call(lab, 'hold', str('off'));
  call(lab, 'grid', str('on')); call(lab, 'xlabel', str('time (ms)')); call(lab, 'ylabel', str('deceleration (g)'));
  call(lab, 'legend', str('car'), str('person')); call(lab, 'title', str(`Chest ${c.chestG.toFixed(0)} g, ${c.hitWheel ? 'hit the wheel' : `moved ${(c.travelMax * 100).toFixed(0)} cm`}: ${c.risk}`));
  return [];
});
// M486l: a side crash.
def('vehicleSideCrash', (a, nout, lab) => {
  if (a.length < 2) throw new LabError("vehicleSideCrash needs the vehicle and the speed (m/s): vehicleSideCrash(car, 50/3.6, 'Into', 'car').");
  const v = vehicleOf(a[0]), sp = toMat(a[1]).d[0], o = pairs(a, 2);
  if (!(sp > 0 && sp <= 30)) throw new LabError('The speed is above 0 up to 30 m/s.');
  const into = o.get('into') ? textOf(o.get('into')!).toLowerCase() : 'car', other = o.get('othermass') ? toMat(o.get('othermass')!).d[0] : undefined, seat = o.get('seat') ? textOf(o.get('seat')!).toLowerCase() : 'near';
  if (into !== 'car' && into !== 'pole') throw new LabError("'Into' is 'car' (another car into its side) or 'pole' (sliding sideways into one).");
  if (other !== undefined && !(other >= 100 && other <= 60000)) throw new LabError("'OtherMass' is the other vehicle's mass, 100 to 60,000 kg.");
  if (seat !== 'near' && seat !== 'far') throw new LabError("'Seat' is 'near' (the struck side) or 'far'.");
  const flag = (k: string, d: number) => { const x = o.get(k) ? toMat(o.get(k)!).d[0] : d; if (x !== 0 && x !== 1) throw new LabError("'Belts', 'Airbags' and 'Beside' are 1 or 0."); return x === 1; };
  // M486p: 'Angle' (degrees from square), 'HitAt' (m ahead of the centre of mass), 'Row' 'front' or 'rear'.
  const angle = o.get('angle') ? toMat(o.get('angle')!).d[0] : 0, hitAt = o.get('hitat') ? toMat(o.get('hitat')!).d[0] : undefined, seatRow = o.get('row') ? textOf(o.get('row')!).toLowerCase() : 'front';
  if (!(angle >= 0 && angle <= 60)) throw new LabError("'Angle' is degrees from square on, 0 to 60.");
  if (hitAt !== undefined && !(Math.abs(hitAt) <= 3)) throw new LabError("'HitAt' is where the blow lands, metres ahead of the centre of mass (behind: negative), up to 3.");
  if (seatRow !== 'front' && seatRow !== 'rear') throw new LabError("'Row' is 'front' or 'rear'.");
  const c = vd.sideCrash(v, sp, { into, other, belt: flag('belts', 1), bags: flag('airbags', 1), seat, beside: flag('beside', 0), angle, hitAt, row: seatRow, braked: flag('otherbraked', 0) });
  const info: Struct = { k: 'struct', f: new Map<string, Value>([['Intrusion', num(c.intrusion)], ['SpeedChange', num(c.dv)], ['AlongSpeedChange', num(c.along)], ['Spin', num(c.spin)], ['Ribs', num(c.ribs)], ['AirbagAt', num(c.bagAt)], ['ChestG', num(c.chestG)], ['HeadG', num(c.headG)], ['HeadHit', num(c.headHit ? 1 : 0)], ['PersonForce', num(c.hitPerson)], ['Injury', str(c.risk)],
    // M486q: where it slides after the blow.
    ['SlideDistance', num(c.path.distance)], ['SlideTurn', num(c.path.turned)], ['Path', table([['Time', col(c.path.t)], ['X', col(c.path.x)], ['Y', col(c.path.y)], ['Turn', col(c.path.psi)]])],
    // M486t: the car that hit it, in the same picture (a pole: none).
    // M486w: touching again.
    ...(c.striker ? [['SecondTouchAt', num(c.second?.t ?? NaN)], ['SecondClosingSpeed', num(c.second?.closing ?? 0)], ['SecondSpeedChange', num(c.second?.dv ?? 0)], ['SecondSpin', num(c.second?.spin ?? 0)], ['Touches', num(c.touches)]] as [string, Value][] : []),
    ...(c.striker ? [['StrikerDistance', num(c.striker.distance)], ['StrikerTurn', num(c.striker.turned)], ['StrikerPath', table([['Time', col(c.striker.t)], ['X', col(c.striker.x)], ['Y', col(c.striker.y)], ['Turn', col(c.striker.psi)]])]] as [string, Value][] : [])]) };
  if (nout > 0) return [table([['Time', col(c.t)], ['CarG', col(c.carG)], ['PersonG', col(c.personG)], ['Gap', col(c.gap)]]), info];
  call(lab, 'plot', row(c.t.map((t) => t * 1000)), row(c.carG), str('LineWidth'), num(2)); call(lab, 'hold', str('on'));
  call(lab, 'plot', row(c.t.map((t) => t * 1000)), row(c.personG), str('LineWidth'), num(2)); call(lab, 'hold', str('off'));
  call(lab, 'grid', str('on')); call(lab, 'xlabel', str('time (ms)')); call(lab, 'ylabel', str('sideways push (g)'));
  call(lab, 'legend', str('car'), str('person')); call(lab, 'title', str(`Side crash: chest ${c.chestG.toFixed(0)} g, head ${c.headG.toFixed(0)} g: ${c.risk}`));
  return [];
});
def('vehicleTrip', (a, nout, lab) => {
  if (a.length < 2) throw new LabError("vehicleTrip needs the vehicle and its sideways speed (m/s): vehicleTrip(car, 10, 'Kerb', 0.15).");
  const v = vehicleOf(a[0]), vlat = toMat(a[1]).d[0], o = pairs(a, 2), kerb = o.get('kerb') ? toMat(o.get('kerb')!).d[0] : 0.15;
  const gname = o.get('ground') ? textOf(o.get('ground')!).toLowerCase() : 'tarmac', ground = vd.GROUNDS[gname];
  if (!(vlat > 0 && vlat <= 40)) throw new LabError('The sideways speed is above 0 up to 40 m/s.');
  if (!(kerb >= 0 && kerb < v.h)) throw new LabError("'Kerb' is its height in metres, 0 up to the centre of mass's height.");
  if (!ground) throw new LabError("'Ground' is 'tarmac', 'grass' or 'soil'.");
  // M486e: 'RoofStrength' (its strength-to-weight ratio, 3 by default), 'YawRate' (rad/s) and 'ForwardSpeed' (m/s).
  const opt = (k: string) => (o.get(k) ? toMat(o.get(k)!).d[0] : undefined), swr = opt('roofstrength'), yr = opt('yawrate'), vf = opt('forwardspeed');
  if (swr !== undefined && !(swr >= 0.5 && swr <= 10)) throw new LabError("'RoofStrength' is the roof's strength-to-weight ratio, 0.5 to 10 (3 by the US rule).");
  if ((yr !== undefined && !(Math.abs(yr) <= 5)) || (vf !== undefined && !(Math.abs(vf) <= 60))) throw new LabError("'YawRate' is up to 5 rad/s and 'ForwardSpeed' up to 60 m/s.");
  const who = peopleOf(o), tb = vd.kerbTrip(v, vlat, kerb, ground, { swr, r: yr, vf }), people = peopleFields(vd.inside(v, tb, who));
  // M486i: all four outer seats at once (info.Seats: a table); M486m: 'Middle', 1 adds the back's middle seat, and
  // Knock is the g of heads meeting.
  // M486o: 'FrontMiddle', 1 a bench's front middle seat too; BodyLoad the force of an unbelted body landing (N).
  const mid = o.get('middle') ? toMat(o.get('middle')!).d[0] : 0, fmid = o.get('frontmiddle') ? toMat(o.get('frontmiddle')!).d[0] : 0;
  if ((mid !== 0 && mid !== 1) || (fmid !== 0 && fmid !== 1)) throw new LabError("'Middle' and 'FrontMiddle' are 1 (someone in that middle seat) or 0.");
  const all = vd.everyone(v, tb, { ...who, middle: mid === 1, frontMiddle: fmid === 1 });
  people.push(['Seats', table([['Row', { k: 'cell', r: all.length, c: 1, d: all.map((x) => str(x.row)) } as Value], ['Side', { k: 'cell', r: all.length, c: 1, d: all.map((x) => str(x.seat)) } as Value], ['HeadG', col(all.map((x) => x.headG))], ['Knock', col(all.map((x) => x.knock))], ['BodyLoad', col(all.map((x) => x.bodyLoad))], ['PileLoad', col(all.map((x) => x.pileLoad))], ['OnTop', col(all.map((x) => x.onTop))], ['ArmForce', col(all.map((x) => x.armForce))], ['LegForce', col(all.map((x) => x.legForce))], ['ArmCrushed', col(all.map((x) => (x.armCrushed ? 1 : 0)))], ['AnkleForce', col(all.map((x) => x.ankleForce))], ['WristForce', col(all.map((x) => x.wristForce))], ['Trapped', col(all.map((x) => (x.trapped ? 1 : 0)))], ['HeldByFoot', col(all.map((x) => x.heldByFoot))], ['BodyCrushed', col(all.map((x) => (x.bodyCrushed ? 1 : 0)))], ['Headroom', col(all.map((x) => x.headroom))], ['ThrownOutAt', col(all.map((x) => x.thrownOut))], ['PartlyOut', col(all.map((x) => (x.partly ? 1 : 0)))]])]);
  const info: Struct = { k: 'struct', f: new Map<string, Value>([['Tripped', num(tb.tripped ? 1 : 0)], ...tumbleFields(tb), ...people, ['PeakRollRate', num(tb.peakRate)], ['TripSpeed', num(kerb > 0 ? vd.tripSpeed(v, kerb) : NaN)]]) };
  if (nout > 0) return [table([['Time', col(tb.t)], ['Across', col(tb.y)], ['Height', col(tb.z)], ['Roll', col(tb.th)], ['RollRate', col(tb.w)]]), info];
  call(lab, 'hold', str('on'));
  let last = -Infinity;
  tb.t.forEach((t, k) => {
    if (t - last < 0.12 && k !== tb.t.length - 1) return;
    last = t;
    const sc = section(v, tb.y[k], tb.z[k], tb.th[k]);
    call(lab, 'plot', row(sc.map((p) => p[0])), row(sc.map((p) => p[1])), str('Color'), row([0.45, 0.45, 0.55]));
  });
  const lo = Math.min(...tb.y) - 2, hi = Math.max(...tb.y) + 2;
  call(lab, 'plot', row(kerb > 0 ? [lo, 0, 0, hi] : [lo, hi]), row(kerb > 0 ? [0, 0, kerb, kerb] : [0, 0]), str('k'), str('LineWidth'), num(2));
  call(lab, 'hold', str('off')); call(lab, 'axis', str('equal')); call(lab, 'grid', str('on')); call(lab, 'xlabel', str('across (m)')); call(lab, 'ylabel', str('height (m)'));
  call(lab, 'title', str(tb.tripped ? `Tripped: ${tb.quarters} quarter turns, resting on its ${tb.rests}` : 'It rocked and fell back onto its wheels'));
  return [];
});
def('vehicleSim', (a, nout, lab) => {
  if (a.length < 3) throw new LabError("vehicleSim needs the vehicle, the steering (at the wheels, rad: a number, @(t) …, or 'step', 'ramp', 'sinedwell') and the time: vehicleSim(car, 'sinedwell', 4, 'Amplitude', 0.08, 'Speed', 22).");
  const v = vehicleOf(a[0]), T = toMat(a[2]).d[0], o = pairs(a, 3);
  if (!(T > 0 && T <= 120)) throw new LabError('vehicleSim runs up to 120 s (steps of 1 ms).');
  const amp = o.get('amplitude') ? toMat(o.get('amplitude')!).d[0] : 0.05;
  const speed = timeFn(lab, o.get('speed'), 'The speed'), force = timeFn(lab, o.get('force'), 'The force'), grade = timeFn(lab, o.get('grade'), 'The slope');
  if (speed && force) throw new LabError("Give 'Speed' (held by the driver) or 'Force' (N, negative brakes), not both.");
  const v0 = o.get('initialspeed') ? toMat(o.get('initialspeed')!).d[0] : speed ? speed(0) : 0;
  const r = vd.vehicleSim(v, steerOf(lab, a[1], amp), T, { speed, force, grade, v0 }), who = peopleOf(o);
  if (nout > 0) {
    const info: Struct = { k: 'struct', f: new Map<string, Value>([['Spun', num(r.spun ? 1 : 0)], ['PeakSideSlip', num(Math.max(...r.beta.map(Math.abs)))], ['PeakLateralAccel', num(Math.max(...r.ay.map(Math.abs)))], ['PeakRoll', num(Math.max(...r.roll.map(Math.abs)))], ['WheelLift', num(r.lift ? 1 : 0)], ['RolledOver', num(Number.isFinite(r.rolled) ? 1 : 0)], ['RolledAt', num(r.rolled)], ['PeakTip', num(Math.max(0, ...r.tip.map(Math.abs)))], ...(r.tumble ? tumbleFields(r.tumble) : [['Rolls', num(0)], ['RestsOn', str('wheels')], ['TumbleDistance', num(0)], ['TumbleTime', num(0)], ['RoofCrush', num(0)], ['Spin', num(0)], ['WindowsBroken', num(0)], ['PeakG', num(0)], ['Headroom', num(vd.HEADROOM)]] as [string, Value][]), ...peopleFields(r.tumble ? vd.inside(v, r.tumble, who) : null)]) };
    return [table([['Time', col(r.t)], ['X', col(r.x)], ['Y', col(r.y)], ['Yaw', col(r.psi)], ['Vx', col(r.vx)], ['Vy', col(r.vy)], ['YawRate', col(r.r)], ['Ay', col(r.ay)], ['Ax', col(r.ax)], ['SideSlip', col(r.beta)], ['Steer', col(r.steer)], ['SlipFront', col(r.af)], ['SlipRear', col(r.ar)], ['Roll', col(r.roll)], ['Tip', col(r.tip)]]), info];
  }
  call(lab, 'subplot', num(2), num(2), num(1)); call(lab, 'plot', row(r.x), row(r.y), str('LineWidth'), num(2)); call(lab, 'hold', str('on'));
  let since = Infinity;
  r.t.forEach((_, k) => {
    since += k ? Math.hypot(r.x[k] - r.x[k - 1], r.y[k] - r.y[k - 1]) : 0;
    if (since < 12 && k !== r.t.length - 1) return;
    since = 0;
    const ol = outline(r.x[k], r.y[k], r.psi[k], v);
    call(lab, 'plot', row(ol.map((p) => p[0])), row(ol.map((p) => p[1])), str('Color'), row([0.45, 0.45, 0.5]));
  });
  call(lab, 'hold', str('off')); call(lab, 'axis', str('equal')); call(lab, 'grid', str('on')); call(lab, 'xlabel', str('x (m)')); call(lab, 'ylabel', str('y (m)'));
  call(lab, 'title', str(Number.isFinite(r.rolled) ? `It rolled over at ${r.rolled.toFixed(2)} s` : r.spun ? 'The car spun (body slip past 15°)' : r.lift ? 'A wheel lifted off the road' : 'Where the car went'));
  call(lab, 'subplot', num(2), num(2), num(2)); call(lab, 'plot', row(r.t), row(r.steer.map((d) => (d * 180) / Math.PI)), row(r.t), row(r.r.map((w) => (w * 180) / Math.PI)));
  call(lab, 'legend', str('steering (°)'), str('yaw rate (°/s)')); call(lab, 'grid', str('on'));
  call(lab, 'subplot', num(2), num(2), num(3)); call(lab, 'plot', row(r.t), row(r.ay.map((x) => x / vd.G)));
  if (v.roll) { call(lab, 'hold', str('on')); call(lab, 'plot', row(r.t), row(r.roll.map((x, i) => ((x + r.tip[i]) * 180) / Math.PI / 10))); call(lab, 'hold', str('off')); call(lab, 'legend', str('side g'), str('roll (°/10)')); }
  call(lab, 'ylabel', str('side acceleration (g)')); call(lab, 'xlabel', str('t (s)')); call(lab, 'grid', str('on'));
  call(lab, 'subplot', num(2), num(2), num(4)); call(lab, 'plot', row(r.t), row(r.beta.map((x) => (x * 180) / Math.PI)), row(r.t), row(r.af.map((x) => (x * 180) / Math.PI)), row(r.t), row(r.ar.map((x) => (x * 180) / Math.PI)));
  call(lab, 'legend', str('body slip'), str('front tyres'), str('rear tyres')); call(lab, 'ylabel', str('angle (°)')); call(lab, 'xlabel', str('t (s)')); call(lab, 'grid', str('on'));
  return [];
});
def('vehicleHandling', (a, nout, lab) => {
  const v = vehicleOf(a[0]), h = vd.handling(v), top = a[1] ? toMat(a[1]).d[0] : 60;
  const info: Struct = { k: 'struct', f: new Map<string, Value>([['UndersteerGradient', num(h.K)], ['UndersteerDegPerG', num((h.K * vd.G * 180) / Math.PI)], ['CharacteristicSpeed', num(h.characteristic)], ['CriticalSpeed', num(h.critical)], ['Kind', str(h.K > 1e-6 ? 'understeer' : h.K < -1e-6 ? 'oversteer' : 'neutral')]]) };
  if (nout > 0) return [info];
  const u = Array.from({ length: 121 }, (_, k) => (k * top) / 120), g = u.map((x) => h.yawGain(x));
  call(lab, 'plot', row(u), row(g), str('LineWidth'), num(2)); call(lab, 'xlabel', str('speed (m/s)')); call(lab, 'ylabel', str('yaw rate per steering (1/s)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(h.K > 0 ? `Understeers (${((h.K * vd.G * 180) / Math.PI).toFixed(2)}°/g): most responsive at ${h.characteristic.toFixed(1)} m/s` : h.K < 0 ? `Oversteers: unstable past ${h.critical.toFixed(1)} m/s` : 'Neutral steer'));
  return [];
});
def('magicFormula', (a) => {
  if (a.length < 5) throw new LabError('magicFormula needs the slip and B, C, D, E: magicFormula(alpha, 10, 1.3, 1, -0.6).');
  const x = toMat(a[0], 'The slip'), [B, C, D, E] = [1, 2, 3, 4].map((k) => toMat(a[k]).d[0]);
  return [mat(x.r, x.c, Array.from(x.d, (s) => vd.magic(s, B, C, D, E)))];
});
def('accelRun', (a, nout, lab) => {
  const v = vehicleOf(a[0]), upTo = a[1] ? toMat(a[1]).d[0] : 100 / 3.6;
  if (!(upTo > 0)) throw new LabError('The speed to reach must be above 0 (m/s).');
  const r = vd.accelRun(v, upTo);
  const info: Struct = { k: 'struct', f: new Map<string, Value>([['Time', num(r.time)], ['TopSpeed', num(r.top)]]) };
  if (nout > 0) return [table([['Time', col(r.t)], ['Speed', col(r.v)], ['Distance', col(r.d)]]), info];
  call(lab, 'plot', row(r.t), row(r.v.map((x) => x * 3.6)), str('LineWidth'), num(2)); call(lab, 'xlabel', str('t (s)')); call(lab, 'ylabel', str('speed (km/h)')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(Number.isNaN(r.time) ? `Never reaches ${(upTo * 3.6).toFixed(0)} km/h (top speed ${(r.top * 3.6).toFixed(0)} km/h)` : `${(upTo * 3.6).toFixed(0)} km/h in ${r.time.toFixed(2)} s; top speed ${(r.top * 3.6).toFixed(0)} km/h`));
  return [];
});
def('brakingDistance', (a) => {
  const v = vehicleOf(a[0]), u = toMat(a[1] ?? num(NaN), 'The speed').d[0];
  if (!(u > 0 && u < 150)) throw new LabError('The speed is in m/s, above 0.');
  const r = vd.brakingDistance(v, u);
  return [num(r.distance), num(r.time)];
});

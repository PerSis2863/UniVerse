'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, RotateCcw } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { Fill } from '@/components/ui/Fill';
import { useDarkMode } from '@/lib/use-dark';
import { useMedia } from '@/lib/use-media';
import { ARMS, checkCollision, fkine, gravityTorque, ikine, manipulability, origin, rotm2eul, rot, tform, type V3 } from '@/lib/lab/robot';
import { NumField, ui } from './bench-ui';
import { ArmView } from './ArmView';

// Hyperion Simulate → Machines → Arm (M482): pick an arm, move each joint with its slider, or type a point and let
// inverse kinematics reach it (the arm glides there). Beside the picture: where the tool is, how freely it can move
// (manipulability) and the torque each motor needs to hold the pose against gravity. The maths is robot.ts, the same
// as robotIK, gravityTorque and manipulability in the language; each step takes well under a millisecond. M482b: a
// robot with two arms on a turning waist (each hand can be the one that reaches), a ball to put in the way, and the
// links that touch it or each other shown in red (checkCollision).

type ArmName = 'sixaxis' | 'scara' | 'planar3' | 'twolink' | 'dualarm';
const NAMES: { value: ArmName; label: string }[] = [{ value: 'sixaxis', label: 'Six-axis' }, { value: 'scara', label: 'SCARA' }, { value: 'planar3', label: '3-link' }, { value: 'twolink', label: '2-link' }, { value: 'dualarm', label: 'Two arms' }];
const START: Record<ArmName, number[]> = { sixaxis: [0, -0.6, 0.9, 0, 0.5, 0], scara: [0.4, 0.8, 0.1, 0], planar3: [0.5, -0.6, -0.4], twolink: [0.4, 0.8], dualarm: [0, 0.3, -0.8, 0.6, -0.3, 0.8, -0.6] };
/** A link's capsule for collisions: about the drawn link's thickness. */
const reachOf = (n: ArmName) => ARMS[n]().links.reduce((t, l) => t + Math.abs(l.a) + Math.abs(l.d), 0);
const fmt = (v: number, d = 3) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d);

export function ArmBench() {
  const dark = useDarkMode(), still = useMedia('(prefers-reduced-motion: reduce)');
  const [name, setName] = useState<ArmName>('sixaxis');
  const arm = useMemo(() => ARMS[name](), [name]);
  const [q, setQ] = useState<number[]>(START.sixaxis);
  const [goal, setGoal] = useState<V3>([0.5, 0.2, 0.4]);
  const [down, setDown] = useState(true);
  const [note, setNote] = useState('');
  const [hand, setHand] = useState<'left' | 'right'>('right');
  const [ballOn, setBallOn] = useState(false);
  const [ball, setBall] = useState<V3>([0.45, 0, 0.6]);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const choose = (n: ArmName) => { cancelAnimationFrame(raf.current); setName(n); setQ(START[n]); setNote(''); const p = origin(fkine(ARMS[n](), START[n], n === 'dualarm' ? 6 : undefined)); setGoal([Number(p[0].toFixed(2)), Number(p[1].toFixed(2)), Number(p[2].toFixed(2))]); };
  /** Glides from the pose now to the new one (an ease-out over half a second; at once with Reduce Motion). */
  const glide = (to: number[]) => {
    cancelAnimationFrame(raf.current);
    const from = q.slice();
    if (still) { setQ(to); return; }
    let t0 = 0;
    const tick = (t: number) => { t0 ||= t; const k = Math.min(1, (t - t0) / 500), e = 1 - (1 - k) ** 3; setQ(from.map((v, i) => v + (to[i] - v) * e)); if (k < 1) raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
  };
  const reach = () => {
    // With all six joints the tool can also point straight down; the others only reach the position.
    const full = arm.links.length === 6 && down, Td = tform(full ? [1, 0, 0, 0, -1, 0, 0, 0, -1] : [1, 0, 0, 0, 1, 0, 0, 0, 1], goal);
    const r = ikine(arm, Td, q, full ? [1, 1, 1, 1, 1, 1] : arm.gravity[2] === 0 ? [0, 0, 0, 1, 1, 0] : [0, 0, 0, 1, 1, 1], { tip });
    setNote(r.success ? `Reached in ${r.iterations} steps.` : `Out of reach: the closest pose is ${fmt(r.error, 3)} away.`);
    glide(r.q);
  };

  const tip = name === 'dualarm' ? (hand === 'left' ? 3 : 6) : arm.links.length - 1;
  const T = fkine(arm, q, tip), p = origin(T), e = rotm2eul(rot(T)), m = manipulability(arm, q, arm.links.length !== 6, tip), g = gravityTorque(arm, q);
  const ballR = 0.12, hit = checkCollision(arm, q, { radius: reachOf(name) * 0.03, spheres: ballOn ? [[...ball, ballR]] : [] });
  const hot = new Set([...hit.self.flat(), ...hit.hits.map((h) => h[0])]);
  const gMax = Math.max(1e-9, ...g.map(Math.abs));
  const planar = arm.gravity[2] === 0;
  const { label, small } = ui;

  return (
    <div className="flex h-[calc(100dvh-12rem+var(--bare-gain,0px))] min-h-[34rem] gap-3">
      <aside className="panel flex min-h-0 w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Arm settings" data-no-motion>
        <div className="space-y-2">
          <span className={label}>Arm</span>
          <select aria-label="Arm" value={name} onChange={(ev) => choose(ev.target.value as ArmName)} className={`${ui.select} w-full`}>{NAMES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
          {name === 'dualarm' && <Segmented<'left' | 'right'> label="Hand that reaches" value={hand} onChange={setHand} segments={[{ value: 'left', label: 'Left hand' }, { value: 'right', label: 'Right hand' }]} />}
        </div>
        <fieldset className="space-y-2">
          <legend className={label}>Joints</legend>
          {arm.links.map((l, i) => {
            const P = l.type === 'P', [lo, hi] = l.limits, val = q[i];
            return (
              <label key={i} className={label}>Joint {i + 1} {P ? '(slides)' : '(turns)'} <span className="font-mono tabular-nums text-zinc-900 dark:text-white">{P ? `${fmt(val, 3)} m` : `${((val * 180) / Math.PI).toFixed(1)}°`}</span>
                <input type="range" min={lo} max={hi} step={(hi - lo) / 720} value={val} onChange={(ev) => { cancelAnimationFrame(raf.current); const v = Number(ev.target.value); setQ((qq) => qq.map((x, k) => (k === i ? v : x))); }} className="mt-1 w-full accent-violet-600" />
              </label>
            );
          })}
          <button type="button" className={small} onClick={() => glide(START[name])}><RotateCcw className="h-3.5 w-3.5" aria-hidden />Start pose</button>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className={label}>Reach a point (inverse kinematics)</legend>
          <div className="grid grid-cols-3 gap-2">
            {(['x', 'y', 'z'] as const).map((k, i) => (planar && k === 'z' ? null : <NumField key={k} label={k} unit="m" value={goal[i]} onChange={(v) => setGoal((gl) => gl.map((x, j) => (j === i ? v : x)) as V3)} />))}
          </div>
          {arm.links.length === 6 && <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={down} onChange={(ev) => setDown(ev.target.checked)} className="h-4 w-4 accent-violet-600" />Tool pointing straight down</label>}
          <button type="button" className="btn-primary btn-sm" onClick={reach}><Crosshair className="h-4 w-4" aria-hidden />Reach it</button>
          {note && <p className="text-xs text-zinc-600 dark:text-zinc-300" aria-live="polite">{note}</p>}
        </fieldset>
        <fieldset className="space-y-2">
          <legend className={label}>Collisions</legend>
          <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={ballOn} onChange={(ev) => setBallOn(ev.target.checked)} className="h-4 w-4 accent-violet-600" />A ball in the way ({ballR * 100} cm)</label>
          {ballOn && <div className="grid grid-cols-3 gap-2">{(['x', 'y', 'z'] as const).map((k, i) => <NumField key={k} label={`Ball ${k}`} unit="m" value={ball[i]} onChange={(v) => setBall((b) => b.map((x, j) => (j === i ? v : x)) as V3)} />)}</div>}
          <p className={hit.colliding ? 'text-xs font-semibold text-red-700 dark:text-red-400' : 'text-xs text-zinc-600 dark:text-zinc-300'} aria-live="polite">
            {hit.colliding ? `Touching: ${[...hit.self.map(([i, j]) => `links ${i + 1} and ${j + 1}`), ...hit.hits.map(([i]) => `link ${i + 1} and the ball`)].join('; ')}.` : `Clear: the nearest two parts are ${fmt(hit.minDistance, 3)} m apart.`}
          </p>
        </fieldset>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">In the code window the same arm is <span className="font-mono">loadrobot(&apos;{name}&apos;)</span>: <span className="font-mono">show</span>, <span className="font-mono">getTransform</span>, <span className="font-mono">robotIK</span>, <span className="font-mono">massMatrix</span>, <span className="font-mono">inverseDynamics</span> (help: robot_arm.m).</p>
      </aside>
      <section className="panel relative flex min-w-0 flex-1 flex-col overflow-hidden p-0" aria-label="The arm">
        <div className="min-h-0 flex-1"><ArmView arm={arm} q={q} target={goal} dark={dark} hot={hot} ball={ballOn ? [...ball, ballR] : null} label={`${NAMES.find((x) => x.value === name)?.label} arm with its tool at ${p.map((v) => fmt(v, 2)).join(', ')} metres`} /></div>
        <div className="grid grid-cols-3 gap-4 border-t border-zinc-200/80 px-4 py-3 text-xs dark:border-white/10" aria-live="polite">
          <div>
            <p className="font-semibold text-zinc-500 dark:text-zinc-400">Tool position (m)</p>
            <p className="font-mono text-sm tabular-nums text-zinc-900 dark:text-white">[{p.map((v) => fmt(v)).join('  ')}]</p>
            <p className="mt-1 font-semibold text-zinc-500 dark:text-zinc-400">Turned (z y x, °)</p>
            <p className="font-mono text-sm tabular-nums text-zinc-900 dark:text-white">[{e.map((v) => ((v * 180) / Math.PI).toFixed(1)).join('  ')}]</p>
          </div>
          <div>
            <p className="font-semibold text-zinc-500 dark:text-zinc-400">Manipulability</p>
            <p className="font-mono text-sm tabular-nums text-zinc-900 dark:text-white">{m.toExponential(2)}</p>
            <p className="mt-1 leading-relaxed text-zinc-600 dark:text-zinc-300">{m < 1e-3 * (arm.links.length >= 6 ? 0.1 : 1) ? 'Near a singular pose: some directions can’t be reached quickly.' : 'How freely the tool can move from here (0 at a singular pose).'}</p>
          </div>
          <div>
            <p className="font-semibold text-zinc-500 dark:text-zinc-400">Holding against gravity ({arm.links.some((l) => l.type === 'P') ? 'N·m or N' : 'N·m'})</p>
            <ul className="mt-1 space-y-1">
              {g.map((v, i) => (
                <li key={i} className="flex items-center gap-2 font-mono tabular-nums">
                  <span className="w-5 text-zinc-500 dark:text-zinc-400">{i + 1}</span>
                  <span className="relative flex h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.08]"><Fill quick value={Math.abs(v) / gMax} className="rounded-full bg-violet-500" /></span>
                  <span className="w-16 text-end text-zinc-900 dark:text-white">{fmt(v, 2)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

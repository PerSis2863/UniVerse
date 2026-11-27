// Hyperion Simulate: the ready driving scenarios and a design's scenario, shared by the Scenario designer (M573) and the
// Labeller (M577).
import type * as S from '@/lib/lab/scenario';

export interface Act { cls: S.ActorClass; path: [number, number][]; speed: number; wait: number; speeds?: number[] }
export interface Design { roads: S.RoadSpec[]; actors: Act[]; stop: number; vision: boolean; radar: boolean; lidar: boolean }
export const PRESETS: { name: string; make: () => Design }[] = [
  { name: 'Highway cut-in', make: () => ({ stop: 10, vision: true, radar: true, lidar: false, roads: [{ centers: [[0, 0], [150, 0], [300, 0]], lanes: 3, laneWidth: 3.6 }], actors: [
    { cls: 'car', path: [[0, 0], [300, 0]], speed: 20, wait: 0 },
    { cls: 'car', path: [[35, 3.6], [80, 3.6], [110, 0.3], [300, 0]], speed: 23, wait: 0 },
    { cls: 'truck', path: [[60, -3.6], [300, -3.6]], speed: 18, wait: 0 } ] }) },
  { name: 'Curve and a person crossing', make: () => ({ stop: 12, vision: true, radar: true, lidar: true, roads: [{ centers: [[0, 0], [60, 0], [110, 20], [150, 60]], lanes: 2, laneWidth: 3.6 }], actors: [
    { cls: 'car', path: [[0, -1.8], [60, -1.8], [109, 18.3], [148, 58.6]], speed: 10, wait: 0 },
    { cls: 'car', path: [[25, -1.8], [60, -1.8], [109, 18.3], [148, 58.6]], speed: 10, wait: 0 },
    { cls: 'pedestrian', path: [[75, 9], [75, -9]], speed: 1.4, wait: 8.5 } ] }) },
  { name: 'Stop and go (a crash)', make: () => ({ stop: 10, vision: true, radar: true, lidar: false, roads: [{ centers: [[0, 0], [250, 0]], lanes: 2, laneWidth: 3.6 }], actors: [
    { cls: 'car', path: [[0, -1.8], [250, -1.8]], speed: 16, wait: 0 },
    { cls: 'car', path: [[30, -1.8], [60, -1.8], [75, -1.8], [250, -1.8]], speed: 14, wait: 0, speeds: [14, 14, 0, 12] } ] }) },
];
/** The scenario a design describes: its roads, its actors (the first is the ego car) and the chosen sensors. */
export function specOf(d: Design): S.ScenarioSpec {
  return {
    dt: 0.1, stop: d.stop, seed: 1, roads: d.roads.filter((r) => r.centers.length >= 2),
    actors: d.actors.map((a) => ({ cls: a.cls, position: a.path[0], ...(a.path.length >= 2 ? { waypoints: a.path, speeds: a.speeds ?? [a.speed], wait: a.wait } : {}) })),
    sensors: [...(d.vision ? [{ kind: 'vision' as const, mount: [1.9, 0, 1.1] as [number, number, number] }] : []), ...(d.radar ? [{ kind: 'radar' as const, mount: [3.7, 0, 0.2] as [number, number, number] }] : []), ...(d.lidar ? [{ kind: 'lidar' as const, mount: [0, 0, 1.8] as [number, number, number], channels: 16, azRes: 0.6 }] : [])],
  };
}

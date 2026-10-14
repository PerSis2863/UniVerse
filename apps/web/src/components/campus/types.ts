import type { Busy } from '@/lib/campus-map';

// The live campus map's data (Stage 5 · D15, GET /api/campus/map; src/server/campus-map.ts).

export interface Building { id: string; name: string; code: string | null; x: number; y: number; w: number; h: number; floors: number; color: string | null }
export interface MapRoom { id: string; name: string; type: string; capacity: number; buildingId: string | null; floor: number | null; busy: Busy[] }
export interface LiveClass { courseId: string; code: string; name: string; checkedIn: number; startedAt: string; roomId: string | null }
export interface OnlineClass { id: string; title: string; code: string; until: string; roomId: string | null; join: string }
export interface MapEvent { id: string; title: string; location: string | null; startAt: string | null; buildingId: string | null; now: boolean }
export interface NextClass {
  courseId: string; code: string; name: string; type: string; start: string; end: string; day: string; dayOffset: number; now: boolean;
  roomId: string | null; roomName: string | null; buildingId: string | null; floor: number | null;
}
export interface CampusRef { id: string | null; name: string }
export interface CampusMapData {
  campus: CampusRef; campuses: CampusRef[]; buildings: Building[]; rooms: MapRoom[];
  live: LiveClass[]; online: OnlineClass[]; events: MapEvent[]; next: NextClass | null; canEdit: boolean;
}

/** "Ground floor", "Floor 2", "Basement 1". */
export const floorName = (f: number | null) => (f == null ? 'Floor not set' : f === 0 ? 'Ground floor' : f < 0 ? `Basement ${-f}` : `Floor ${f}`);

// M141: the activity page's heatmap (the Ballast reels' "Agent Activity"): moments counted by weekday
// and hour in the viewer's time zone. Shared by the server route (audit/heat) and the sample answers.

export interface ActivityHeat {
  /** 7 rows (0 = Monday) of 24 hours. */
  cells: number[][];
  total: number;
  /** How many of them in each area ("user", "grade"…, the action's first word). */
  areas: Record<string, number>;
}

/** `tz`: minutes east of UTC (the browser's -getTimezoneOffset()). */
export function heatOf(rows: { createdAt: Date; action: string }[], tz: number): ActivityHeat {
  const cells = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const areas: Record<string, number> = {};
  for (const r of rows) {
    const local = new Date(r.createdAt.getTime() + tz * 60_000);
    cells[(local.getUTCDay() + 6) % 7][local.getUTCHours()]++;
    const area = r.action.split('.')[0];
    areas[area] = (areas[area] ?? 0) + 1;
  }
  return { cells, total: rows.length, areas };
}

/** 0 (nothing) to 4 (the busiest), for the cell's shade. */
export const heatLevel = (n: number, max: number) => (n <= 0 || max <= 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));

import { route } from '@/server/assignments';
import { campusMap } from '@/server/campus-map';

// The live campus map (Stage 5 · D15). GET ?date=YYYY-MM-DD&min=<minutes after midnight>&dow=<0 Mon … 6 Sun>
// (the device's local time)[&campus=<id>, empty for the school's own]: buildings, rooms with what's
// on today, classes and events now, and my next class.
export const GET = (req: Request) => route(req, (user) => campusMap(user, new URL(req.url).searchParams));

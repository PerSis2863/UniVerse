import { route } from '@/server/assignments';
import { getSettings, saveSettings } from '@/server/notify-settings';

// My notification settings (Stage 5 · Q9): push / daily summary / off per kind, muted courses and
// the summary's hour. PUT { prefs, tz }.
export const GET = (req: Request) => route(req, (user) => getSettings(user));
export const PUT = (req: Request) => route(req, async (user) => saveSettings(user, (await req.json().catch(() => ({}))) ?? {}));

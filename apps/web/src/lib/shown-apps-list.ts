import { APPS, type AppId } from './apps';

// The list of apps the website shows (M203), read safely, without React: the server (the owner's save,
// GET /site/apps) and the browser (src/lib/shown-apps.ts) share it.

export const ALL_APP_IDS: AppId[] = APPS.map((a) => a.id);
export const SHOWN_KEY = 'uv-apps';

/** The app ids to show from what was stored (a JSON list or a list): every app when none is valid. */
export function parseShownApps(raw: unknown): AppId[] {
  let list: unknown = raw;
  if (typeof raw === 'string') { try { list = JSON.parse(raw); } catch { list = null; } }
  const ids = Array.isArray(list) ? ALL_APP_IDS.filter((id) => list.includes(id)) : [];
  return ids.length ? ids : ALL_APP_IDS;
}

/** The style that hides a hidden app's parts (`data-uv-app`); the head script writes the first one. */
export const hideCss = (ids: AppId[]) => (ids.length === ALL_APP_IDS.length ? '' : `[data-uv-app]${ids.map((i) => `:not([data-uv-app="${i}"])`).join('')}${ids.length === 1 ? ',[data-uv-many]' : ''}{display:none!important}`);

/**
 * UniVerse error monitor (browser).
 *
 * Catches crashes and unhandled promise rejections, keeps the last 50 on this device (type
 * universeErrors() in the console to see them), and reports them to /api/errors so the owner is
 * told about problems (see src/server/errors.ts). Also fixes one common problem by itself: after a
 * new version is deployed, a tab that still runs the old version can fail to load a page's code
 * ("ChunkLoadError"); it reloads once to pick up the new version.
 */
import { getAuthToken } from './auth-token';

export interface CapturedError {
  id: string;
  type: 'runtime' | 'promise' | 'network' | 'manual' | 'render' | 'chunk';
  message: string;
  stack?: string;
  url?: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

const STORAGE_KEY = 'universe_error_log';
const MAX_ERRORS = 50;
const REPORT_EVERY_MS = 5000;
const MAX_REPORTS_PER_PAGE = 20;

// Same filters as the server (src/server/errors.ts isNoise): not problems in UniVerse.
const NOISE = [/ResizeObserver loop/i, /^Script error\.?$/i, /(chrome|moz|safari(-web)?)-extension:\/\//i, /AbortError|aborted/i, /firebaseinstallations|googletagmanager/i];
const OFFLINE_NOISE = /Failed to fetch|NetworkError|Load failed|network error/i;

const queue: { kind: string; message: string; stack?: string; path: string }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let sent = 0;
const seen = new Set<string>();

function generateId() {
  return `err_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function isChunkError(message: string) {
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);
}

async function flush() {
  timer = null;
  if (!queue.length || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
  const errors = queue.splice(0, 10);
  try {
    const token = await getAuthToken().catch(() => null);
    await fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ errors }),
      keepalive: true,
    });
  } catch {
    /* reporting is best effort */
  }
  if (queue.length) timer = setTimeout(flush, REPORT_EVERY_MS);
}

function report(kind: string, message: string, stack?: string) {
  if (sent >= MAX_REPORTS_PER_PAGE || NOISE.some((re) => re.test(message) || (!!stack && re.test(stack)))) return;
  if (OFFLINE_NOISE.test(message) && typeof navigator !== 'undefined' && !navigator.onLine) return;
  const key = `${kind}|${message}`;
  if (seen.has(key)) return; // once per page load is enough; the server counts occurrences
  seen.add(key);
  sent++;
  queue.push({ kind, message: message.slice(0, 500), stack: stack?.slice(0, 4000), path: location.pathname });
  if (!timer) timer = setTimeout(flush, 1500);
}

export function captureError(
  error: unknown,
  type: CapturedError['type'] = 'manual',
  context?: Record<string, unknown>
): void {
  try {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    // Self-recovery: an old tab after a deploy. Load the page the person was going to (not the one
    // they were leaving), once per page per minute so it can't loop; if that's used up, show a
    // "reload" screen rather than leaving a blank page.
    if (typeof window !== 'undefined' && isChunkError(message)) {
      if (recoverFromChunkError()) return;
      type = 'chunk';
    }

    const err: CapturedError = {
      id: generateId(),
      type,
      message,
      stack,
      url: typeof window !== 'undefined' ? window.location.pathname : undefined,
      timestamp: new Date().toISOString(),
      context,
    };
    const updated = [err, ...getErrors()].slice(0, MAX_ERRORS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    if (type !== 'network') report(type, message, stack);

    if (process.env.NODE_ENV !== 'production') {
      console.group(`[UniVerse Error Monitor] ${err.type.toUpperCase()}`);
      console.error(err.message);
      if (err.stack) console.log(err.stack);
      if (context) console.log('Context:', context);
      console.groupEnd();
    }
  } catch {
    // Never crash the app when logging errors
  }
}

/** Recovery lives in an inline head script (src/lib/recovery-script.ts) so it works even when the
 * app's own code failed to load; false when it's already been tried for this page. */
function recoverFromChunkError(): boolean {
  const recover = (window as unknown as { __uvRecover?: () => boolean }).__uvRecover;
  return typeof recover === 'function' ? recover() : false;
}

export function getErrors(): CapturedError[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function clearErrors(): void {
  localStorage.removeItem(STORAGE_KEY);
}

let installed = false;

/** Install global error listeners. Call once at app startup. */
export function installErrorMonitor(): void {
  if (typeof window === 'undefined' || installed) return;
  installed = true;

  window.addEventListener('error', (event) => {
    // A <script> or stylesheet that failed to load (e.g. an old chunk after a deploy).
    const target = event.target as HTMLElement | null;
    if (target && target !== (window as unknown as HTMLElement) && (target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
      const src = (target as HTMLScriptElement).src || (target as HTMLLinkElement).href || '';
      if (/\/_next\/static\//.test(src)) captureError(new Error(`ChunkLoadError: failed to load ${src.split('/').pop()}`), 'chunk');
      return;
    }
    captureError(event.error || event.message, 'runtime', { filename: event.filename, lineno: event.lineno, colno: event.colno });
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    captureError(event.reason, 'promise');
  });


  const w = window as unknown as Record<string, unknown>;
  w.universeErrors = () => {
    const errors = getErrors();
    if (errors.length === 0) {
      console.log('✅ No errors captured.');
      return [];
    }
    console.group(`🔴 UniVerse Error Log (${errors.length} errors)`);
    errors.forEach((e, i) => {
      console.group(`${i + 1}. [${e.type.toUpperCase()}] ${e.timestamp}`);
      console.error(e.message);
      if (e.stack) console.log(e.stack);
      if (e.context) console.log('Context:', e.context);
      if (e.url) console.log('URL:', e.url);
      console.groupEnd();
    });
    console.groupEnd();
    return errors;
  };
  w.universeClearErrors = () => {
    clearErrors();
    console.log('✅ Error log cleared.');
  };
}

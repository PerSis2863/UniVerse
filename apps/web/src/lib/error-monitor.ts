/**
 * UniVerse Error Monitor
 * 
 * Catches all runtime errors, promise rejections, and network failures
 * and stores them in localStorage so they can be reviewed easily.
 * 
 * To view errors: open browser console and type: universeErrors()
 */

export interface CapturedError {
  id: string;
  type: 'runtime' | 'promise' | 'network' | 'manual';
  message: string;
  stack?: string;
  url?: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

const STORAGE_KEY = 'universe_error_log';
const MAX_ERRORS = 50;

function generateId() {
  return `err_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function captureError(
  error: unknown,
  type: CapturedError['type'] = 'manual',
  context?: Record<string, unknown>
): void {
  try {
    const existing = getErrors();
    const err: CapturedError = {
      id: generateId(),
      type,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      timestamp: new Date().toISOString(),
      context,
    };

    const updated = [err, ...existing].slice(0, MAX_ERRORS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    // Also log to console in dev
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

/** Install global error listeners. Call once at app startup. */
export function installErrorMonitor(): void {
  if (typeof window === 'undefined') return;

  // Uncaught JS errors
  window.addEventListener('error', (event) => {
    captureError(event.error || event.message, 'runtime', {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    captureError(event.reason, 'promise');
  });

  // Expose helper in console
  (window as any).universeErrors = () => {
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

  (window as any).universeClearErrors = () => {
    clearErrors();
    console.log('✅ Error log cleared.');
  };

  console.log(
    '%c🔭 UniVerse Error Monitor active',
    'color: #818cf8; font-weight: bold;',
    '— type universeErrors() to view captured errors'
  );
}

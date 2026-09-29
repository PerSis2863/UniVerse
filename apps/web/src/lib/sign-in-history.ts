import { api } from './api';

/** Tells the server about a sign-in / sign-up / app open, for the person's sign-in history. Never throws. */
export function reportSession(kind: 'SIGN_IN' | 'SIGN_UP' | 'SESSION', method?: 'google' | 'password' | 'phone' | 'apple' | 'demo') {
  try {
    if (kind === 'SESSION') {
      if (sessionStorage.getItem('universe-session-reported')) return;
      sessionStorage.setItem('universe-session-reported', '1');
    } else {
      sessionStorage.setItem('universe-session-reported', '1'); // the sign-in already counts for this tab
    }
  } catch {
    /* storage unavailable: report anyway */
  }
  api.post('/auth/session', { kind, method }).catch(() => {});
}

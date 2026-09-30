import { LtiError, completeLaunch } from '@/server/lti';
import { ltiErrorPage, ltiSignInPage } from '@/server/lti-pages';
import { sessionTokensEnabled } from '@/server/session-token';

// LTI 1.3 step 2 — the LMS posts the signed id_token here (form_post).
export async function POST(req: Request) {
  if (!sessionTokensEnabled()) return ltiErrorPage('LMS sign-in isn’t set up yet on UniVerse (SESSION_SECRET is missing). Please tell your administrator.');
  const form = new URLSearchParams(await req.text());
  if (form.get('error')) return ltiErrorPage(`Your LMS reported: ${form.get('error_description') || form.get('error')}`);
  const cookieState = req.headers.get('cookie')?.match(/(?:^|;\s*)lti_state=([^;]+)/)?.[1] ?? null;
  try {
    const r = await completeLaunch(form.get('id_token') ?? '', form.get('state') ?? '', cookieState);
    return ltiSignInPage(r);
  } catch (e) {
    if (!(e instanceof LtiError)) console.error('LTI launch failed:', e);
    return ltiErrorPage(e instanceof LtiError ? e.message : 'Something went wrong opening UniVerse from your LMS.');
  }
}

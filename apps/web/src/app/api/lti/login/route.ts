import { NextResponse } from 'next/server';
import { LtiError, startLogin } from '@/server/lti';
import { ltiErrorPage } from '@/server/lti-pages';

// LTI 1.3 step 1 — OIDC login initiation from the LMS (GET or form POST).
async function handle(req: Request) {
  const params = req.method === 'POST' ? new URLSearchParams(await req.text()) : new URL(req.url).searchParams;
  try {
    const { redirect, state } = await startLogin(params);
    const res = NextResponse.redirect(redirect, 302);
    // Ties the launch to this browser when cookies are allowed (the state is also checked server-side).
    res.cookies.set('lti_state', state, { httpOnly: true, secure: true, sameSite: 'none', path: '/api/lti', maxAge: 600 });
    return res;
  } catch (e) {
    return ltiErrorPage(e instanceof LtiError ? e.message : 'Something went wrong starting the sign-in from your LMS.');
  }
}
export { handle as GET, handle as POST };

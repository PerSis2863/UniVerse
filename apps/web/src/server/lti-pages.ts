import { NextResponse } from 'next/server';

// Small standalone pages for LTI launches (outside the app shell).

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const shell = (title: string, body: string, script = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · UniVerse</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f1e;color:#fff;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px}main{max-width:28rem;text-align:center}.b{width:40px;height:40px;border-radius:12px;background:#4f46e5;display:grid;place-items:center;font-weight:900;margin:0 auto 16px}p{color:#a1a1aa}a{color:#a5b4fc}</style></head><body><main><div class="b">U</div>${body}</main>${script}</body></html>`;

export function ltiErrorPage(message: string) {
  return new NextResponse(shell('Couldn’t open UniVerse', `<h1 style="font-size:20px">Couldn’t open UniVerse</h1><p>${esc(message)}</p><p><a href="/login" target="_blank" rel="noopener">Sign in to UniVerse directly</a></p>`), { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

/** Stores the new session in the browser (like a normal sign-in) and opens the course. */
export function ltiSignInPage(r: { token: string; user: Record<string, unknown>; landing: string; platformName: string }) {
  const data = JSON.stringify({ token: r.token, user: r.user, landing: r.landing }).replace(/</g, '\\u003c');
  const script = `<script>(function(){var d=${data};try{localStorage.setItem('accessToken',d.token);localStorage.setItem('universe-auth',JSON.stringify({state:{user:d.user},version:0}));sessionStorage.removeItem('universe-session-reported');location.replace(d.landing);}catch(e){document.getElementById('m').textContent='Your browser blocked sign-in inside the LMS. Open UniVerse in a new window from your course (ask your administrator to set the tool to open in a new window).';}})();</script>`;
  const res = new NextResponse(shell('Opening UniVerse', `<h1 style="font-size:20px">Opening UniVerse…</h1><p id="m">Signed in from ${esc(r.platformName)}.</p>`, script), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  res.cookies.set('lti_state', '', { httpOnly: true, secure: true, sameSite: 'none', path: '/api/lti', maxAge: 0 });
  return res;
}

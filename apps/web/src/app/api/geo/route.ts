// The visitor's country as seen by Cloudflare (no third-party lookup, no IP sent anywhere).
export function GET(req: Request) {
  const country = req.headers.get('cf-ipcountry');
  const countryCode = country && /^[A-Z]{2}$/.test(country) && country !== 'XX' && country !== 'T1' ? country : null;
  return Response.json({ countryCode }, { headers: { 'Cache-Control': 'private, max-age=3600' } });
}

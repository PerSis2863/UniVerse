import { authedFetch } from './authed-fetch';

/** Downloads a file from this app's API (with the signed-in user's credentials) and saves it. */
export async function downloadFile(url: string, fallbackName = 'download') {
  const res = await authedFetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Download failed.');
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const href = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

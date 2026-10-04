// The Content-Security-Policy for an uploaded file opened on its own (/api/files/…). Whatever a
// file contains, it can't run scripts: default-src 'none' has no script source.
// - Most files are also sandboxed (no origin at all), the strongest isolation.
// - Not audio and video: Chromium browsers refuse to load the media of a sandboxed media page
//   (a voice note opened in a tab stayed at 0:00 and never played).
// - Not PDFs: Chrome won't show a sandboxed PDF, and its viewer is isolated anyway.
export function fileCsp(mime: string): string | null {
  const base = "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'";
  if (mime === 'application/pdf') return null;
  return /^(audio|video)\//.test(mime) ? base : `${base}; sandbox`;
}

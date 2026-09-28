import { AwsClient, AwsV4Signer } from 'aws4fetch';

// Cloudflare R2 file storage, reached through its S3-compatible API so it works the same on
// Cloudflare Workers and in `next dev`. Files are served from the bucket's public custom domain
// (NEXT_PUBLIC_FILES_URL, e.g. https://files.example.com).

function config() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, NEXT_PUBLIC_FILES_URL } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !NEXT_PUBLIC_FILES_URL) return null;
  return {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`,
    publicUrl: NEXT_PUBLIC_FILES_URL.replace(/\/+$/, ''),
  };
}

export const hasR2Storage = () => config() !== null;

const encodeKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');

/** Stores bytes under `key` and returns the file's public URL. */
export async function r2Put(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const c = config();
  if (!c) throw new Error('R2 storage is not configured');
  const client = new AwsClient({ accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, service: 's3', region: 'auto' });
  const res = await client.fetch(`${c.endpoint}/${encodeKey(key)}`, {
    method: 'PUT',
    body: new Uint8Array(bytes),
    headers: { 'Content-Type': contentType },
  });
  if (!res.ok) throw new Error(`R2 upload failed (${res.status}): ${await res.text().catch(() => '')}`);
  return `${c.publicUrl}/${encodeKey(key)}`;
}

/**
 * Returns a short-lived URL the browser can PUT the file to directly. The content type and exact
 * size are part of the signature, so R2 rejects any other file than the one that was approved.
 */
export async function r2PresignPut(key: string, contentType: string, size: number, expiresSeconds = 600) {
  const c = config();
  if (!c) throw new Error('R2 storage is not configured');
  const url = new URL(`${c.endpoint}/${encodeKey(key)}`);
  url.searchParams.set('X-Amz-Expires', String(expiresSeconds));
  const signer = new AwsV4Signer({
    url: url.toString(),
    method: 'PUT',
    headers: new Headers({ 'Content-Type': contentType, 'Content-Length': String(size) }),
    accessKeyId: c.accessKeyId,
    secretAccessKey: c.secretAccessKey,
    service: 's3',
    region: 'auto',
    signQuery: true,
    allHeaders: true,
  });
  const signed = await signer.sign();
  return { uploadUrl: signed.url.toString(), publicUrl: `${c.publicUrl}/${encodeKey(key)}` };
}

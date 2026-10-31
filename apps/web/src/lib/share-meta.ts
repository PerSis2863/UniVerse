import type { Metadata } from 'next';
import { type AppId, appById } from '@/lib/apps';

// The picture and words a link shows when it is pasted into WhatsApp, Instagram, LinkedIn and the
// like (M42). One picture per app (public/og/<app>.jpg, 1200 × 630, made from the landing's hero);
// the whole site uses public/og.jpg (src/app/layout.tsx). Bump V when a picture changes, so the
// apps that keep old previews fetch the new one.
const V = 3;

export const SITE_SHARE = `/og.jpg?v=${V}`;

/** Metadata for an app's pages: Open Graph and the large Twitter/X card, with that app's picture. */
export function shareMeta(id: AppId, description: string): Metadata {
  const app = appById(id);
  const title = `${app.name}: ${app.tagline}`;
  const images = [{ url: `/og/${id}.jpg?v=${V}`, width: 1200, height: 630, alt: title }];
  return {
    title: app.name,
    openGraph: { type: 'website', siteName: 'UniVerse Impact', title, description, images },
    twitter: { card: 'summary_large_image', title, description, images: images.map((i) => i.url) },
  };
}

'use client';

import { authedFetch } from '@/lib/authed-fetch';

export type MessageType = 'TEXT' | 'IMAGE' | 'FILE' | 'AUDIO' | 'VIDEO' | 'CALL' | 'POLL' | 'LOCATION' | 'CONTACT' | 'SYSTEM' | 'DELETED';

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  type: MessageType;
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentSize: number | null;
  attachmentMime: string | null;
  metadata: {
    kind?: 'audio' | 'video'; room?: string; url?: string; inApp?: boolean; durationSec?: number; // CALL (inApp: UniVerse's own call) / voice notes
    endedAt?: string; answered?: boolean; declinedBy?: string; // CALL: how it went
    question?: string; options?: string[]; multiple?: boolean; // POLL
    lat?: number; lng?: number; label?: string | null; // LOCATION
    userId?: string; name?: string; role?: string; avatar?: string | null; // CONTACT
    moderated?: 'edited' | 'removed'; team?: boolean; // changed or posted by UniVerse (owner console)
    viewOnce?: boolean; opened?: boolean; openedCount?: number; // view-once photo / video / voice message
    transcript?: string; voicemail?: boolean; // voice message text (AI); a voicemail left after a missed call
    link?: { url: string; title: string; description: string | null; site: string } | null; // link preview
    broadcast?: boolean;
    ai?: boolean; askedBy?: string; // an answer from UniVerse AI (/ask), with the question in `question`
  } | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyTo: { id: string; body: string; type: string; sender: { id: string; name: string } } | null;
  reactions: Record<string, string[]>;
  sender: { id: string; name: string; avatar: string | null };
  expiresAt?: string | null;
  pinnedAt?: string | null;
  forwarded?: boolean;
  starred?: boolean;
  poll?: { counts: number[]; mine: number[]; voters: number } | null;
  /** Replies in the thread started from this message. */
  thread?: { count: number; lastAt: string | null };
  pending?: boolean;
}

export interface ConversationSummary {
  id: string;
  isGroup: boolean;
  isOfficial: boolean;
  title: string;
  avatarUrl: string | null;
  otherUserId: string | null;
  online: boolean;
  lastSeenAt: string | null;
  status?: UserStatus | null;
  memberCount: number;
  typing: string[];
  lastMessage: { id: string; body: string; type: MessageType; senderId: string; createdAt: string; deletedAt: string | null; attachmentName: string | null; mine: boolean } | null;
  unread: number;
  markedUnread?: boolean;
  pinned?: boolean;
  muted?: boolean;
  archived?: boolean;
  activityAt: string;
}

export interface UserStatus { presence: 'auto' | 'busy' | 'in_class' | 'studying' | 'sleeping'; statusText: string | null; statusEmoji: string | null; hidden?: boolean; focus?: boolean }
export interface ChannelInfo { kind: 'TEXT' | 'ANNOUNCE' | 'VOICE'; communityId: string; communityName: string; color: string | null; slowModeSec: number; role: 'OWNER' | 'MOD' | 'MEMBER' | null; /** The community's own emoji (:name:). */ emoji?: { name: string; url: string }[] }

/** A person's custom status or availability, for under their name ("📚 Revising for finals", "In class"). */
export function statusLine(s: UserStatus | null | undefined): string | null {
  if (!s) return null;
  if (s.statusText) return `${s.statusEmoji ? s.statusEmoji + ' ' : ''}${s.statusText}`;
  const label: Record<string, string> = { busy: 'Busy', in_class: 'In class', studying: 'Studying', sleeping: 'Sleeping' };
  return label[s.presence] ? `${s.statusEmoji ? s.statusEmoji + ' ' : ''}${label[s.presence]}` : null;
}

export interface Member {
  id: string;
  name: string;
  avatar: string | null;
  role: string;
  status?: UserStatus | null;
  groupRole: string;
  online: boolean;
  lastSeenAt: string | null;
  lastReadAt: string | null;
}

export interface ThreadResponse {
  conversation: {
    id: string; isGroup: boolean; isOfficial: boolean; title: string; avatarUrl: string | null; myRole: string; members: Member[];
    disappearingSec?: number | null; pinned?: boolean; muted?: boolean; archived?: boolean;
    /** Auto-translate incoming messages into this language (my setting); null = off. */
    translateTo?: string | null;
    /** A channel in a community (Discord-style); null for chats and groups. */
    channel?: ChannelInfo | null;
  };
  /** Stored translations (into `translateTo`) of messages on this page. */
  translations?: Record<string, { text: string; from: string; same: boolean }>;
  typing: string[];
  pinned?: { id: string; body: string; type: string; attachmentName: string | null; createdAt: string; pinnedAt: string; sender: { id: string; name: string } | null }[];
  messages: ChatMessage[];
  hasMore: boolean;
  me: string;
}

export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function chatJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await authedFetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
  return body as T;
}

const SERVER_MAX = 4 * 1024 * 1024;

/**
 * Uploads a chat attachment and returns its URL.
 * Files up to 4 MB go through the server (stored in Cloudflare R2 if configured, otherwise in the
 * database). Larger files upload straight to R2 with a signed URL, which needs R2 to be configured.
 */
export async function uploadChatFile(file: File, onProgress?: (pct: number) => void) {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Files must be 25 MB or smaller.');
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'file';

  if (file.size <= SERVER_MAX) {
    onProgress?.(10);
    const res = await authedFetch(`/api/upload?filename=${encodeURIComponent(safe)}`, {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.url) throw new Error(json.error || 'Upload failed. Please try again.');
    onProgress?.(100);
    return json.url as string;
  }

  const res = await authedFetch('/api/upload/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: safe, contentType: file.type, size: file.size }),
  });
  const grant = await res.json().catch(() => ({}));
  if (res.status === 503) throw new Error('Files over 4 MB need cloud storage to be connected. Try a smaller file.');
  if (!res.ok || !grant.uploadUrl) {
    if (res.status === 400 && /type/i.test(grant.error ?? '')) throw new Error('This file type can’t be shared.');
    throw new Error(grant.error || 'Upload failed. Please try again.');
  }

  // XHR rather than fetch so we can report upload progress.
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', grant.uploadUrl);
    xhr.setRequestHeader('Content-Type', grant.contentType);
    if (onProgress) xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`status ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('network'));
    xhr.send(file);
  }).catch(() => {
    throw new Error('Upload failed. Please check your connection and try again.');
  });
  return grant.url as string;
}

export function messageTypeFor(mime: string): MessageType {
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('video/')) return 'VIDEO';
  if (mime.startsWith('audio/')) return 'AUDIO';
  return 'FILE';
}

export function formatBytes(n: number | null | undefined) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
}

/** A message's text without its formatting marks (code fences, quotes, list marks, *bold*…), for previews. */
export function plainText(body: string): string {
  return body
    .replace(/^\s*```[\w+#.-]*\s*$/gm, '')
    .replace(/```/g, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '• ')
    .replace(/(\*\*|__|~~)(.+?)\1/g, '$2')
    .replace(/(^|[^\w])([*_~`])([^*_~`\n]+?)\2(?!\w)/g, '$1$3')
    .trim();
}

export function previewText(m: { type: string; body: string; attachmentName?: string | null; deletedAt?: string | null } | null) {
  if (!m) return 'No messages yet';
  if (m.deletedAt || m.type === 'DELETED') return '🚫 Message deleted';
  switch (m.type) {
    case 'IMAGE': return '📷 Photo';
    case 'VIDEO': return '🎬 Video';
    case 'AUDIO': return '🎤 Voice message';
    case 'FILE': return `📎 ${m.attachmentName || 'File'}`;
    case 'CALL': return m.body.startsWith('Video') ? '📹 Video call' : '📞 Voice call';
    case 'POLL': return `📊 ${m.body}`;
    case 'LOCATION': return '📍 Location';
    case 'CONTACT': return `👤 ${m.body}`;
    default: return plainText(m.body).split('\n').find((l) => l.trim()) ?? '';
  }
}

export function timeLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export function lastSeenLabel(online: boolean, lastSeenAt: string | null) {
  if (online) return 'online';
  if (!lastSeenAt) return 'offline';
  return `last seen ${timeLabel(lastSeenAt).toLowerCase()}`;
}

export const DISAPPEARING_OPTIONS = [
  { sec: 0, label: 'Off' },
  { sec: 86_400, label: '24 hours' },
  { sec: 604_800, label: '7 days' },
  { sec: 7_776_000, label: '90 days' },
];
export const disappearingLabel = (sec?: number | null) => DISAPPEARING_OPTIONS.find((o) => o.sec === (sec ?? 0))?.label ?? 'Off';

/** Pick a wallpaper per browser (not synced). */
export const WALLPAPERS: { id: string; label: string; style: React.CSSProperties }[] = [
  { id: 'dots', label: 'Dots', style: { backgroundImage: 'radial-gradient(rgba(99,102,241,0.08) 1px, transparent 1px)', backgroundSize: '22px 22px' } },
  { id: 'plain', label: 'Plain', style: {} },
  { id: 'aurora', label: 'Aurora', style: { backgroundImage: 'radial-gradient(60% 50% at 20% 10%, rgba(99,102,241,0.16), transparent), radial-gradient(50% 40% at 90% 80%, rgba(217,70,239,0.14), transparent)' } },
  { id: 'mint', label: 'Mint', style: { backgroundImage: 'linear-gradient(160deg, rgba(16,185,129,0.10), rgba(6,182,212,0.06))' } },
  { id: 'sunset', label: 'Sunset', style: { backgroundImage: 'linear-gradient(160deg, rgba(251,146,60,0.12), rgba(236,72,153,0.08))' } },
  { id: 'grid', label: 'Grid', style: { backgroundImage: 'linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px)', backgroundSize: '28px 28px' } },
];
export function getWallpaper(): string {
  try { return localStorage.getItem('universe:chat-wallpaper') ?? 'dots'; } catch { return 'dots'; }
}
export function setWallpaper(id: string) {
  try { localStorage.setItem('universe:chat-wallpaper', id); } catch { /* ignore */ }
  window.dispatchEvent(new Event('universe:wallpaper'));
}

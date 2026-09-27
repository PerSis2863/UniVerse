'use client';

import { upload } from '@vercel/blob/client';
import { getAuthToken } from '@/lib/auth-token';
import { authedFetch } from '@/lib/authed-fetch';

export type MessageType = 'TEXT' | 'IMAGE' | 'FILE' | 'AUDIO' | 'VIDEO' | 'CALL' | 'SYSTEM' | 'DELETED';

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
  metadata: { kind?: 'audio' | 'video'; room?: string; url?: string; durationSec?: number } | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyTo: { id: string; body: string; type: string; sender: { id: string; name: string } } | null;
  reactions: Record<string, string[]>;
  sender: { id: string; name: string; avatar: string | null };
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
  memberCount: number;
  typing: string[];
  lastMessage: { id: string; body: string; type: MessageType; senderId: string; createdAt: string; deletedAt: string | null; attachmentName: string | null; mine: boolean } | null;
  unread: number;
  activityAt: string;
}

export interface Member {
  id: string;
  name: string;
  avatar: string | null;
  role: string;
  groupRole: string;
  online: boolean;
  lastSeenAt: string | null;
  lastReadAt: string | null;
}

export interface ThreadResponse {
  conversation: { id: string; isGroup: boolean; isOfficial: boolean; title: string; avatarUrl: string | null; myRole: string; members: Member[] };
  typing: string[];
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

/** Uploads a file straight from the browser to Vercel Blob (up to 25 MB). */
export async function uploadChatFile(file: File, userId: string, onProgress?: (pct: number) => void) {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Files must be 25 MB or smaller.');
  const token = await getAuthToken();
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'file';
  let blob;
  try {
    blob = await upload(`chat/${userId}/${safe}`, file, {
    access: 'public',
    handleUploadUrl: '/api/upload/token',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    contentType: file.type || undefined,
      onUploadProgress: onProgress ? ({ percentage }) => onProgress(Math.round(percentage)) : undefined,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? '');
    if (/client token/i.test(msg)) throw new Error('File sharing isn’t available yet — your campus admin needs to finish setting up storage.');
    if (/content type|not allowed/i.test(msg)) throw new Error('This file type can’t be shared.');
    throw new Error('Upload failed. Please check your connection and try again.');
  }
  return blob.url;
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

export function previewText(m: { type: string; body: string; attachmentName?: string | null; deletedAt?: string | null } | null) {
  if (!m) return 'No messages yet';
  if (m.deletedAt || m.type === 'DELETED') return '🚫 Message deleted';
  switch (m.type) {
    case 'IMAGE': return '📷 Photo';
    case 'VIDEO': return '🎬 Video';
    case 'AUDIO': return '🎤 Voice message';
    case 'FILE': return `📎 ${m.attachmentName || 'File'}`;
    case 'CALL': return m.body.startsWith('Video') ? '📹 Video call' : '📞 Voice call';
    default: return m.body.split('\n')[0];
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

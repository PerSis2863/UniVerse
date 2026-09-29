'use client';

import '@excalidraw/excalidraw/index.css';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  Excalidraw,
  exportToBlob,
  MainMenu,
  newElementWith,
  reconcileElements,
  restoreElements,
  WelcomeScreen,
} from '@excalidraw/excalidraw';
import type { AppState, BinaryFileData, BinaryFiles, Collaborator, DataURL, ExcalidrawImperativeAPI, SocketId } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement, FileId, OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { RemoteExcalidrawElement } from '@excalidraw/excalidraw/data/reconcile';
import { authedFetch, authedJson } from '@/lib/authed-fetch';
import { isUploadedFileUrl } from '@/lib/file-urls';
import { templateElements, type TemplateId } from './templates';

// The live whiteboard: Excalidraw (every drawing tool, shapes, text, arrows, pictures, laser
// pointer, export) connected to the board's room (BoardRoom in cloudflare/worker.ts). Each change
// is sent as the shapes that changed; everyone merges them the same way, so all screens match.
// Pictures are uploaded once and shared as links.

export type BoardPeer = { sid: string; userId: string; name: string; avatar: string | null; color: string; canEdit: boolean };
export type LiveStatus = 'connecting' | 'live' | 'offline' | 'unavailable';
export type BoardGone = 'deleted' | 'removed';
export interface BoardControls {
  setBackground(file: File): Promise<void>;
  removeBackground(): void;
  addPhoto(file: File): Promise<void>;
}

type RoomFile = { id: string; mimeType: string; url: string; created: number };
type ServerMessage =
  | { type: 'init'; me: BoardPeer; elements: ExcalidrawElement[]; files: RoomFile[]; peers: BoardPeer[] }
  | { type: 'update'; elements: ExcalidrawElement[] }
  | { type: 'file'; file: RoomFile }
  | { type: 'peers'; peers: BoardPeer[] }
  | { type: 'cursor'; sid: string; x: number; y: number; tool: 'pointer' | 'laser'; button: 'up' | 'down'; selected: string[] };

// Messages to the board's Durable Object are billed (20 messages = 1 request), so they're batched:
// changes at most ~16×/s while drawing, cursors ~12×/s and only when the pointer actually moved.
const SEND_EVERY_MS = 60;
const CURSOR_EVERY_MS = 80;
const THUMBNAIL_AFTER_MS = 12_000;
const BATCH = 200;
const UPLOAD_MIME: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

function dataURLToBlob(dataURL: string): Blob {
  const [head, data] = dataURL.split(',', 2);
  const mime = head.match(/^data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Shrinks a photo so it uploads quickly (and fits the 4 MB upload limit). */
async function preparePhoto(file: File, maxSide: number) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a picture (JPG, PNG, GIF or WebP).');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  // Keep transparency for PNGs; photos become JPEGs.
  let mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  let dataURL = canvas.toDataURL(mimeType, 0.85);
  if (dataURL.length > 4_500_000) {
    mimeType = 'image/jpeg';
    dataURL = canvas.toDataURL(mimeType, 0.7);
  }
  return { dataURL, mimeType, width, height };
}

const isBackground = (e: ExcalidrawElement) => !e.isDeleted && e.type === 'image' && (e.customData as { background?: boolean } | undefined)?.background === true;

export default function BoardCanvas({
  boardId,
  title,
  canEdit,
  template,
  theme,
  onControls,
  onBackground,
  onPeers,
  onStatus,
  onRole,
  onGone,
  onError,
}: {
  boardId: string;
  title: string;
  canEdit: boolean;
  /** For a brand-new board: a starting layout, added on first open if the board is empty. */
  template?: TemplateId | null;
  theme: 'light' | 'dark';
  onControls: (controls: BoardControls | null) => void;
  onBackground: (has: boolean) => void;
  onPeers: (peers: BoardPeer[], me: BoardPeer | null) => void;
  onStatus: (s: LiveStatus) => void;
  onRole: (role: 'OWNER' | 'EDITOR' | 'VIEWER') => void;
  onGone: (why: BoardGone) => void;
  onError: (message: string) => void;
}) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const ready = useRef(false); // received the board from the room
  const framed = useRef(false); // zoomed to the drawing once, when the board first opens
  const known = useRef(new Map<string, number>()); // element id → version the room has
  const roomFiles = useRef(new Set<string>());
  const uploading = useRef(new Set<string>());
  const collaborators = useRef(new Map<SocketId, Collaborator>());
  const me = useRef<BoardPeer | null>(null);
  const editable = useRef(canEdit);
  const hasBackground = useRef(false);
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thumbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCursor = useRef(0);
  const lastPos = useRef<{ x: number; y: number; button: string }>({ x: NaN, y: NaN, button: 'up' });
  const callbacks = useRef({ onPeers, onStatus, onRole, onGone, onError, onBackground });
  useLayoutEffect(() => {
    editable.current = canEdit;
    callbacks.current = { onPeers, onStatus, onRole, onGone, onError, onBackground };
  });

  const send = useCallback((msg: unknown) => {
    const socket = ws.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  }, []);

  // A small preview picture for the boards list, a little after the last edit.
  const saveThumbnail = useCallback(async () => {
    if (!api || !editable.current) return;
    const elements = api.getSceneElements();
    try {
      let thumbnail: string | null = null;
      if (elements.length) {
        const blob = await exportToBlob({
          elements,
          files: api.getFiles(),
          appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false },
          mimeType: 'image/webp',
          quality: 0.6,
          maxWidthOrHeight: 480,
        });
        thumbnail = await blobToDataURL(blob);
        if (thumbnail.length > 150_000) thumbnail = null;
        if (!thumbnail) return;
      }
      await authedJson(`/api/boards/${boardId}`, { method: 'PATCH', body: JSON.stringify({ thumbnail }) });
    } catch {
      /* the preview is optional */
    }
  }, [api, boardId]);

  // Sends every shape that changed since the room last heard about it.
  const flush = useCallback(() => {
    sendTimer.current = null;
    if (!api || !ready.current || !editable.current) return;
    const changed = api.getSceneElementsIncludingDeleted().filter((e) => (known.current.get(e.id) ?? -1) < e.version);
    if (!changed.length) return;
    for (let i = 0; i < changed.length; i += BATCH) send({ type: 'update', elements: changed.slice(i, i + BATCH) });
    for (const e of changed) known.current.set(e.id, e.version);
    if (thumbTimer.current) clearTimeout(thumbTimer.current);
    thumbTimer.current = setTimeout(saveThumbnail, THUMBNAIL_AFTER_MS);
  }, [api, send, saveThumbnail]);

  // Pictures someone added on this screen: upload once, then tell the room where it is.
  const uploadFiles = useCallback(
    (files: BinaryFiles) => {
      if (!ready.current || !editable.current) return;
      for (const f of Object.values(files)) {
        if (roomFiles.current.has(f.id) || uploading.current.has(f.id) || !f.dataURL.startsWith('data:')) continue;
        const ext = UPLOAD_MIME[f.mimeType];
        if (!ext) {
          roomFiles.current.add(f.id); // e.g. SVG: shown here only
          callbacks.current.onError('Only JPG, PNG, GIF and WebP pictures are shared with others.');
          continue;
        }
        uploading.current.add(f.id);
        void (async () => {
          try {
            const res = await authedFetch(`/api/upload?filename=${encodeURIComponent(`board-picture.${ext}`)}`, {
              method: 'POST',
              headers: { 'Content-Type': f.mimeType },
              body: dataURLToBlob(f.dataURL),
            });
            const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
            if (!res.ok || !body.url) throw new Error(body.error || 'Upload failed');
            roomFiles.current.add(f.id);
            send({ type: 'file', file: { id: f.id, mimeType: f.mimeType, url: body.url } });
          } catch (e) {
            callbacks.current.onError(`Couldn’t share a picture: ${(e as Error).message}`);
          } finally {
            uploading.current.delete(f.id);
          }
        })();
      }
    },
    [send],
  );

  const loadRoomFiles = useCallback(
    async (files: RoomFile[]) => {
      if (!api) return;
      const have = api.getFiles();
      const loaded: BinaryFileData[] = [];
      await Promise.all(
        files.map(async (f) => {
          roomFiles.current.add(f.id);
          if (have[f.id] || !isUploadedFileUrl(f.url)) return; // only pictures from our own storage
          try {
            const res = await fetch(f.url);
            if (!res.ok) throw new Error(String(res.status));
            loaded.push({ id: f.id as FileId, mimeType: f.mimeType as BinaryFileData['mimeType'], dataURL: (await blobToDataURL(await res.blob())) as DataURL, created: f.created });
          } catch {
            // e.g. the files domain doesn't allow downloads from this site (R2 CORS): show the
            // picture by its address instead. It still displays; exporting may skip it.
            if (f.url.startsWith('https://')) loaded.push({ id: f.id as FileId, mimeType: f.mimeType as BinaryFileData['mimeType'], dataURL: f.url as DataURL, created: f.created });
          }
        }),
      );
      if (loaded.length) api.addFiles(loaded);
    },
    [api],
  );

  const merge = useCallback(
    (remote: ExcalidrawElement[]) => {
      if (!api) return;
      const restored = restoreElements(remote, null) as unknown as RemoteExcalidrawElement[];
      for (const e of restored) known.current.set(e.id, Math.max(known.current.get(e.id) ?? -1, e.version));
      const merged = reconcileElements(api.getSceneElementsIncludingDeleted() as OrderedExcalidrawElement[], restored, api.getAppState());
      api.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER });
    },
    [api],
  );

  const showPeers = useCallback(
    (peers: BoardPeer[]) => {
      if (!api) return;
      const next = new Map<SocketId, Collaborator>();
      for (const p of peers) {
        if (p.sid === me.current?.sid) continue;
        const had = collaborators.current.get(p.sid as SocketId);
        next.set(p.sid as SocketId, {
          ...had,
          id: p.userId,
          socketId: p.sid as SocketId,
          username: p.name,
          avatarUrl: p.avatar ?? undefined,
          color: { background: p.color, stroke: p.color },
        });
      }
      collaborators.current = next;
      api.updateScene({ collaborators: next });
      callbacks.current.onPeers(peers, me.current);
    },
    [api],
  );

  // The connection to the room, reconnecting after drops.
  useEffect(() => {
    if (!api) return;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    let attempt = 0;

    const connect = async () => {
      if (stopped) return;
      callbacks.current.onStatus(attempt ? 'offline' : 'connecting');
      let path: string;
      try {
        const t = await authedJson<{ path: string; role: 'OWNER' | 'EDITOR' | 'VIEWER' }>(`/api/boards/${boardId}/ticket`, { method: 'POST' });
        path = t.path;
        callbacks.current.onRole(t.role);
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status === 404) return callbacks.current.onGone('removed');
        if (status === 503) callbacks.current.onStatus('unavailable');
        return schedule();
      }
      if (stopped) return;
      const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path}`);
      ws.current = socket;
      socket.onmessage = (ev) => {
        if (ev.data === 'pong') return;
        let msg: ServerMessage;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        switch (msg.type) {
          case 'init':
            attempt = 0;
            me.current = msg.me;
            known.current = new Map();
            roomFiles.current = new Set();
            merge(msg.elements);
            ready.current = true;
            callbacks.current.onStatus('live');
            showPeers(msg.peers);
            void loadRoomFiles(msg.files).then(() => uploadFiles(api.getFiles()));
            flush(); // anything drawn while offline
            // Open on the drawing, whatever the screen size (not on an empty corner of the canvas).
            if (!framed.current) {
              framed.current = true;
              if (template && template !== 'blank' && editable.current && msg.elements.length === 0 && !api.getSceneElements().length) {
                api.updateScene({ elements: convertToExcalidrawElements(templateElements(template)), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
              }
              if (api.getSceneElements().length) api.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.9, animate: false });
            }
            break;
          case 'update':
            merge(msg.elements);
            break;
          case 'file':
            void loadRoomFiles([msg.file]);
            break;
          case 'peers':
            showPeers(msg.peers);
            break;
          case 'cursor': {
            const sid = msg.sid as SocketId;
            const had = collaborators.current.get(sid);
            if (!had) break;
            const next = new Map(collaborators.current);
            next.set(sid, {
              ...had,
              pointer: { x: msg.x, y: msg.y, tool: msg.tool },
              button: msg.button,
              selectedElementIds: Object.fromEntries(msg.selected.map((id) => [id, true])) as AppState['selectedElementIds'],
            });
            collaborators.current = next;
            api.updateScene({ collaborators: next });
            break;
          }
        }
      };
      socket.onopen = () => {
        ping = setInterval(() => socket.readyState === WebSocket.OPEN && socket.send('ping'), 25_000);
      };
      socket.onclose = (ev) => {
        if (ping) clearInterval(ping);
        if (ws.current === socket) ws.current = null;
        ready.current = false;
        if (stopped) return;
        if (ev.code === 4004) return callbacks.current.onGone('deleted');
        // 4003: access changed. Reconnect straight away with a fresh ticket (it says what we may do now).
        if (ev.code === 4003) attempt = 0;
        schedule();
      };
    };

    const schedule = () => {
      if (stopped) return;
      callbacks.current.onStatus('offline');
      const wait = [300, 1000, 2000, 5000, 10000][Math.min(attempt, 4)];
      attempt++;
      retry = setTimeout(connect, wait);
    };

    // Reconnect at once when the device comes back online or the tab is shown again.
    const wake = () => {
      if (!ws.current && retry) {
        clearTimeout(retry);
        retry = null;
        void connect();
      }
    };
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', wake);

    void connect();
    return () => {
      stopped = true;
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', wake);
      if (retry) clearTimeout(retry);
      if (ping) clearInterval(ping);
      ws.current?.close(1000);
      ws.current = null;
      ready.current = false;
      if (sendTimer.current) clearTimeout(sendTimer.current);
      if (thumbTimer.current) {
        clearTimeout(thumbTimer.current);
        void saveThumbnail(); // leaving right after an edit
      }
    };
  }, [api, boardId, merge, showPeers, loadRoomFiles, uploadFiles, flush, saveThumbnail, template]);

  const onChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], _state: AppState, files: BinaryFiles) => {
      const bg = elements.some(isBackground);
      if (bg !== hasBackground.current) {
        hasBackground.current = bg;
        callbacks.current.onBackground(bg);
      }
      if (!ready.current || !editable.current) return;
      if (!sendTimer.current) sendTimer.current = setTimeout(flush, SEND_EVERY_MS);
      uploadFiles(files);
    },
    [flush, uploadFiles],
  );

  const onPointerUpdate = useCallback(
    (p: { pointer: { x: number; y: number; tool: 'pointer' | 'laser' }; button: 'down' | 'up' }) => {
      const now = Date.now();
      if (!ready.current || now - lastCursor.current < CURSOR_EVERY_MS) return;
      const moved = Math.abs(p.pointer.x - lastPos.current.x) + Math.abs(p.pointer.y - lastPos.current.y) > 0.5;
      if (!moved && p.button === lastPos.current.button) return;
      lastCursor.current = now;
      lastPos.current = { x: p.pointer.x, y: p.pointer.y, button: p.button };
      send({ type: 'cursor', x: p.pointer.x, y: p.pointer.y, tool: p.pointer.tool, button: p.button, selected: Object.keys(api?.getAppState().selectedElementIds ?? {}) });
    },
    [api, send],
  );

  // Photos from the toolbar above the canvas.
  useEffect(() => {
    if (!api) return;
    const visible = () => {
      const s = api.getAppState();
      const zoom = s.zoom.value;
      return { x: -s.scrollX, y: -s.scrollY, width: s.width / zoom, height: s.height / zoom };
    };
    const place = async (file: File, background: boolean) => {
      const photo = await preparePhoto(file, background ? 2400 : 1600);
      const id = crypto.randomUUID().replace(/-/g, '') as FileId;
      api.addFiles([{ id, dataURL: photo.dataURL as DataURL, mimeType: photo.mimeType as BinaryFileData['mimeType'], created: Date.now() }]);
      const view = visible();
      // A background fills the visible area; a photo takes up to 60% of it, in the middle.
      const fit = Math.min((view.width * (background ? 1 : 0.6)) / photo.width, (view.height * (background ? 1 : 0.6)) / photo.height);
      const width = photo.width * fit;
      const height = photo.height * fit;
      const [image] = convertToExcalidrawElements([
        {
          type: 'image',
          fileId: id,
          x: view.x + (view.width - width) / 2,
          y: view.y + (view.height - height) / 2,
          width,
          height,
          locked: background,
          customData: background ? { background: true } : undefined,
        },
      ]);
      let elements = api.getSceneElementsIncludingDeleted();
      if (background) elements = elements.map((e) => (isBackground(e) ? newElementWith(e, { isDeleted: true }) : e));
      api.updateScene({
        // The background goes underneath everything; a photo goes on top, selected.
        elements: background ? [image, ...elements] : [...elements, image],
        appState: background ? undefined : { selectedElementIds: { [image.id]: true } as AppState['selectedElementIds'] },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    };
    onControls({
      setBackground: (file) => place(file, true),
      addPhoto: (file) => place(file, false),
      removeBackground: () => {
        api.updateScene({
          elements: api.getSceneElementsIncludingDeleted().map((e) => (isBackground(e) ? newElementWith(e, { isDeleted: true }) : e)),
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
      },
    });
    return () => onControls(null);
  }, [api, onControls]);

  return (
    <div className="h-full w-full">
      <Excalidraw
        excalidrawAPI={setApi}
        onChange={onChange}
        onPointerUpdate={onPointerUpdate}
        isCollaborating
        viewModeEnabled={!canEdit}
        theme={theme}
        name={title}
        UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false, changeViewBackgroundColor: false } }}
      >
        <MainMenu>
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.Export />
          {canEdit && <MainMenu.DefaultItems.ClearCanvas />}
          <MainMenu.Separator />
          <MainMenu.DefaultItems.Help />
        </MainMenu>
        <WelcomeScreen>
          <WelcomeScreen.Hints.ToolbarHint />
          <WelcomeScreen.Hints.HelpHint />
          <WelcomeScreen.Center>
            <WelcomeScreen.Center.Heading>
              {canEdit ? 'Pick a tool and start drawing. Everyone on this board sees it live.' : 'You can view this board. Changes appear here live.'}
            </WelcomeScreen.Center.Heading>
          </WelcomeScreen.Center>
        </WelcomeScreen>
      </Excalidraw>
    </div>
  );
}

import { route } from '@/server/assignments';
import { conversationDevices, registerDevice, removeDevice } from '@/server/chat-keys';

// Device keys for private chats (Stage 5 · B7.6).
export const GET = (req: Request) => route(req, async (user) => conversationDevices(user, new URL(req.url).searchParams.get('conversationId') ?? ''));
export const POST = (req: Request) => route(req, async (user) => registerDevice(user, await req.json().catch(() => ({}))));
export const DELETE = (req: Request) => route(req, async (user) => removeDevice(user, new URL(req.url).searchParams.get('deviceId') ?? ''));

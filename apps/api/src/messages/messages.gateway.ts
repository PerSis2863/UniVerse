import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { MessagesService } from './messages.service';
import { TokenAuthService } from '../auth/token-auth.service';

const userRoom = (userId: string) => `user:${userId}`;

/**
 * Real-time chat. Clients authenticate with the same token they use for the REST API
 * (Firebase ID token, or an allowlisted demo token), sent as `auth.token` on connect.
 * Each user joins a private room, so messages reach every open tab/device of that user.
 */
@WebSocketGateway({
  cors: { origin: true, credentials: true },
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MessagesGateway.name);

  constructor(
    private readonly messagesService: MessagesService,
    private readonly tokenAuth: TokenAuthService,
  ) {}

  async handleConnection(socket: Socket) {
    try {
      const raw = socket.handshake.auth?.token ?? socket.handshake.headers.authorization;
      const token = TokenAuthService.extractBearer(raw);
      if (!token) throw new Error('missing token');
      const user = await this.tokenAuth.resolveUser(token);
      socket.data.userId = user.id;
      await socket.join(userRoom(user.id));
      this.server.emit('user_status', { userId: user.id, status: 'online' });
    } catch (e) {
      socket.emit('auth_error', { message: 'Authentication failed' });
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: Socket) {
    const userId: string | undefined = socket.data?.userId;
    if (!userId) return;
    // Only report offline when the user's last connection closes.
    const remaining = await this.server.in(userRoom(userId)).fetchSockets();
    if (remaining.length === 0) {
      this.server.emit('user_status', { userId, status: 'offline', lastSeen: new Date().toISOString() });
    }
  }

  /** Pushes a stored message to the receiver's devices (also used by the REST send endpoint). */
  deliver(receiverId: string, message: unknown) {
    this.server?.to(userRoom(receiverId)).emit('receive_message', message);
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @MessageBody() data: { receiverId: string; body: string },
    @ConnectedSocket() socket: Socket,
  ) {
    const senderId: string | undefined = socket.data?.userId;
    if (!senderId) return { ok: false, error: 'Not authenticated' };
    try {
      const message = await this.messagesService.sendMessage(senderId, data?.receiverId, data?.body);
      this.deliver(data.receiverId, message);
      // Other tabs of the sender see it too.
      socket.to(userRoom(senderId)).emit('receive_message', message);
      // Plain object (no `event` key) so Nest passes it to the client's acknowledgement callback.
      return { ok: true, data: message };
    } catch (e) {
      this.logger.warn(`send_message failed: ${(e as Error).message}`);
      return { ok: false, error: (e as Error).message };
    }
  }

  @SubscribeMessage('typing')
  handleTyping(@MessageBody() data: { receiverId: string }, @ConnectedSocket() socket: Socket) {
    const senderId: string | undefined = socket.data?.userId;
    if (!senderId || !data?.receiverId || data.receiverId === senderId) return;
    this.server.to(userRoom(data.receiverId)).emit('user_typing', { senderId });
  }
}

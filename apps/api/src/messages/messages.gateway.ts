import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MessagesService } from './messages.service';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private userSockets = new Map<string, string>(); // userId -> socketId

  constructor(
    private readonly messagesService: MessagesService,
    private readonly jwtService: JwtService
  ) {}

  async handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.auth.token?.split(' ')[1] || socket.handshake.headers.authorization?.split(' ')[1];
      if (!token) {
        socket.disconnect();
        return;
      }
      
      const payload = this.jwtService.verify(token);
      const userId = payload.sub;
      
      this.userSockets.set(userId, socket.id);
      
      // Notify contacts that user is online
      this.server.emit('user_status', { userId, status: 'online' });
    } catch (e) {
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket) {
    let disconnectedUserId = null;
    for (const [userId, socketId] of this.userSockets.entries()) {
      if (socketId === socket.id) {
        disconnectedUserId = userId;
        this.userSockets.delete(userId);
        break;
      }
    }
    
    if (disconnectedUserId) {
      this.server.emit('user_status', { 
        userId: disconnectedUserId, 
        status: 'offline', 
        lastSeen: new Date().toISOString() 
      });
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @MessageBody() data: { receiverId: string; body: string },
    @ConnectedSocket() socket: Socket
  ) {
    // Find the sender's userId based on socket.id
    let senderId = null;
    for (const [userId, socketId] of this.userSockets.entries()) {
      if (socketId === socket.id) {
        senderId = userId;
        break;
      }
    }

    if (!senderId) return;

    // Save to DB
    const message = await this.messagesService.sendMessage(
      senderId,
      data.receiverId,
      data.body
    );

    // If the receiver is connected, emit to them
    const receiverSocketId = this.userSockets.get(data.receiverId);
    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('receive_message', message);
    }

    // Acknowledge back to the sender so they can update their local UI with the DB ID
    return { event: 'message_sent', data: message };
  }
  
  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() data: { receiverId: string },
    @ConnectedSocket() socket: Socket
  ) {
    let senderId = null;
    for (const [userId, socketId] of this.userSockets.entries()) {
      if (socketId === socket.id) {
        senderId = userId;
        break;
      }
    }
    
    if (!senderId) return;
    
    const receiverSocketId = this.userSockets.get(data.receiverId);
    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('user_typing', { senderId });
    }
  }
}

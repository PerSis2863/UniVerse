import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  async getMessages(userId: string) {
    const received = await this.prisma.message.findMany({
      where: { receiverId: userId },
      include: {
        sender: {
          select: { id: true, name: true, email: true, avatar: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const sent = await this.prisma.message.findMany({
      where: { senderId: userId },
      include: {
        receiver: {
          select: { id: true, name: true, email: true, avatar: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return { received, sent };
  }

  async sendMessage(senderId: string, receiverId: string, subject: string, body: string) {
    return this.prisma.message.create({
      data: {
        senderId,
        receiverId,
        subject,
        body,
      },
      include: {
        sender: {
          select: { id: true, name: true, email: true, avatar: true }
        },
        receiver: {
          select: { id: true, name: true, email: true, avatar: true }
        }
      }
    });
  }

  async markAsRead(messageId: string, userId: string) {
    return this.prisma.message.updateMany({
      where: { id: messageId, receiverId: userId },
      data: { read: true }
    });
  }
}

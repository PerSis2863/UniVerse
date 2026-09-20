import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  async getConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: {
        participants: {
          some: { userId }
        }
      },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, name: true, avatar: true, role: true }
            }
          }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  async getMessages(conversationId: string, userId: string) {
    // Verify user is in conversation
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId }
      }
    });

    if (!participant) {
      throw new NotFoundException('Conversation not found');
    }

    return this.prisma.message.findMany({
      where: { conversationId },
      include: {
        sender: {
          select: { id: true, name: true, avatar: true, role: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });
  }

  async sendMessage(senderId: string, receiverId: string, body: string) {
    // Check if 1-on-1 conversation already exists
    let conversation = await this.prisma.conversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: senderId } } },
          { participants: { some: { userId: receiverId } } }
        ]
      }
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          participants: {
            create: [
              { userId: senderId },
              { userId: receiverId }
            ]
          }
        }
      });
    }

    // Update conversation timestamp
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() }
    });

    return this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId,
        body,
      },
      include: {
        sender: {
          select: { id: true, name: true, avatar: true, role: true }
        }
      }
    });
  }

  async markAsRead(conversationId: string, userId: string) {
    // Find all messages in the conversation sent by OTHERS
    return this.prisma.message.updateMany({
      where: { 
        conversationId,
        senderId: { not: userId },
        read: false
      },
      data: { read: true }
    });
  }
}

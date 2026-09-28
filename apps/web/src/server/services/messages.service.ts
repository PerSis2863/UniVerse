import { BadRequestException, NotFoundException } from '../http';

const MAX_MESSAGE_LENGTH = 5000;
import prisma from '@/lib/db';

export class MessagesService {
  async getConversations(userId: string) {
    return prisma.conversation.findMany({
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
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId }
      }
    });

    if (!participant) {
      throw new NotFoundException('Conversation not found');
    }

    return prisma.message.findMany({
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
    const text = typeof body === 'string' ? body.trim() : '';
    if (!text) throw new BadRequestException('Message cannot be empty');
    if (text.length > MAX_MESSAGE_LENGTH) throw new BadRequestException(`Message is too long (max ${MAX_MESSAGE_LENGTH} characters)`);
    if (!receiverId || typeof receiverId !== 'string') throw new BadRequestException('receiverId is required');
    if (receiverId === senderId) throw new BadRequestException('You cannot message yourself');
    const receiver = await prisma.user.findUnique({ where: { id: receiverId }, select: { id: true } });
    if (!receiver) throw new NotFoundException('Recipient not found');

    // Check if 1-on-1 conversation already exists
    let conversation = await prisma.conversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: senderId } } },
          { participants: { some: { userId: receiverId } } }
        ]
      }
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
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
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() }
    });

    return prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId,
        body: text,
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
    return prisma.message.updateMany({
      where: { 
        conversationId,
        senderId: { not: userId },
        read: false
      },
      data: { read: true }
    });
  }
}

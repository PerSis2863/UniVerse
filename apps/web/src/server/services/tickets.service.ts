
import prisma from '@/lib/db';
import type { CreateTicketDto } from '../dto';

export class TicketsService {
  async create(userId: string, createTicketDto: CreateTicketDto) {
    return prisma.ticket.create({
      data: {
        ...createTicketDto,
        authorId: userId,
      },
    });
  }

  async findAll(userId: string) {
    return prisma.ticket.findMany({
      where: {
        authorId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(userId: string, id: string) {
    return prisma.ticket.findUnique({
      where: {
        id,
        authorId: userId,
      },
    });
  }
}

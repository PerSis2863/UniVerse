import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AssociationsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.association.findMany({
      orderBy: { members: 'desc' },
    });
  }

  async findOne(id: string) {
    const association = await this.prisma.association.findUnique({
      where: { id },
    });
    if (!association) throw new NotFoundException('Association not found');
    return association;
  }

  async join(associationId: string, userId: string) {
    // Check if association exists
    await this.findOne(associationId);

    // Create membership (will throw unique constraint error if already joined, which is fine to bubble up for now or handle)
    const membership = await this.prisma.associationMembership.create({
      data: {
        associationId,
        userId,
      },
    });

    // Increment member count
    await this.prisma.association.update({
      where: { id: associationId },
      data: { members: { increment: 1 } },
    });

    return membership;
  }

  async leave(associationId: string, userId: string) {
    // Check if membership exists
    const membership = await this.prisma.associationMembership.findUnique({
      where: {
        userId_associationId: {
          userId,
          associationId,
        },
      },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    // Delete membership
    await this.prisma.associationMembership.delete({
      where: { id: membership.id },
    });

    // Decrement member count
    await this.prisma.association.update({
      where: { id: associationId },
      data: { members: { decrement: 1 } },
    });

    return { success: true };
  }

  getUserMemberships(userId: string) {
    return this.prisma.associationMembership.findMany({
      where: { userId },
      include: { association: true },
    });
  }
}

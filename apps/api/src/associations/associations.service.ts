import { Injectable, NotFoundException } from '@nestjs/common';
import { AssociationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { differenceInYears } from 'date-fns';

@Injectable()
export class AssociationsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.association.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { memberships: true }
        }
      }
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

  async create(data: { name: string; category: string; description: string; requirements: string; }, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { studentProfile: true },
    });

    if (!user || user.role !== 'STUDENT' || !user.studentProfile) {
      throw new Error('Only students can create associations.');
    }

    if (!user.dateOfBirth) {
      throw new Error('Date of Birth is required for eligibility check.');
    }

    const age = differenceInYears(new Date(), user.dateOfBirth);
    if (age < 18) {
      throw new Error('You must be at least 18 years old to create an association.');
    }

    if (user.studentProfile.gpa < 2.5) {
      throw new Error('A minimum GPA of 2.5 is required to create an association.');
    }

    if (user.studentProfile.year < 2) {
      throw new Error('You must be at least in your 2nd year to create an association.');
    }

    const association = await this.prisma.association.create({
      data: {
        name: data.name,
        category: data.category,
        description: data.description,
        status: 'PENDING',
        budget: 0,
      },
    });

    // Make the creator a member automatically (maybe the founder/admin)
    await this.prisma.associationMembership.create({
      data: {
        associationId: association.id,
        userId: userId,
        role: 'FOUNDER',
      },
    });
    
    await this.prisma.association.update({
      where: { id: association.id },
      data: { members: 1 },
    });

    return association;
  }

  async updateStatus(id: string, status: AssociationStatus) {
    const association = await this.prisma.association.update({
      where: { id },
      data: { status },
      include: {
        memberships: {
          where: { role: 'FOUNDER' },
          include: { user: true }
        }
      }
    });

    // Notify founder
    const founderMembership = association.memberships[0];
    if (founderMembership) {
      const founderId = founderMembership.userId;
      const founder = founderMembership.user;
      const message = `Your association "${association.name}" has been ${status.toLowerCase()}.`;

      // In-app notification
      await this.prisma.notification.create({
        data: {
          userId: founderId,
          title: `Association ${status}`,
          body: message,
          type: 'SYSTEM',
        }
      });

      // Email notification placeholder (in a real app, send actual email)
      console.log(`[EMAIL NOTIFICATION] To: ${founder.email} - Subject: Association ${status} - Body: ${message}`);
    }

    return association;
  }

  async update(id: string, data: any) {
    return this.prisma.association.update({
      where: { id },
      data,
    });
  }
}

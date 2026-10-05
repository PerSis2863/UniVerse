import { joinClubSpace } from '../campus-life';
import { NotFoundException } from '../http';
import { AssociationStatus } from '@prisma/client';
import prisma from '@/lib/db';
import { differenceInYears } from 'date-fns';

export class AssociationsService {
  findAll() {
    return prisma.association.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { memberships: true }
        }
      }
    });
  }

  async findOne(id: string) {
    const association = await prisma.association.findUnique({
      where: { id },
    });
    if (!association) throw new NotFoundException('Association not found');
    return association;
  }

  async join(associationId: string, userId: string) {
    // Check if association exists
    await this.findOne(associationId);

    // Create membership (will throw unique constraint error if already joined, which is fine to bubble up for now or handle)
    const membership = await prisma.associationMembership.create({
      data: {
        associationId,
        userId,
      },
    });

    // Increment member count
    await prisma.association.update({
      where: { id: associationId },
      data: { members: { increment: 1 } },
    });
    // The club's own space (upgrade 7): new members join it too.
    await joinClubSpace(associationId, userId).catch(() => {});

    return membership;
  }

  async leave(associationId: string, userId: string) {
    // Check if membership exists
    const membership = await prisma.associationMembership.findUnique({
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
    await prisma.associationMembership.delete({
      where: { id: membership.id },
    });

    // Decrement member count
    await prisma.association.update({
      where: { id: associationId },
      data: { members: { decrement: 1 } },
    });

    return { success: true };
  }

  /** Admin view: every membership with the member's details (newest first, capped). */
  findAllMembershipsForAdmin() {
    return prisma.associationMembership.findMany({
      orderBy: { joinedAt: 'desc' },
      take: 1000,
      select: {
        id: true, role: true, joinedAt: true, associationId: true,
        user: {
          select: {
            id: true, name: true, email: true, role: true, status: true, phone: true,
            studentProfile: { select: { department: true, year: true } },
          },
        },
      },
    });
  }

  getUserMemberships(userId: string) {
    return prisma.associationMembership.findMany({
      where: { userId },
      include: { association: true },
    });
  }

  async create(data: { name: string; category: string; description: string; requirements: string; }, userId: string) {
    const user = await prisma.user.findUnique({
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

    const association = await prisma.association.create({
      data: {
        name: data.name,
        category: data.category,
        description: data.description,
        status: 'PENDING',
        budget: 0,
      },
    });

    // Make the creator a member automatically (maybe the founder/admin)
    await prisma.associationMembership.create({
      data: {
        associationId: association.id,
        userId: userId,
        role: 'FOUNDER',
      },
    });
    
    await prisma.association.update({
      where: { id: association.id },
      data: { members: 1 },
    });

    return association;
  }

  async updateStatus(id: string, status: AssociationStatus) {
    const association = await prisma.association.update({
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
      await prisma.notification.create({
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
    return prisma.association.update({
      where: { id },
      data,
    });
  }
}

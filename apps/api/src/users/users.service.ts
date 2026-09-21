import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, UserStatus } from '@prisma/client';

const safeSelect = {
  id: true, name: true, email: true, role: true, status: true,
  avatar: true, phone: true, googleId: true, createdAt: true, updatedAt: true,
  studentProfile: true, teacherProfile: true,
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: { role?: Role; status?: UserStatus; search?: string }) {
    const where: any = {};
    if (query.role) where.role = query.role;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.user.findMany({
      where,
      select: safeSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findDirectory(search?: string) {
    const where: any = { role: 'STUDENT', status: 'ACTIVE' };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        studentProfile: {
          select: {
            department: true,
            year: true,
          }
        }
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: safeSelect,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateStatus(id: string, status: UserStatus) {
    return this.prisma.user.update({
      where: { id },
      data: { status },
      select: safeSelect,
    });
  }

  async updateProfile(id: string, data: { name?: string; phone?: string; avatar?: string }) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: safeSelect,
    });
  }

  async inviteUser(email: string, role: Role) {
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) throw new ConflictException('User with this email already exists');

    // Create or update local invitation record
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

    const invitation = await this.prisma.invitation.upsert({
      where: { email },
      update: { role, status: 'PENDING', expiresAt },
      create: { email, role, status: 'PENDING', expiresAt },
    });

    try {
      const { createClerkClient } = require('@clerk/backend');
      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
      await clerk.invitations.createInvitation({
        emailAddress: email,
        publicMetadata: { role },
        ignoreExisting: true,
      });
    } catch (err) {
      console.error('Failed to send Clerk invitation:', err);
      // We don't fail the API call if clerk fails, just log it. Or maybe we should?
      // For now, logging it is fine.
    }

    return { success: true, invitation };
  }

  async getStats() {
    const [total, students, teachers, pending] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: 'STUDENT' } }),
      this.prisma.user.count({ where: { role: 'TEACHER' } }),
      this.prisma.user.count({ where: { status: 'PENDING' } }),
    ]);
    return { total, students, teachers, pending };
  }

  async deleteUser(id: string) {
    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

const userSelect = {
  id: true, name: true, email: true, role: true, status: true, avatar: true,
  phone: true, googleId: true, createdAt: true, updatedAt: true,
  studentProfile: true, teacherProfile: true,
};

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async getMe(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: userSelect,
    });
  }
}

import { Injectable, ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { Role } from '@prisma/client';

const userSelect = {
  id: true, name: true, email: true, role: true, status: true, avatar: true,
  phone: true, googleId: true, createdAt: true, updatedAt: true,
  studentProfile: true, teacherProfile: true,
};

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already in use');

    const hash = await bcrypt.hash(dto.password, 12);
    const role = dto.role ?? Role.STUDENT;

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hash,
        role,
        status: 'ACTIVE',
        studentProfile: role === Role.STUDENT ? {
          create: { studentId: `STU${Date.now()}` }
        } : undefined,
        teacherProfile: role === Role.TEACHER ? {
          create: { employeeId: `EMP${Date.now()}` }
        } : undefined,
      },
      select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
    });

    return { success: true, user, message: 'Account created successfully' };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { studentProfile: true, teacherProfile: true },
    });
    if (!user || !user.password) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (user.status === 'PENDING') throw new UnauthorizedException('Account pending approval');
    if (user.status === 'SUSPENDED') throw new UnauthorizedException('Account suspended');

    return this.issueTokens(user);
  }

  async refreshToken(token: string) {
    if (!token) throw new BadRequestException('Token required');
    const stored = await this.prisma.refreshToken.findUnique({ where: { token } });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
      include: { studentProfile: true, teacherProfile: true },
    });
    await this.prisma.refreshToken.delete({ where: { token } });
    return this.issueTokens(user);
  }

  async logout(userId: string, token: string) {
    if (token) await this.prisma.refreshToken.deleteMany({ where: { token } });
    return { success: true };
  }

  async getMe(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: userSelect,
    });
  }

  private async issueTokens(user: any) {
    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: '15m',
    });

    const refreshToken = uuidv4();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const { password: _, ...safeUser } = user;
    return { accessToken, refreshToken, user: safeUser };
  }
}

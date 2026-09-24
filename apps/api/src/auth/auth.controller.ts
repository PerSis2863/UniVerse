import { Controller, Post, Get, Body, UseGuards, HttpCode, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('me')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  me(@CurrentUser() user: any) {
    return this.authService.getMe(user.id);
  }

  @Post('login')
  async login(@Body() body: any) {
    if (body.email?.startsWith('demo@')) {
      const user = await this.authService.getMeByEmail(body.email);
      if (user) {
        return {
          accessToken: `mock-token-${user.id}`,
          refreshToken: `mock-token-${user.id}`,
          user
        };
      }
    }
    throw new UnauthorizedException('Invalid credentials');
  }

  @Post('register')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  async register(@CurrentUser() user: any, @Body() body: { name?: string; role?: string }) {
    // Update role and name if provided (happens after Firebase social auth)
    const allowedRoles: Role[] = [Role.STUDENT, Role.TEACHER, Role.ADMIN];
    const updateData: any = {};
    if (body.name && body.name.trim()) updateData.name = body.name.trim();
    if (body.role && allowedRoles.includes(body.role as Role)) {
      updateData.role = body.role as Role;
    }
    if (Object.keys(updateData).length > 0) {
      await this.prisma.user.update({ where: { id: user.id }, data: updateData });
    }
    return this.authService.getMe(user.id);
  }
}

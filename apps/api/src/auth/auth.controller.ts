import { Controller, Post, Get, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(ClerkAuthGuard)
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
    throw new import('@nestjs/common').UnauthorizedException('Invalid credentials');
  }
}

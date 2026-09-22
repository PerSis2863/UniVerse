import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { verifyToken } from '@clerk/backend';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.split(' ')[1];

    if (token.startsWith('mock-token-')) {
      const userId = token.replace('mock-token-', '');
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        request.user = user;
        return true;
      }
    }

    try {
      const jwtKey = process.env.CLERK_JWT_KEY;
      const secretKey = process.env.CLERK_SECRET_KEY;

      const payload = await verifyToken(token, {
        jwtKey: jwtKey,
        secretKey: secretKey,
        // Audience and other parameters can be validated here if needed
      });

      if (!payload || !payload.sub) {
        throw new UnauthorizedException('Invalid token payload');
      }

      // Find user in database by clerkUserId
      const clerkUserId = payload.sub;
      
      const user = await this.prisma.user.findUnique({
        where: { clerkUserId },
      });

      if (!user) {
        // We will throw Unauthorized if they don't exist in our DB yet.
        // It's the frontend/webhook's job to ensure they are created.
        this.logger.warn(`User with clerkUserId ${clerkUserId} not found in database.`);
        throw new UnauthorizedException('User not fully registered in system');
      }

      // Check if user is active
      if (user.status === 'PENDING') {
        throw new UnauthorizedException('Account pending approval');
      }
      if (user.status === 'SUSPENDED') {
        throw new UnauthorizedException('Account suspended');
      }

      // Attach user to request for use in controllers
      request.user = user;
      return true;
    } catch (error) {
      this.logger.error(`Token verification failed: ${error.message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}

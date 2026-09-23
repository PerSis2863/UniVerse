import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { getAuth } from 'firebase-admin/auth';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);

  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.split(' ')[1];

    // Support for demo accounts / mock tokens
    if (token.startsWith('mock-token-')) {
      const identifier = token.replace('mock-token-', '');
      let user;
      if (identifier.includes('@')) {
        user = await this.prisma.user.findUnique({ where: { email: identifier } });
      } else {
        user = await this.prisma.user.findUnique({ where: { id: identifier } });
      }
      
      if (user) {
        request.user = user;
        return true;
      }
    }

    try {
      // Verify Firebase ID Token
      const decodedToken = await getAuth().verifyIdToken(token);

      if (!decodedToken || !decodedToken.uid) {
        throw new UnauthorizedException('Invalid Firebase token payload');
      }

      // Check if user exists in database by firebaseUid or email
      const firebaseUid = decodedToken.uid;
      let user = await this.prisma.user.findUnique({
        where: { firebaseUid },
      });

      // User sync / Upsert logic
      if (!user && decodedToken.email) {
        // Try linking by email if they signed in with Google
        user = await this.prisma.user.findUnique({
          where: { email: decodedToken.email }
        });

        if (user) {
          // Link firebase UID to existing user
          user = await this.prisma.user.update({
            where: { email: decodedToken.email },
            data: { firebaseUid: firebaseUid }
          });
        }
      }

      if (!user) {
        // Auto-create user for new Firebase sign-ins (first-time Google/Apple/Phone login)
        if (!decodedToken.email && !decodedToken.phone_number) {
          throw new UnauthorizedException('No email or phone associated with Firebase account');
        }
        user = await this.prisma.user.create({
          data: {
            firebaseUid: firebaseUid,
            email: decodedToken.email || `${firebaseUid}@phone.local`,
            name: decodedToken.name || decodedToken.email?.split('@')[0] || 'User',
            role: 'STUDENT',
            avatar: decodedToken.picture || null,
          }
        });
        this.logger.log(`Auto-created new user for Firebase UID: ${firebaseUid}`);
      }

      request.user = user;
      return true;

    } catch (error) {
      this.logger.error(`Token verification failed: ${error.message}`);
      throw new UnauthorizedException('Invalid or expired authentication token');
    }
  }
}

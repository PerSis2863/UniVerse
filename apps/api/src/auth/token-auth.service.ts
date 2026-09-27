import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { getAuth } from 'firebase-admin/auth';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isDemoAccount, isDemoLoginEnabled } from './demo-accounts';

/**
 * Turns a bearer token into a platform user. Shared by the HTTP guard and the
 * real-time chat gateway so both authenticate exactly the same way.
 *
 * Accepts:
 *  - Firebase ID tokens (the normal sign-in path; users are linked/created on first use)
 *  - "mock-token-<email|id>" demo tokens, only for allowlisted demo accounts and only
 *    when demo login is enabled (see demo-accounts.ts)
 */
@Injectable()
export class TokenAuthService {
  private readonly logger = new Logger(TokenAuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  static extractBearer(value: string | undefined | null): string | null {
    if (!value || typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (trimmed.toLowerCase().startsWith('bearer ')) return trimmed.slice(7).trim() || null;
    return trimmed || null;
  }

  async resolveUser(token: string): Promise<User> {
    if (!token) throw new UnauthorizedException('Missing authentication token');

    if (token.startsWith('mock-token-')) {
      if (!isDemoLoginEnabled()) throw new UnauthorizedException('Demo login is disabled');
      const identifier = token.slice('mock-token-'.length);
      const user = identifier.includes('@')
        ? await this.prisma.user.findUnique({ where: { email: identifier } })
        : await this.prisma.user.findUnique({ where: { id: identifier } });
      if (!user || !isDemoAccount(user.email)) throw new UnauthorizedException('Invalid demo token');
      return user;
    }

    let decoded: Awaited<ReturnType<ReturnType<typeof getAuth>['verifyIdToken']>>;
    try {
      decoded = await getAuth().verifyIdToken(token);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      // Expired tokens are routine (clients refresh and retry); log them quietly.
      if (code === 'auth/id-token-expired') this.logger.debug('Rejected expired Firebase ID token');
      else this.logger.warn(`Token verification failed: ${(error as Error).message}`);
      throw new UnauthorizedException(code === 'auth/id-token-expired' ? 'Authentication token expired' : 'Invalid authentication token');
    }
    if (!decoded?.uid) throw new UnauthorizedException('Invalid Firebase token payload');

    const firebaseUid = decoded.uid;
    let user = await this.prisma.user.findUnique({ where: { firebaseUid } });

    if (!user && decoded.email) {
      // Link an existing account (e.g. created before Google sign-in) by email.
      const byEmail = await this.prisma.user.findUnique({ where: { email: decoded.email } });
      if (byEmail) {
        // Only link when the sign-in proves ownership of the email, and never take over an
        // account that is already tied to a different sign-in. Firebase email/password accounts
        // are not verified by default, so without this anyone could claim an existing account
        // (including an admin's) just by registering with its email address.
        if (byEmail.firebaseUid && byEmail.firebaseUid !== firebaseUid) {
          throw new UnauthorizedException('This email is already linked to a different sign-in method.');
        }
        if (!decoded.email_verified) {
          throw new UnauthorizedException('Please sign in with Google or verify your email address to access this account.');
        }
        user = await this.prisma.user.update({ where: { email: decoded.email }, data: { firebaseUid } });
      }
    }

    if (!user) {
      if (!decoded.email && !decoded.phone_number) {
        throw new UnauthorizedException('No email or phone associated with Firebase account');
      }
      user = await this.prisma.user.create({
        data: {
          firebaseUid,
          email: decoded.email || `${firebaseUid}@phone.local`,
          name: decoded.name || decoded.email?.split('@')[0] || 'User',
          role: 'STUDENT',
          avatar: decoded.picture || null,
        },
      });
      this.logger.log(`Auto-created new user for Firebase UID: ${firebaseUid}`);
    }

    return user;
  }
}

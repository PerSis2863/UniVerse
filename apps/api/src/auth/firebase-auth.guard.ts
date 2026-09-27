import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { TokenAuthService } from './token-auth.service';

/** HTTP guard: authenticates the "Authorization: Bearer <token>" header via TokenAuthService. */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(private readonly tokenAuth: TokenAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }
    const token = TokenAuthService.extractBearer(authHeader);
    request.user = await this.tokenAuth.resolveUser(token);
    return true;
  }
}

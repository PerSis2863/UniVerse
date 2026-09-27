import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { TokenAuthService } from './token-auth.service';
import { PrismaModule } from '../prisma/prisma.module';

// Global so every feature module can use FirebaseAuthGuard (which needs TokenAuthService)
// without importing AuthModule individually.
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [AuthService, FirebaseAuthGuard, TokenAuthService],
  exports: [AuthService, FirebaseAuthGuard, TokenAuthService],
})
export class AuthModule {}

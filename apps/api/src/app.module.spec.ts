jest.mock('svix', () => ({ Webhook: class {} }));
jest.mock('puppeteer', () => ({ __esModule: true, default: { launch: async () => ({}) } }));
jest.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: async () => { throw new Error('no'); } }) }));
jest.mock('firebase-admin/app', () => ({ getApps: () => [], initializeApp: () => ({}), cert: () => ({}) }));
jest.mock('firebase-admin/messaging', () => ({ getMessaging: () => ({}) }));
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { MessagesGateway } from './messages/messages.gateway';
import { ImpactService } from './impact/impact.service';
import { FirebaseAuthGuard } from './auth/firebase-auth.guard';

// Resolves the full dependency-injection graph (catches missing providers/imports) without a database.
describe('AppModule wiring', () => {
  it('compiles with all providers resolvable', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    expect(moduleRef.get(MessagesGateway)).toBeDefined();
    expect(moduleRef.get(ImpactService)).toBeDefined();
    expect(moduleRef.get(FirebaseAuthGuard)).toBeDefined();
    await moduleRef.close();
  }, 30000);
});

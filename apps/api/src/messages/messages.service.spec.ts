import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';

describe('MessagesService.sendMessage validation', () => {
  const prisma: any = {
    user: { findUnique: async ({ where }: any) => (where.id === 'u2' ? { id: 'u2' } : null) },
    conversation: { findFirst: async () => ({ id: 'c1' }), update: async () => ({}) },
    message: { create: async ({ data }: any) => ({ id: 'm1', ...data }) },
  };
  const svc = new MessagesService(prisma);

  it('rejects empty, oversized, self and unknown-recipient messages', async () => {
    await expect(svc.sendMessage('u1', 'u2', '   ')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.sendMessage('u1', 'u2', 'x'.repeat(5001))).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.sendMessage('u1', 'u1', 'hi')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.sendMessage('u1', 'nobody', 'hi')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stores trimmed text', async () => {
    await expect(svc.sendMessage('u1', 'u2', '  hello  ')).resolves.toMatchObject({ body: 'hello', conversationId: 'c1', senderId: 'u1' });
  });
});

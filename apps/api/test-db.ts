import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'demo@student.com' }});
  if (!user) { console.log('User not found'); return; }
  const convs = await prisma.conversation.findMany({
    where: { participants: { some: { userId: user.id } } },
    include: { messages: true, participants: { include: { user: true } } }
  });
  console.log(`User ${user.email} has ${convs.length} conversations`);
  console.dir(convs, { depth: null });
}
main().finally(() => prisma.$disconnect());

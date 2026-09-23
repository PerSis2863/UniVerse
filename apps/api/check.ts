import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const student = await prisma.user.findUnique({ where: { email: 'demo@student.com' } });
  console.log('Student ID:', student?.id);
  
  const convs = await prisma.conversation.findMany({
    include: {
      participants: { include: { user: true } },
      messages: true
    }
  });
  console.log('Conversations:', JSON.stringify(convs, null, 2));
}
main().catch(console.error);

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding mock messages...');

  // Get demo users
  const student = await prisma.user.findUnique({ where: { email: 'student@universe.edu' } });
  const teacher = await prisma.user.findUnique({ where: { email: 'teacher@universe.edu' } });
  const admin = await prisma.user.findUnique({ where: { email: 'admin@universe.edu' } });

  if (!student || !teacher || !admin) {
    console.error('Demo users not found. Run standard seed first.');
    return;
  }

  // Create messages
  await prisma.message.createMany({
    data: [
      {
        subject: 'Welcome to UniVerse!',
        body: 'Welcome to the UniVerse student portal. We are excited to have you here. Please reach out if you have any questions about navigating your dashboard.',
        senderId: admin.id,
        receiverId: student.id,
        read: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48), // 2 days ago
      },
      {
        subject: 'Question about Assignment 1',
        body: 'Hi Professor, I was wondering if we need to include references in APA format for the first assignment?',
        senderId: student.id,
        receiverId: teacher.id,
        read: true,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
      },
      {
        subject: 'Re: Question about Assignment 1',
        body: 'Yes, please use APA format for all references in your assignments unless stated otherwise. Good luck!',
        senderId: teacher.id,
        receiverId: student.id,
        read: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
      }
    ]
  });

  console.log('Mock messages seeded successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const myEmail = 'myuniverseimpact@gmail.com';

  // 1. Ensure target user exists
  let mainUser = await prisma.user.findUnique({
    where: { email: myEmail },
  });

  if (!mainUser) {
    mainUser = await prisma.user.create({
      data: {
        email: myEmail,
        name: 'John Doe',
        role: 'STUDENT',
      },
    });
    console.log(`Created main user: ${myEmail}`);
  } else {
    console.log(`Found main user: ${myEmail}`);
  }

  // 2. Ensure some other users exist
  const dummyUsersData = [
    { email: 'professor.smith@universe.edu', name: 'Prof. Alan Smith', role: 'TEACHER' as const },
    { email: 'alice.chen@universe.edu', name: 'Alice Chen', role: 'STUDENT' as const },
    { email: 'student.support@universe.edu', name: 'Student Support', role: 'ADMIN' as const },
  ];

  const dummyUsers = [];
  for (const data of dummyUsersData) {
    let u = await prisma.user.findUnique({ where: { email: data.email } });
    if (!u) {
      u = await prisma.user.create({
        data,
      });
    }
    dummyUsers.push(u);
  }

  // 3. Create Conversations & Messages
  for (const otherUser of dummyUsers) {
    // Check if conversation already exists
    let conv = await prisma.conversation.findFirst({
      where: {
        participants: {
          every: {
            userId: { in: [mainUser.id, otherUser.id] },
          },
        },
      },
    });

    if (!conv) {
      conv = await prisma.conversation.create({
        data: {
          participants: {
            create: [
              { userId: mainUser.id },
              { userId: otherUser.id },
            ],
          },
        },
      });
      
      // Create some messages
      await prisma.message.createMany({
        data: [
          {
            conversationId: conv.id,
            senderId: otherUser.id,
            body: `Hi there! I wanted to reach out regarding the upcoming project.`,
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
          },
          {
            conversationId: conv.id,
            senderId: mainUser.id,
            body: `Hello ${otherUser.name.split(' ')[0]}, absolutely! Let's discuss it.`,
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1), // 1 day ago
            read: true,
          },
          {
            conversationId: conv.id,
            senderId: otherUser.id,
            body: `Great. I've sent you the files via the portal. Let me know if you have any questions!`,
            createdAt: new Date(Date.now() - 1000 * 60 * 15), // 15 mins ago
            read: false,
          },
        ],
      });
      console.log(`Seeded conversation with ${otherUser.name}`);
    } else {
      console.log(`Conversation with ${otherUser.name} already exists.`);
    }
  }

  console.log('✅ Message seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

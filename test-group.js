const { PrismaClient } = require('./apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    const user = await prisma.user.findFirst();
    if (!user) {
      console.log("No user found.");
      return;
    }
    console.log("User ID:", user.id);
    const res = await fetch('http://localhost:4000/api/groups', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer mock-token-${user.id}` 
      },
      body: JSON.stringify({
        name: "Test Group",
        type: "Study",
        isPublic: true
      })
    });
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Body:", text);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await prisma.$disconnect();
  }
}
test();

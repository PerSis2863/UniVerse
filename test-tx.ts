import { createTransaction } from './apps/web/src/app/actions/transaction';

async function run() {
  console.log("Creating tx...");
  try {
    const tx = await createTransaction({
      amount: 10,
      description: 'Test',
      status: 'PENDING',
      userEmail: 'myuniverseimpact@gmail.com'
    });
    console.log("Returned tx:", tx);
  } catch (e) {
    console.error("Error:", e);
  }
}
run();

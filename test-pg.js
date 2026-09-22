const { Client } = require('pg');

async function checkDb() {
  const client = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://universe_user:universe_pass@localhost:5432/universe_local' });
  try {
    await client.connect();
    console.log('Local DB connected');
    await client.end();
  } catch (err) {
    console.error('Local DB failed');
  }
}
checkDb();

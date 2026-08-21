// test-db.js
require('dotenv').config();
const { query, testConnection } = require('./db');

async function test() {
  console.log('Testing database connection...');
  console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
  console.log('DATABASE_URL starts with:', process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 20) : 'undefined');
  
  const connected = await testConnection();
  console.log('Connection status:', connected);
  
  if (connected) {
    try {
      const result = await query('SELECT * FROM users LIMIT 1');
      console.log('Users table exists:', !!result);
    } catch (err) {
      console.log('Users table error:', err.message);
    }
  }
}

test();
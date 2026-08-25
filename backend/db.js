// db.js
const { Pool } = require("pg");
require("dotenv").config();

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Supabase SSL connection
  }
});

// Test connection and log status
pool.on('connect', () => {
  console.log('✅ Connected to Supabase PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
});

// Initialize database schema
async function initializeSchema() {
  const queries = [
    // Users table
    `CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(255) PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'teacher',
      name VARCHAR(255),
      teacher_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    
    // Teachers table
    `CREATE TABLE IF NOT EXISTS teachers (
      id SERIAL PRIMARY KEY,
      first_name VARCHAR(255) NOT NULL,
      last_name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      subjects TEXT[] DEFAULT '{}',
      target_grade VARCHAR(50),
      work_days TEXT[] DEFAULT '{}',
      start_time TIME DEFAULT '08:00:00',
      end_time TIME DEFAULT '16:00:00',
      availability JSONB DEFAULT '[]',
      employee_id VARCHAR(50) UNIQUE,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    
    // Subjects table
    `CREATE TABLE IF NOT EXISTS subjects (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      grade_level VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    
    // Rooms table
    `CREATE TABLE IF NOT EXISTS rooms (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      room_name VARCHAR(255),
      capacity INTEGER DEFAULT 30,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    
    // Sections table (Updated with grade_level and room_id foreign key)
    `CREATE TABLE IF NOT EXISTS sections (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      students INTEGER DEFAULT 0,
      grade_level VARCHAR(255),
      room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`,

    // Auto-migrations for existing databases
    `ALTER TABLE sections ADD COLUMN IF NOT EXISTS grade_level VARCHAR(255)`,
    `ALTER TABLE sections ADD COLUMN IF NOT EXISTS room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL`,
    
    // Schedules table
    `CREATE TABLE IF NOT EXISTS schedules (
      id SERIAL PRIMARY KEY,
      teacher_id VARCHAR(255) NOT NULL,
      slots JSONB DEFAULT '[]',
      generated_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )`
  ];

  let hasError = false;
  
  for (const query of queries) {
    try {
      await pool.query(query);
    } catch (err) {
      console.error('❌ Schema initialization error:', err.message);
      hasError = true;
    }
  }
  
  if (!hasError) {
    console.log('✅ Database schema initialized successfully');
  }
  
  return !hasError;
}

// Test connection function
async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✅ Successfully connected to Supabase PostgreSQL at:', res.rows[0].now);
    return true;
  } catch (err) {
    console.error('❌ Supabase Connection Failed:', err.message);
    return false;
  }
}

// Run initialization
async function initDatabase() {
  console.log('🔧 Initializing database...');
  
  // Test connection first
  const connected = await testConnection();
  
  if (connected) {
    // Initialize schema
    await initializeSchema();
  } else {
    console.error('❌ Cannot initialize schema - database connection failed');
    console.error('Please check your DATABASE_URL environment variable');
  }
}

// Run initialization when this module is loaded
initDatabase();

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  testConnection,
  initializeSchema
};
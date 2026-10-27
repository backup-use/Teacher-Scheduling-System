// db.js
const { Pool } = require("pg");
require("dotenv").config();

const DEBUG = process.env.DEBUG === "true";
const log = (...args) => { if (DEBUG) console.log(...args); };

if (!process.env.DATABASE_URL) {
  console.error("[FATAL] DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on("error", (err) => {
  console.error("[db] idle client error:", err.message);
});

// Only log the first successful connect, once.
let firstConnectLogged = false;
pool.on("connect", () => {
  if (firstConnectLogged) return;
  firstConnectLogged = true;
  log("[db] pool connected");
});

async function initializeSchema() {
  const queries = [
    `CREATE TABLE IF NOT EXISTS public.users (
      id VARCHAR(255) PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'teacher',
      name VARCHAR(255),
      display_name VARCHAR(255),
      teacher_id VARCHAR(255),
      email VARCHAR(255),
      session_version INTEGER DEFAULT 1,
      last_password_change TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS teachers (
      id SERIAL PRIMARY KEY,
      first_name VARCHAR(255) NOT NULL,
      last_name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      subjects JSONB DEFAULT '[]',
      target_grade VARCHAR(50),
      work_days JSONB DEFAULT '[]',
      start_time TIME DEFAULT '08:00:00',
      end_time TIME DEFAULT '16:00:00',
      availability JSONB DEFAULT '[]',
      employee_id VARCHAR(50) UNIQUE,
      is_active BOOLEAN DEFAULT TRUE,
      hidden_at TIMESTAMP NULL,
      hidden_by VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS subjects (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      grade_level VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS rooms (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      capacity INTEGER DEFAULT 30,
      created_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS sections (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      students INTEGER DEFAULT 0,
      grade_level VARCHAR(255),
      room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
      shift VARCHAR(3) DEFAULT 'AM',
      subjects JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS schedules (
      id SERIAL PRIMARY KEY,
      teacher_id VARCHAR(255) NOT NULL,
      slots JSONB DEFAULT '[]',
      generated_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      section_name VARCHAR(255) NOT NULL,
      student_id VARCHAR(50),
      status VARCHAR(20) DEFAULT 'active',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,

    // Auto-migrations for older databases
    `ALTER TABLE sections ADD COLUMN IF NOT EXISTS shift VARCHAR(3) DEFAULT 'AM'`,
    `ALTER TABLE sections ADD COLUMN IF NOT EXISTS subjects JSONB DEFAULT '[]'`,
    `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP NULL`,
    `ALTER TABLE teachers ADD COLUMN IF NOT EXISTS hidden_by VARCHAR(255) NULL`,
    `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)`,
    `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email VARCHAR(255)`,
    `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS session_version INTEGER DEFAULT 1`,
    `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_password_change TIMESTAMP`,
  ];

  for (const q of queries) {
    try {
      await pool.query(q);
    } catch (err) {
      console.error("[db] schema error:", err.message);
    }
  }
}

async function testConnection() {
  try {
    const res = await pool.query("SELECT NOW()");
    return res.rows[0].now;
  } catch (err) {
    console.error("[db] connection failed:", err.message);
    return null;
  }
}

// One-time init, memoized so repeated requires don't re-run it.
let initPromise = null;
function initDatabase() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const now = await testConnection();
    if (!now) return false;
    log("[db] connected:", now);
    await initializeSchema();
    return true;
  })();
  return initPromise;
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  testConnection,
  initializeSchema,
  initDatabase,
};
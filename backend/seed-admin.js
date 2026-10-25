require("dotenv").config();
const bcrypt = require("bcrypt");
const db = require("./db");

async function resetAdmin() {
  try {
    console.log("Connecting to database...");
    
    // 1. I-delete ang lumang admin kung meron man
    await db.query("DELETE FROM users WHERE username = 'admin'");
    
    // 2. Gumawa ng bagong hashed password
    const password = "admin123";
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 3. I-insert ang bagong admin
    await db.query(
      `INSERT INTO users (id, username, password, role, name, display_name, session_version) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ["usr-admin", "admin", hashedPassword, "admin", "System Administrator", "System Administrator", 1]
    );
    
    console.log("✅ SUCCESS: Admin account reset!");
    console.log("Username: admin");
    console.log("Password: admin123");
    
    process.exit(0);
  } catch (err) {
    console.error("❌ ERROR:", err.message);
    process.exit(1);
  }
}

resetAdmin();
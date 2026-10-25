require("dotenv").config();
const db = require("./db");
const bcrypt = require("bcryptjs");

async function checkAdmin() {
  try {
    const { rows } = await db.query("SELECT password FROM public.users WHERE username = 'admin'");
    
    if (rows.length === 0) {
      console.log("❌ Admin not found in database!");
      process.exit(1);
    }

    const storedHash = rows[0].password;
    console.log("Stored Hash:", storedHash);
    
    const isMatch = await bcrypt.compare("admin123", storedHash);
    console.log("Password match?", isMatch ? "✅ YES" : "❌ NO");
    
  } catch (err) {
    console.error("Error:", err.message);
  }
  process.exit(0);
}

checkAdmin();
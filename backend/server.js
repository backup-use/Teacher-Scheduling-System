require('dotenv').config();
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Resend } = require('resend');

// Safe initialization to prevent 502 server crashes
let resend = null;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
} else {
  console.warn("⚠️ RESEND_API_KEY is not set. Email notifications will be skipped.");
}

const db = require("./db");
const PORT = process.env.PORT || 3000;

// ─── Email Notification Helper ───────────────────────────────────────────────
async function sendCredentialsEmail(teacherEmail, teacherName, username, password, extraDetails = {}) {
  // Check if Resend is configured before running email logic
  if (!resend) {
    console.log(`⚠️ Skipping email to ${teacherEmail}: RESEND_API_KEY is missing.`);
    return;
  }

  try {
    const { subjects = [], workDays = [], startTime = "", endTime = "" } = extraDetails;

    const formattedSubjects = Array.isArray(subjects) && subjects.length > 0 
      ? subjects.join(", ") 
      : "To be assigned";

    const formattedDays = Array.isArray(workDays) && workDays.length > 0 
      ? workDays.join(", ") 
      : "Regular Work Days";

    const { data, error } = await resend.emails.send({
      from: 'Lectura Scheduling <onboarding@resend.dev>',
      to: [teacherEmail],
      subject: '🔑 Welcome to Lectura - Your Account Credentials & Schedule Details',
      html: `...` // keep your existing html template here
    });

    if (error) {
      return console.error(`❌ Failed to send detailed email via Resend to ${teacherEmail}:`, error);
    }

    console.log(`✉️ Detailed email sent via Resend to ${teacherEmail}! ID:`, data.id);
  } catch (error) {
    console.error(`❌ Failed to send detailed email to ${teacherEmail}:`, error);
  }
}

// ─── Utility Helpers ─────────────────────────────────────────────────────────
function hashPassword(pw) {
  return crypto.createHash("sha256").update(pw + "salt_key_2024").digest("hex");
}

function genId() {
  return crypto.randomBytes(8).toString("hex");
}

function safeJsonParse(data, fallback = []) {
  if (typeof data === 'object' && data !== null) return data;
  try {
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

async function initAdmin() {
  try {
    await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);");
    const adminPasswordHash = hashPassword("admin123");
    const { rows } = await db.query("SELECT * FROM users WHERE username = $1", ["admin"]);
    
    if (rows.length === 0) {
      try {
        await db.query(
          "INSERT INTO users (username, password, role, name) VALUES ($1, $2, $3, $4)",
          ["admin", adminPasswordHash, "admin", "Administrator"]
        );
      } catch (err) {
        const userId = "usr-" + genId();
        await db.query(
          "INSERT INTO users (id, username, password, role, name) VALUES ($1, $2, $3, $4, $5)",
          [userId, "admin", adminPasswordHash, "admin", "Administrator"]
        );
      }
      console.log(" -> Admin account created in database (admin / admin123)");
    } else {
      await db.query(
        "UPDATE users SET password = $1 WHERE username = $2",
        [adminPasswordHash, "admin"]
      );
      console.log(" -> Admin password updated/verified (admin / admin123)");
    }
  } catch (err) {
    console.error(" -> Database seed error (initAdmin):", err.message);
  }
}

// ─── JWT-lite (HMAC tokens) ──────────────────────────────────────────────────
const SECRET = process.env.JWT_SECRET || "scheduler_secret_2024_xyz";

function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 86400000 })).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  try {
    if (!token || token === "null" || token === "undefined") return null;
    const [header, body, sig] = token.split(".");
    const expected = crypto.createHmac("sha256", SECRET).update(`${header}.${body}`).digest("base64url");
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

async function getPartitionedSubjects() {
  try {
    await db.query("ALTER TABLE subjects ADD COLUMN IF NOT EXISTS grade_level VARCHAR(255);");
  } catch (e) {
    console.error("Schema sync warning:", e.message);
  }

  const { rows } = await db.query("SELECT * FROM subjects ORDER BY LOWER(name) ASC");
  const partitions = { junior: [], grade11: [], grade12: [] };

  rows.forEach(r => {
    const level = (r.grade_level || "").toLowerCase();
    const item = { id: r.id, name: r.name, gradeLevel: r.grade_level || "Junior High School" };

    if (level.includes("11")) {
      partitions.grade11.push(item);
    } else if (level.includes("12")) {
      partitions.grade12.push(item);
    } else {
      partitions.junior.push(item);
    }
  });

  return partitions;
}

// ─── Schedule Generator ──────────────────────────────────────────────────────
async function generateSchedule(teacher) {
  const slots = [];
  const days = teacher.workDays || teacher.work_days || [];
  
  const startTime = teacher.startTime || teacher.start_time || "08:00";
  const endTime = teacher.endTime || teacher.end_time || "16:00";
  const timeSlots = generateTimeSlots(startTime, endTime, 60);

  let availableSchoolSubjects = ["Math", "Science", "English", "History", "ICT"];
  try {
    const res = await db.query('SELECT name FROM subjects ORDER BY LOWER(name) ASC');
    if (res.rows.length > 0) {
      availableSchoolSubjects = res.rows.map(r => r.name);
    }
  } catch (err) {
    console.error("Error fetching subjects for schedule generator:", err);
  }

  const teacherSubjects = safeJsonParse(teacher.subjects, []);
  const validSubjects = teacherSubjects.filter(sub => availableSchoolSubjects.includes(sub));
  const primarySubject = validSubjects.length > 0 ? validSubjects[0] : (teacherSubjects[0] || "General Class");

  const availabilityList = safeJsonParse(teacher.availability, []);

  days.forEach((day) => {
    timeSlots.forEach((slot) => {
      const isAvailable = availabilityList.length === 0 || availabilityList.some(
        (a) => a.day === day && isTimeInRange(slot.start, a.from || "08:00", a.to || "16:00")
      );
      if (isAvailable) {
        slots.push({
          id: crypto.randomBytes(4).toString("hex"),
          day,
          startTime: slot.start,
          endTime: slot.end,
          subject: primarySubject,
          room: `Room ${Math.floor(Math.random() * 10) + 101}`,
          status: "scheduled",
        });
      }
    });
  });

  const byDay = {};
  slots.forEach((s) => {
    if (!byDay[s.day]) byDay[s.day] = [];
    if (byDay[s.day].length < 4) byDay[s.day].push(s);
  });

  return Object.values(byDay).flat();
}

function generateTimeSlots(start, end, durationMin) {
  const slots = [];
  if (!start || !end || !start.includes(":") || !end.includes(":")) {
    start = "08:00";
    end = "16:00";
  }
  let [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const endMins = eh * 60 + em;

  while (sh * 60 + sm + durationMin <= endMins) {
    const s = `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}`;
    const em2 = sm + durationMin;
    const eh2 = sh + Math.floor(em2 / 60);
    const em3 = em2 % 60;
    const e = `${String(eh2).padStart(2, "0")}:${String(em3).padStart(2, "0")}`;
    slots.push({ start: s, end: e });
    sm += durationMin;
    if (sm >= 60) {
      sh += Math.floor(sm / 60);
      sm = sm % 60;
    }
  }
  return slots;
}

function isTimeInRange(time, from, to) {
  return time >= from && time < to;
}

// ─── Router Helpers ──────────────────────────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
  });
}

function getAuth(req) {
  const auth = req.headers["authorization"] || "";
  const token = auth.replace("Bearer ", "");
  return verifyToken(token);
}

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  });
  res.end(JSON.stringify(data));
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  const mime = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".png": "image/png",
    ".ico": "image/x-icon",
  }[ext] || "text/plain";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
}

// ─── Server Core Execution ───────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    });
    res.end();
    return;
  }

  if (pathname.startsWith("/api/")) {

    // POST /api/login
    if (pathname === "/api/login" && req.method === "POST") {
      try {
        const body = await parseBody(req);
        const { rows } = await db.query(
          "SELECT * FROM users WHERE username = $1 AND password = $2",
          [body.username, hashPassword(body.password)]
        );
        if (rows.length === 0) return send(res, 401, { error: "Invalid credentials" });
        
        const user = rows[0];
        const token = signToken({ id: user.id, role: user.role, name: user.name, teacher_id: user.teacher_id });
        return send(res, 200, { token, role: user.role, name: user.name, id: user.id });
      } catch (err) {
        return send(res, 500, { error: err.message });
      }
    }

    // POST /api/auth/forgot-password
    if (pathname === "/api/auth/forgot-password" && req.method === "POST") {
      try {
        const body = await parseBody(req);
        const identifier = (body.identifier || body.email || "").trim().toLowerCase();
        const temporaryEmail = (body.temporaryEmail || "").trim().toLowerCase();
        const securityKey = (body.securityKey || "").trim();

        if (!identifier) {
          return send(res, 400, { error: "Please enter your Username or Email address." });
        }

        let { rows } = await db.query(
          `SELECT u.id, u.username, u.name, u.role, COALESCE(u.email, t.email) AS email 
          FROM users u 
          LEFT JOIN teachers t ON u.teacher_id::text = t.id::text 
          WHERE LOWER(u.username) = $1 OR LOWER(u.email) = $1 OR LOWER(t.email) = $1`,
          [identifier]
        );

        if (rows.length === 0) {
          return send(res, 404, { error: "No account found matching that username or email." });
        }

        const user = rows[0];

        if (!user.email) {
          const MASTER_SECURITY_KEY = process.env.MASTER_KEY || "LECTURA_SECURE_2024";

          if (!securityKey || securityKey !== MASTER_SECURITY_KEY) {
            return send(res, 202, { 
              requiresVerification: true,
              role: user.role,
              message: "Account found, but no email is linked. Please enter your email and the Master Security Key." 
            });
          }

          if (!temporaryEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(temporaryEmail)) {
            return send(res, 400, { error: "Please enter a valid email address." });
          }

          await db.query("UPDATE users SET email = $1 WHERE id = $2", [temporaryEmail, user.id]);
          user.email = temporaryEmail;
        }

        const resetToken = signToken({ id: user.id, email: user.email });
        const resetLink = `https://lectura-mdvz.onrender.com/shared/reset-password.html?token=${resetToken}`;

        const { data, error } = await resend.emails.send({
          from: 'Lectura Security <onboarding@resend.dev>',
          to: [user.email],
          subject: '🔒 Reset Your Lectura Account Password',
          html: `
            <div style="font-family: Arial, sans-serif; background: #0f111a; color: #fff; padding: 20px; border-radius: 8px;">
              <h2 style="color: #00d2ff;">Password Reset Request</h2>
              <p>Hello <strong>${user.name || user.username}</strong>,</p>
              <p>We received a request to reset your password for account (<strong>${user.username}</strong>).</p>
              <div style="text-align: center; margin: 25px 0;">
                <a href="${resetLink}" style="background-color: #00d2ff; color: #000; font-weight: bold; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
              </div>
            </div>
          `
        });

        if (error) {
          return send(res, 500, { error: "Failed to send reset email: " + error.message });
        }

        return send(res, 200, { message: `Password reset link successfully sent to ${user.email}!` });

      } catch (err) {
        console.error("❌ Forgot Password Error:", err);
        return send(res, 500, { error: err.message });
      }
    }

    // GET /api/me
    if (pathname === "/api/me" && req.method === "GET") {
      const auth = getAuth(req);
      if (!auth) return send(res, 401, { error: "Unauthorized" });
      return send(res, 200, { id: auth.id, role: auth.role, name: auth.name });
    }

    // ── Admin Protected Endpoints ──
    if (pathname.startsWith("/api/admin/")) {
      const auth = getAuth(req);
      if (!auth || auth.role !== "admin") return send(res, 403, { error: "Forbidden: Admin access required." });

      // GET /api/admin/teachers
      if (pathname === "/api/admin/teachers" && req.method === "GET") {
        try {
          const { rows } = await db.query("SELECT * FROM teachers ORDER BY created_at DESC");
          return send(res, 200, rows);
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      // GET /api/admin/subjects
      if (pathname === "/api/admin/subjects" && req.method === "GET") {
        try {
          const partitions = await getPartitionedSubjects();
          return send(res, 200, partitions);
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

// POST /api/admin/subjects (WITH BATCH & ERROR HANDLING)
      if (pathname === "/api/admin/subjects" && req.method === "POST") {
        try {
          const body = await parseBody(req);
          const rawInput = (body.subjectName || body.name || body.subjects || "").trim();
          const gradeLevel = (body.gradeLevel || "Junior High School").trim();

          if (!rawInput) {
            return send(res, 400, { error: "Subject title required." });
          }

          // Siguraduhing umiiral ang kinakailangang column
          await db.query("ALTER TABLE subjects ADD COLUMN IF NOT EXISTS grade_level VARCHAR(255);");

          // I-split sa commas para suportahan ang Batch Add
          const rawList = rawInput.split(",").map(s => s.trim()).filter(Boolean);
          const addedSubjects = [];
          const skippedSubjects = [];

          for (const subjectName of rawList) {
            // Suriin kung umiiral na ang subject
            const existing = await db.query(
              "SELECT id FROM subjects WHERE LOWER(TRIM(name)) = LOWER($1) AND LOWER(TRIM(COALESCE(grade_level, ''))) = LOWER($2)",
              [subjectName, gradeLevel]
            );

            if (existing.rows.length === 0) {
              await db.query("INSERT INTO subjects (name, grade_level) VALUES ($1, $2)", [subjectName, gradeLevel]);
              addedSubjects.push(subjectName);
            } else {
              skippedSubjects.push(subjectName);
            }
          }

          const partitions = await getPartitionedSubjects();

          return send(res, 201, {
            success: true,
            message: addedSubjects.length > 0 
              ? `Successfully added ${addedSubjects.length} subject(s) to ${gradeLevel}!` 
              : `All provided subjects already exist in ${gradeLevel}.`,
            added: addedSubjects,
            skipped: skippedSubjects,
            partitions: partitions
          });

        } catch (err) {
          console.error("❌ Database/POST error inserting subject:", err);
          return send(res, 500, { error: "Failed to process subject entry in database: " + err.message });
        }
      }

      // DELETE /api/admin/subjects/:id
      if (pathname.startsWith("/api/admin/subjects/") && req.method === "DELETE") {
        try {
          const subjectParam = decodeURIComponent(pathname.split("/").pop()).trim();
          
          let result;
          if (!isNaN(subjectParam)) {
            result = await db.query("DELETE FROM subjects WHERE id = $1", [parseInt(subjectParam, 10)]);
          } else {
            result = await db.query("DELETE FROM subjects WHERE LOWER(TRIM(name)) = LOWER($1)", [subjectParam]);
          }

          if (result.rowCount === 0) return send(res, 404, { error: "Subject entry does not exist." });
          
          const partitions = await getPartitionedSubjects();
          return send(res, 200, partitions);
        } catch (error) {
          console.error("Deletion error:", error);
          return send(res, 500, { error: "Internal failure during subject removal." });
        }
      }

      // GET /api/admin/sections (Fetches sections along with assigned room details)
      if (pathname === "/api/admin/sections" && req.method === "GET") {
        try {
          const queryText = `
            SELECT 
              s.id,
              s.name,
              s.students,
              s.grade_level AS "gradeLevel",
              s.room_id AS "roomId",
              r.name AS "roomName",
              r.capacity AS "roomCapacity"
            FROM sections s
            LEFT JOIN rooms r ON s.room_id = r.id
            ORDER BY s.name ASC
          `;
          const { rows } = await db.query(queryText);
          return send(res, 200, rows);
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      // POST /api/admin/sections (Saves grade level and room assignment)
      if (pathname === "/api/admin/sections" && req.method === "POST") {
        try {
          const body = await parseBody(req);
          
          // Accept variations in incoming field names from frontend
          const sectionName = (body.sectionName || body.name || "").trim();
          const gradeLevel = (body.gradeLevel || body.grade || "").trim();
          const roomIdRaw = body.assignedRoom || body.room_id || body.roomId || null;
          const students = body.students !== undefined ? parseInt(body.students, 10) : 0;

          if (!sectionName) {
            return send(res, 400, { error: "Section Name is required." });
          }

          // Parse roomId or set null if missing/empty string
          const roomId = roomIdRaw && !isNaN(parseInt(roomIdRaw, 10)) ? parseInt(roomIdRaw, 10) : null;

          // Check if section name already exists
          const existing = await db.query(
            "SELECT id FROM sections WHERE LOWER(TRIM(name)) = LOWER($1)",
            [sectionName]
          );
          if (existing.rows.length > 0) {
            return send(res, 400, { error: "This section already exists." });
          }

          // Insert into PostgreSQL with updated columns
          await db.query(
            "INSERT INTO sections (name, students, grade_level, room_id) VALUES ($1, $2, $3, $4)",
            [sectionName, students, gradeLevel, roomId]
          );

          // Return updated sections list joined with room names
          const { rows } = await db.query(`
            SELECT 
              s.id,
              s.name,
              s.students,
              s.grade_level AS "gradeLevel",
              s.room_id AS "roomId",
              r.name AS "roomName"
            FROM sections s
            LEFT JOIN rooms r ON s.room_id = r.id
            ORDER BY s.name ASC
          `);
          
          return send(res, 201, rows);
        } catch (err) {
          console.error("Error inserting section:", err);
          return send(res, 500, { error: err.message });
        }
      }

      // DELETE /api/admin/sections/:id
      if (pathname.startsWith("/api/admin/sections/") && req.method === "DELETE") {
        try {
          const sectionId = pathname.split("/").pop();
          const result = await db.query("DELETE FROM sections WHERE id = $1", [sectionId]);
          if (result.rowCount === 0) return send(res, 404, { error: "Section not found." });
          return send(res, 200, { success: true });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      // 1. GET ROOMS (Accessible by both Admin and Teacher portals)
      if ((pathname === "/api/admin/rooms" || pathname === "/api/teacher/rooms" || pathname === "/api/rooms") && req.method === "GET") {
        try {
          const { rows } = await db.query("SELECT * FROM rooms ORDER BY id DESC");
          const normalizedRooms = rows.map(r => ({
            id: r.id,
            name: r.name || r.room_name || "",
            capacity: r.capacity || r.max_capacity || 0,
            type: r.type || r.room_type || "Standard Classroom"
          }));
          return send(res, 200, normalizedRooms);
        } catch (err) {
          console.error("Fetch rooms failure:", err);
          return send(res, 500, { error: err.message });
        }
      }

      // 2. POST /api/admin/rooms (Admin only: Register new room)
      if (pathname === "/api/admin/rooms" && req.method === "POST") {
        try {
          const body = await parseBody(req);
          const roomName = (body.name || body.roomName || "").trim();
          const capacity = body.capacity !== undefined ? body.capacity : body.maxCapacity;

          if (!roomName || capacity === undefined) {
            return send(res, 400, { error: "Room Name and Capacity are required." });
          }

          let existing;
          try {
            existing = await db.query(
              "SELECT id FROM rooms WHERE LOWER(TRIM(name)) = LOWER($1) OR LOWER(TRIM(room_name)) = LOWER($1)",
              [roomName]
            );
          } catch {
            existing = { rows: [] };
          }

          if (existing.rows && existing.rows.length > 0) {
            return send(res, 400, { error: "This room already exists." });
          }

          let insertedRow;
          try {
            const resInsert = await db.query(
              "INSERT INTO rooms (name, capacity) VALUES ($1, $2) RETURNING *",
              [roomName, capacity]
            );
            insertedRow = resInsert.rows[0];
          } catch {
            const resInsert = await db.query(
              "INSERT INTO rooms (room_name, capacity) VALUES ($1, $2) RETURNING *",
              [roomName, capacity]
            );
            insertedRow = resInsert.rows[0];
          }

          const { rows } = await db.query("SELECT * FROM rooms ORDER BY id DESC");
          const normalized = rows.map(r => ({
            id: r.id,
            name: r.name || r.room_name || "",
            capacity: r.capacity || 0
          }));

          return send(res, 201, { success: true, room: insertedRow, rooms: normalized });
        } catch (err) {
          console.error("Room registration failure:", err);
          return send(res, 500, { error: "Database failure: " + err.message });
        }
      }

      // 3. DELETE /api/admin/rooms/:id (Admin only: Delete room)
      if (pathname.startsWith("/api/admin/rooms/") && req.method === "DELETE") {
        try {
          const roomId = pathname.split("/").pop();
          const result = await db.query("DELETE FROM rooms WHERE id = $1", [roomId]);
          if (result.rowCount === 0) return send(res, 404, { error: "Room not found." });
          return send(res, 200, { success: true });
        } catch (err) {
          console.error("Room deletion failure:", err);
          return send(res, 500, { error: err.message });
        }
      }

      // POST /api/admin/teachers
      if (pathname === "/api/admin/teachers" && req.method === "POST") {
        try {
          const body = await parseBody(req);
          
          const firstName = (body.firstName || "").trim();
          const lastName = (body.lastName || "").trim();
          const email = (body.email || "").trim().toLowerCase();

          if (!firstName || !lastName) {
            return send(res, 400, { error: "First name and last name are required." });
          }

          const nameCheck = await db.query(
            `SELECT id FROM teachers WHERE LOWER(TRIM(first_name)) = LOWER($1) AND LOWER(TRIM(last_name)) = LOWER($2)`,
            [firstName, lastName]
          );
          if (nameCheck.rows.length > 0) {
            return send(res, 400, { error: `Teacher "${firstName} ${lastName}" is already registered!` });
          }

          let baseUsername = (firstName.toLowerCase() + "." + lastName.toLowerCase()).replace(/\s+/g, "");
          let username = baseUsername;
          
          const existingUser = await db.query("SELECT id FROM users WHERE username = $1", [username]);
          if (existingUser.rows.length > 0) {
            username = `${baseUsername}${Math.floor(100 + Math.random() * 900)}`;
          }

          const password = "teacher" + Math.floor(1000 + Math.random() * 9000);
          const employeeId = "EMP-" + Math.floor(1000 + Math.random() * 9000);

          const rawSubjects = Array.isArray(body.subjects) ? body.subjects : [body.subjects].filter(Boolean);
          const subjectsJSON = JSON.stringify(rawSubjects);
          const workDaysJSON = JSON.stringify(Array.isArray(body.workDays) ? body.workDays : []);
          const targetGrade = body.targetGrade || body.target_grade || "";

          function sanitizeTime(timeStr) {
            if (!timeStr || timeStr.trim() === "") return "08:00";
            let t = timeStr.trim().toLowerCase();
            let isPM = t.includes("pm");
            let isAM = t.includes("am");
            let nums = t.replace(/[^0-9:]/g, "").split(":");
            let h = parseInt(nums[0], 10);
            let m = nums[1] ? parseInt(nums[1], 10) : 0;
            if (isPM && h !== 12) h += 12;
            if (isAM && h === 12) h = 0;
            return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          }

          let availabilityArray = [];
          if (typeof body.availability === 'string') {
            try { availabilityArray = JSON.parse(body.availability); } catch (e) { availabilityArray = []; }
          } else if (Array.isArray(body.availability)) {
            availabilityArray = body.availability;
          }

          const formattedAvailability = availabilityArray.map(item => ({
            day: item.day || "Monday",
            from: sanitizeTime(item.from),
            to: sanitizeTime(item.to)
          }));

          const teacherResult = await db.query(
            `INSERT INTO teachers (
              first_name, last_name, email, subjects, target_grade, 
              work_days, start_time, end_time, availability, employee_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()) RETURNING *`,
            [
              firstName,
              lastName,
              email || "no-email@school.edu",
              subjectsJSON,
              targetGrade,
              workDaysJSON,
              sanitizeTime(body.startTime),
              sanitizeTime(body.endTime),
              JSON.stringify(formattedAvailability),
              employeeId
            ]
          );

          const newTeacher = teacherResult.rows[0];
          const teacherIdStr = String(newTeacher.id);
          const userId = "usr-" + genId();

          await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);");
          await db.query(
            "INSERT INTO users (id, username, password, role, name, teacher_id, email) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            [userId, username, hashPassword(password), "teacher", `${firstName} ${lastName}`, teacherIdStr, email]
          );

          const slots = await generateSchedule(newTeacher);
          await db.query(
            "INSERT INTO schedules (teacher_id, slots, generated_at) VALUES ($1, $2, NOW())",
            [teacherIdStr, JSON.stringify(slots)]
          );

          if (email && email.includes('@')) {
            sendCredentialsEmail(
              email, 
              `${firstName} ${lastName}`, 
              username, 
              password,
              {
                subjects: rawSubjects,
                workDays: Array.isArray(body.workDays) ? body.workDays : [],
                startTime: body.startTime,
                endTime: body.endTime
              }
            );
          }

          return send(res, 201, { 
            success: true,
            teacher: newTeacher, 
            credentials: { username, password }, 
            schedule: { teacherId: newTeacher.id, slots } 
          });

        } catch (err) {
          console.error('❌ Teacher registration error:', err);
          return send(res, 500, { 
            error: err.message,
            details: err.stack
          });
        }
      }

      // PUT /api/admin/teachers/:id
      if (pathname.match(/^\/api\/admin\/teachers\/[^/]+$/) && req.method === "PUT") {
        try {
          const id = pathname.split("/").pop();
          const body = await parseBody(req);
          
          const { rows } = await db.query("SELECT * FROM teachers WHERE id = $1", [id]);
          if (rows.length === 0) return send(res, 404, { error: "Not found" });

          const updated = { ...rows[0], ...body };
          
          const subjectsJSON = typeof updated.subjects === 'string' ? updated.subjects : JSON.stringify(updated.subjects || []);
          const workDaysJSON = typeof updated.work_days === 'string' ? updated.work_days : JSON.stringify(updated.work_days || updated.workDays || []);

          await db.query(
            `UPDATE teachers SET first_name=$1, last_name=$2, email=$3, subjects=$4, target_grade=$5, work_days=$6 WHERE id=$7`,
            [
              updated.first_name || updated.firstName, 
              updated.last_name || updated.lastName, 
              updated.email, 
              subjectsJSON, 
              updated.target_grade || updated.targetGrade, 
              workDaysJSON, 
              id
            ]
          );

          const newSlots = await generateSchedule(updated);
          await db.query(
            `INSERT INTO schedules (teacher_id, slots, generated_at)
             VALUES ($1, $2, NOW())`,
            [String(id), JSON.stringify(newSlots)]
          );

          return send(res, 200, { teacher: updated, schedule: { teacherId: id, slots: newSlots } });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      // DELETE /api/admin/teachers/:id
      if (pathname.match(/^\/api\/admin\/teachers\/[^/]+$/) && req.method === "DELETE") {
        try {
          const id = pathname.split("/").pop();
          await db.query("DELETE FROM teachers WHERE id = $1", [id]);
          await db.query("DELETE FROM users WHERE teacher_id = $1 OR id = $1", [String(id)]);
          await db.query("DELETE FROM schedules WHERE teacher_id = $1", [String(id)]);
          return send(res, 200, { success: true });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      // GET /api/admin/schedules
      if (pathname === "/api/admin/schedules" && req.method === "GET") {
        try {
          const { rows: schedules } = await db.query("SELECT * FROM schedules");
          const { rows: teachers } = await db.query("SELECT * FROM teachers");

          const full = schedules.map((s) => {
            const teacher = teachers.find((t) => String(t.id) === String(s.teacher_id));
            return { ...s, slots: safeJsonParse(s.slots, []), teacher };
          });
          return send(res, 200, full);
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      // POST /api/admin/schedules/save-bulk
      if (pathname === "/api/admin/schedules/save-bulk" && req.method === "POST") {
        try {
          const body = await parseBody(req);
          const compiledSchedules = body.schedules;

          if (!compiledSchedules || typeof compiledSchedules !== 'object') {
            return send(res, 400, { error: "Malformed schedule payload matrix." });
          }

          await db.query("DELETE FROM schedules");
          const { rows: teachers } = await db.query("SELECT * FROM teachers");

          for (const [fullName, scheduleObj] of Object.entries(compiledSchedules)) {
            const foundTeacher = teachers.find(t => `${t.first_name} ${t.last_name}` === fullName || `${t.firstName} ${t.lastName}` === fullName);
            
            if (foundTeacher && scheduleObj && Array.isArray(scheduleObj.slots)) {
              const parsedSlots = scheduleObj.slots.map(slot => ({
                id: crypto.randomBytes(4).toString("hex"),
                day: slot.day,
                startTime: slot.time ? slot.time.split(" - ")[0] : "08:00 AM",
                endTime: slot.time ? slot.time.split(" - ")[1] : "09:00 AM",
                subject: slot.subject,
                room: slot.room,
                section: slot.section,
                status: "scheduled"
              }));

              await db.query(
                "INSERT INTO schedules (teacher_id, slots, generated_at) VALUES ($1, $2, NOW())",
                [String(foundTeacher.id), JSON.stringify(parsedSlots)]
              );
            }
          }

          return send(res, 200, { success: true, message: "Master timetable saved directly to PostgreSQL!" });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      // POST /api/admin/schedules/regenerate/:id
      if (pathname.match(/^\/api\/admin\/schedules\/regenerate\/[^/]+$/) && req.method === "POST") {
        try {
          const id = pathname.split("/").pop();
          const { rows } = await db.query("SELECT * FROM teachers WHERE id = $1", [id]);
          if (rows.length === 0) return send(res, 404, { error: "Teacher not found" });
          
          const newSlots = await generateSchedule(rows[0]);
          await db.query(
            `INSERT INTO schedules (teacher_id, slots, generated_at)
             VALUES ($1, $2, NOW())`,
            [String(id), JSON.stringify(newSlots)]
          );

          return send(res, 200, { teacherId: id, slots: newSlots });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }
    }

    // ── Global Timetable Endpoint for Teacher Dashboards ──
    if (pathname === "/api/timetable" && req.method === "GET") {
      try {
        const auth = getAuth(req);
        if (!auth) return send(res, 401, { error: "Unauthorized access token." });

        const flattenedOutputMatrix = [];
        const { rows: schedules } = await db.query("SELECT * FROM schedules");
        const { rows: teachers } = await db.query("SELECT * FROM teachers");

        schedules.forEach(scheduleSet => {
          const structuralTeacher = teachers.find(t => String(t.id) === String(scheduleSet.teacher_id));
          const instructorName = structuralTeacher ? `${structuralTeacher.first_name || structuralTeacher.firstName} ${structuralTeacher.last_name || structuralTeacher.lastName}` : "Unknown Instructor";

          const slots = safeJsonParse(scheduleSet.slots, []);

          if (Array.isArray(slots)) {
            slots.forEach(slot => {
              flattenedOutputMatrix.push({
                id: slot.id,
                instructor: instructorName,
                subject: slot.subject,
                section: slot.section,
                room: slot.room,
                day: slot.day,
                timeSlot: `${slot.startTime} to ${slot.endTime}`.replace(" - ", " to ")
              });
            });
          }
        });

        return send(res, 200, flattenedOutputMatrix);
      } catch (err) {
        return send(res, 500, { error: err.message });
      }
    }

    // ── Teacher-only routes ──
    if (pathname.startsWith("/api/teacher/")) {
      const auth = getAuth(req);
      if (!auth || auth.role !== "teacher") return send(res, 403, { error: "Forbidden" });

      if (pathname === "/api/teacher/schedule" && req.method === "GET") {
        try {
          const { rows: userRows } = await db.query("SELECT teacher_id FROM users WHERE id = $1", [auth.id]);
          const targetTeacherId = userRows[0]?.teacher_id || auth.id;

          const { rows: schedRows } = await db.query("SELECT * FROM schedules WHERE teacher_id = $1", [String(targetTeacherId)]);
          const { rows: teacherRows } = await db.query("SELECT * FROM teachers WHERE id = $1", [targetTeacherId]);

          return send(res, 200, { 
            schedule: schedRows[0] || null, 
            teacher: teacherRows[0] || null 
          });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }
    }

    return send(res, 404, { error: "API route not found" });
  }

  // ── Static Files Router ──
  const frontendBase = path.join(__dirname, "../frontend");

  if (pathname === "/" || pathname === "/login.html") {
    res.writeHead(302, { "Location": "/shared/login.html" });
    return res.end();
  }

  const filePath = path.join(frontendBase, pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return serveFile(res, filePath);
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, "0.0.0.0", async () => {
  await initAdmin();
  console.log(`\n Scheduler running locally at http://localhost:${PORT}`);
  console.log(` Admin login: admin / admin123`);
});

// Test connection on server start
db.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("❌ Supabase Connection Failed:", err.message);
  } else {
    console.log("✅ Successfully connected to Supabase PostgreSQL at:", res.rows[0].now);
  }
});
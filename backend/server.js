require("dotenv").config();
const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const db = require("./db");

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const ADMIN_NAME = process.env.ADMIN_NAME || "System Administrator";

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("❌ FATAL: JWT_SECRET missing or too short. Set it in .env");
  process.exit(1);
}

// ── Utility Helpers ──

function send(res, status, data, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    ...headers,
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const ct = req.headers["content-type"] || "";
    if (!ct.includes("application/json")) {
      return reject(new Error("Expected application/json"));
    }
    let body = "";
    let size = 0;
    const MAX = 1_000_000;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function genId() {
  return crypto.randomBytes(8).toString("hex");
}

function getAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
  } catch {
    return null;
  }
}

function safeJsonParse(input, fallback = []) {
  if (typeof input === "object" && input !== null) return input;
  if (!input || typeof input !== "string") return fallback;
  try {
    return JSON.parse(input);
  } catch {
    return fallback;
  }
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
  };
  const contentType = mimeTypes[ext] || "application/octet-stream";
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

function sendCredentialsEmail(email, name, username, password, details) {
  console.log(`📧 [MOCK EMAIL] Sent to ${email} for ${name} (User: ${username})`);
}

// Simple in-memory rate limiter for login attempts
const loginAttempts = new Map();
function rateLimitLogin(req) {
  const ip = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const WINDOW = 60_000;
  const MAX = 10;

  let entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + WINDOW };
    loginAttempts.set(ip, entry);
  }
  entry.count++;
  return entry.count <= MAX;
}

// ── generate 1-hour slots that match the teacher grid ──
async function generateSchedule(teacher) {
  const days = safeJsonParse(teacher.work_days || teacher.workDays, ["Monday", "Wednesday", "Friday"]);
  const subjects = safeJsonParse(teacher.subjects, ["General Subject"]);

  const startRaw = teacher.start_time || teacher.startTime || "08:00";
  const endRaw = teacher.end_time || teacher.endTime || "16:00";

  const toMinutes = (t) => {
    if (!t) return NaN;
    let str = String(t).trim().toLowerCase();
    const isPM = str.includes("pm");
    const isAM = str.includes("am");
    str = str.replace(/[^0-9:]/g, "");
    const parts = str.split(":");
    let h = parseInt(parts[0], 10);
    const m = parts[1] ? parseInt(parts[1], 10) : 0;
    if (isNaN(h) || isNaN(m)) return NaN;
    if (isPM && h !== 12) h += 12;
    if (isAM && h === 12) h = 0;
    return h * 60 + m;
  };
  const fromMinutes = (mins) => {
    const h = Math.floor(mins / 60).toString().padStart(2, "0");
    const m = (mins % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
  };

  let startMin = toMinutes(startRaw);
  let endMin = toMinutes(endRaw);

  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) {
    startMin = 8 * 60;
    endMin = 16 * 60;
  }

  const slots = [];

  days.forEach((day, dayIdx) => {
    let slotCounter = 0;

    for (let t = startMin; t + 60 <= endMin; t += 60) {
      const startHour = Math.floor(t / 60);
      if (startHour === 9 || startHour === 12) continue;

      const subject = subjects[(dayIdx + slotCounter) % subjects.length] || "General Subject";

      slots.push({
        id: crypto.randomBytes(4).toString("hex"),
        day,
        startTime: fromMinutes(t),
        endTime: fromMinutes(t + 60),
        subject,
        room: "Room 101",
        section: "Section A",
        status: "scheduled",
      });

      slotCounter++;
    }
  });

  return slots;
}

// Heal-or-create admin on startup
async function initAdmin() {
  try {
    await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);");

    const { rows } = await db.query(
      "SELECT id, password FROM users WHERE username = $1",
      [ADMIN_USERNAME]
    );

    if (rows.length === 0) {
      const adminId = "usr-" + genId();
      const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await db.query(
        "INSERT INTO users (id, username, password, role, name) VALUES ($1, $2, $3, $4, $5)",
        [adminId, ADMIN_USERNAME, hashed, "admin", ADMIN_NAME]
      );
      console.log(`✅ Admin account created: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);
      return;
    }

    const matches = await bcrypt.compare(ADMIN_PASSWORD, rows[0].password).catch(() => false);
    if (!matches) {
      const sha = crypto.createHash("sha256").update(ADMIN_PASSWORD).digest("hex");
      const isLegacy = rows[0].password === sha;

      const newHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await db.query(
        "UPDATE users SET password = $1 WHERE username = $2",
        [newHash, ADMIN_USERNAME]
      );
      console.log(
        isLegacy
          ? `🔧 Migrated admin password from SHA-256 to bcrypt.`
          : `🔧 Admin password healed to match .env value.`
      );
    } else {
      console.log("✅ Admin account OK.");
    }
  } catch (err) {
    console.error("❌ Error initializing admin:", err.message);
  }
}

// ── Main Server Router ──

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": CORS_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
    });
    return res.end();
  }

  // ── API Routes ──
  if (pathname.startsWith("/api/")) {

    // Auth: Login
    if (pathname === "/api/auth/login" && req.method === "POST") {
      if (!rateLimitLogin(req)) {
        return send(res, 429, { error: "Too many login attempts. Try again shortly." });
      }

      try {
        const body = await parseBody(req);
        const { username, password } = body;

        if (!username || !password) {
          return send(res, 400, { error: "Username and password required." });
        }

        const { rows } = await db.query(
          "SELECT id, username, role, name, teacher_id, password FROM users WHERE username = $1",
          [username]
        );

        if (rows.length === 0) {
          return send(res, 401, { error: "Invalid credentials." });
        }

        const user = rows[0];
        let valid = false;

        if (user.password.startsWith("$2")) {
          valid = await bcrypt.compare(password, user.password);
        } else {
          const sha = crypto.createHash("sha256").update(password).digest("hex");
          valid = sha === user.password;
          if (valid) {
            const newHash = await bcrypt.hash(password, 10);
            await db.query("UPDATE users SET password = $1 WHERE id = $2", [newHash, user.id]);
          }
        }

        if (!valid) {
          return send(res, 401, { error: "Invalid credentials." });
        }

        const token = jwt.sign(
          {
            id: user.id,
            username: user.username,
            role: user.role,
            teacherId: user.teacher_id,
          },
          JWT_SECRET,
          { expiresIn: "24h" }
        );

        return send(res, 200, {
          token,
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
            name: user.name,
            teacher_id: user.teacher_id,
          },
        });
      } catch (err) {
        return send(res, 500, { error: err.message });
      }
    }

    // ── Admin Protected Routes ──
    if (pathname.startsWith("/api/admin/")) {
      const auth = getAuth(req);
      if (!auth || auth.role !== "admin") {
        return send(res, 403, { error: "Forbidden: Admin privileges required." });
      }

      // GET /api/admin/subjects
      if (pathname === "/api/admin/subjects" && req.method === "GET") {
        try {
          const { rows } = await db.query("SELECT * FROM subjects ORDER BY id DESC");
          const normalized = rows.map((s) => ({
            id: s.id,
            name: s.name || "",
            gradeLevel: s.grade_level || s.gradeLevel || "",
          }));
          return send(res, 200, normalized);
        } catch (err) {
          console.error("❌ Error fetching subjects:", err);
          return send(res, 500, { error: err.message });
        }
      }

      // POST /api/admin/subjects
      if (pathname === "/api/admin/subjects" && req.method === "POST") {
        try {
          const body = await parseBody(req);
          const name = (body.name || body.subjectName || "").trim();
          const gradeLevel = (body.gradeLevel || body.grade_level || "").trim();

          if (!name) {
            return send(res, 400, { error: "Subject Name is required." });
          }

          const existing = await db.query(
            "SELECT id FROM subjects WHERE LOWER(TRIM(name)) = LOWER($1)",
            [name]
          );

          if (existing.rows.length > 0) {
            return send(res, 400, { error: "This subject already exists." });
          }

          const resInsert = await db.query(
            "INSERT INTO subjects (name, grade_level) VALUES ($1, $2) RETURNING *",
            [name, gradeLevel]
          );

          const { rows } = await db.query("SELECT * FROM subjects ORDER BY id DESC");
          const normalized = rows.map((s) => ({
            id: s.id,
            name: s.name || "",
            gradeLevel: s.grade_level || "",
          }));

          return send(res, 201, {
            success: true,
            subject: resInsert.rows[0],
            subjects: normalized,
          });
        } catch (err) {
          console.error("❌ Subject creation failure:", err);
          return send(res, 500, { error: err.message });
        }
      }

      // DELETE /api/admin/subjects/:id
      if (pathname.startsWith("/api/admin/subjects/") && req.method === "DELETE") {
        try {
          const subjectId = pathname.split("/").pop();
          const result = await db.query("DELETE FROM subjects WHERE id = $1", [subjectId]);
          if (result.rowCount === 0) return send(res, 404, { error: "Subject not found." });
          return send(res, 200, { success: true });
        } catch (err) {
          console.error("❌ Subject deletion failure:", err);
          return send(res, 500, { error: err.message });
        }
      }

      // GET /api/admin/sections
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
            LEFT JOIN rooms r ON CAST(s.room_id AS VARCHAR) = CAST(r.id AS VARCHAR)
            ORDER BY s.name ASC
          `;
          const { rows } = await db.query(queryText);
          return send(res, 200, rows);
        } catch (err) {
          console.error("❌ Error fetching sections:", err);
          return send(res, 500, { error: err.message });
        }
      }

      // POST /api/admin/sections
      if (pathname === "/api/admin/sections" && req.method === "POST") {
        try {
          const body = await parseBody(req);
          const sectionName = (body.sectionName || body.name || "").trim();
          const gradeLevel = (body.gradeLevel || body.grade || "").trim();
          const roomIdRaw = body.assignedRoom || body.room_id || body.roomId || null;
          const students = body.students !== undefined ? parseInt(body.students, 10) : 0;

          if (!sectionName) {
            return send(res, 400, { error: "Section Name is required." });
          }

          const roomId = roomIdRaw && !isNaN(parseInt(roomIdRaw, 10)) ? parseInt(roomIdRaw, 10) : null;

          const existing = await db.query(
            "SELECT id FROM sections WHERE LOWER(TRIM(name)) = LOWER($1)",
            [sectionName]
          );
          if (existing.rows.length > 0) {
            return send(res, 400, { error: "This section already exists." });
          }

          await db.query(
            "INSERT INTO sections (name, students, grade_level, room_id) VALUES ($1, $2, $3, $4)",
            [sectionName, students, gradeLevel, roomId]
          );

          const { rows } = await db.query(`
            SELECT
              s.id,
              s.name,
              s.students,
              s.grade_level AS "gradeLevel",
              s.room_id AS "roomId",
              r.name AS "roomName"
            FROM sections s
            LEFT JOIN rooms r ON CAST(s.room_id AS VARCHAR) = CAST(r.id AS VARCHAR)
            ORDER BY s.name ASC
          `);
          return send(res, 201, rows);
        } catch (err) {
          console.error("❌ Error inserting section:", err);
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

      // GET /api/admin/rooms
      if (pathname === "/api/admin/rooms" && req.method === "GET") {
        try {
          const { rows } = await db.query("SELECT * FROM rooms ORDER BY id DESC");
          const normalized = rows.map((r) => ({
            id: r.id,
            name: r.name || r.room_name || "",
            capacity: r.capacity || r.max_capacity || 0,
          }));
          return send(res, 200, normalized);
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      // POST /api/admin/rooms
      if (pathname === "/api/admin/rooms" && req.method === "POST") {
        try {
          const body = await parseBody(req);
          const roomName = (body.name || body.roomName || "").trim();
          const capacity = body.capacity !== undefined ? parseInt(body.capacity, 10) : parseInt(body.maxCapacity, 10);

          if (!roomName || isNaN(capacity)) {
            return send(res, 400, { error: "Valid Room Name and Capacity are required." });
          }

          const existing = await db.query(
            "SELECT id FROM rooms WHERE LOWER(TRIM(name)) = LOWER($1)",
            [roomName]
          );

          if (existing.rows.length > 0) {
            return send(res, 400, { error: "This room already exists." });
          }

          const resInsert = await db.query(
            "INSERT INTO rooms (name, capacity) VALUES ($1, $2) RETURNING *",
            [roomName, capacity]
          );

          const { rows } = await db.query("SELECT * FROM rooms ORDER BY id DESC");
          const normalized = rows.map((r) => ({
            id: r.id,
            name: r.name || "",
            capacity: r.capacity || 0,
          }));

          return send(res, 201, {
            success: true,
            room: resInsert.rows[0],
            rooms: normalized,
          });
        } catch (err) {
          console.error("❌ Room registration failure:", err);
          return send(res, 500, { error: "Database failure: " + err.message });
        }
      }

      // DELETE /api/admin/rooms/:id
      if (pathname.startsWith("/api/admin/rooms/") && req.method === "DELETE") {
        try {
          const roomId = pathname.split("/").pop();
          const result = await db.query("DELETE FROM rooms WHERE id = $1", [roomId]);
          if (result.rowCount === 0) return send(res, 404, { error: "Room not found." });
          return send(res, 200, { success: true });
        } catch (err) {
          console.error("❌ Room deletion failure:", err);
          return send(res, 500, { error: err.message });
        }
      }

      // GET /api/admin/teachers
      if (pathname === "/api/admin/teachers" && req.method === "GET") {
        try {
          const { rows } = await db.query("SELECT * FROM teachers ORDER BY id ASC");
          const formattedTeachers = rows.map((teacher) => ({
            ...teacher,
            name: `${teacher.first_name} ${teacher.last_name}`,
            subjects: safeJsonParse(teacher.subjects, []),
            workDays: safeJsonParse(teacher.work_days, []),
            availability: safeJsonParse(teacher.availability, []),
          }));
          return send(res, 200, formattedTeachers);
        } catch (err) {
          console.error("❌ Error fetching teachers:", err);
          return send(res, 500, { error: err.message });
        }
      }

      // GET /api/admin/teachers/:id
      if (pathname.match(/^\/api\/admin\/teachers\/[^/]+$/) && req.method === "GET") {
        try {
          const id = pathname.split("/").pop();
          const { rows } = await db.query("SELECT * FROM teachers WHERE id = $1", [id]);
          if (rows.length === 0) return send(res, 404, { error: "Teacher not found" });

          const teacher = rows[0];
          const formattedTeacher = {
            ...teacher,
            firstName: teacher.first_name,
            lastName: teacher.last_name,
            targetGrade: teacher.target_grade,
            workDays: safeJsonParse(teacher.work_days, []),
            subjects: safeJsonParse(teacher.subjects, []),
            availability: safeJsonParse(teacher.availability, []),
            startTime: teacher.start_time,
            endTime: teacher.end_time,
          };

          return send(res, 200, formattedTeacher);
        } catch (err) {
          console.error("❌ Error fetching teacher details:", err);
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
          for (let i = 0; i < 5; i++) {
            const existingUser = await db.query("SELECT id FROM users WHERE username = $1", [username]);
            if (existingUser.rows.length === 0) break;
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

          let availabilityArray = safeJsonParse(body.availability, []);
          const formattedAvailability = availabilityArray.map((item) => ({
            day: item.day || "Monday",
            from: sanitizeTime(item.from),
            to: sanitizeTime(item.to),
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
              employeeId,
            ]
          );

          const newTeacher = teacherResult.rows[0];
          const teacherIdStr = String(newTeacher.id);
          const userId = "usr-" + genId();
          const hashedPassword = await bcrypt.hash(password, 10);

          await db.query(
            "INSERT INTO users (id, username, password, role, name, teacher_id, email) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            [userId, username, hashedPassword, "teacher", `${firstName} ${lastName}`, teacherIdStr, email]
          );

          const slots = await generateSchedule(newTeacher);

          await db.query(
            "INSERT INTO schedules (teacher_id, slots, generated_at) VALUES ($1, $2, NOW())",
            [teacherIdStr, JSON.stringify(slots)]
          );

          if (email && email.includes("@")) {
            sendCredentialsEmail(email, `${firstName} ${lastName}`, username, password, {
              subjects: rawSubjects,
              workDays: Array.isArray(body.workDays) ? body.workDays : [],
              startTime: body.startTime,
              endTime: body.endTime,
            });
          }

          return send(res, 201, {
            success: true,
            teacher: newTeacher,
            credentials: { username, password },
            schedule: { teacherId: newTeacher.id, slots },
          });
        } catch (err) {
          console.error("❌ Teacher registration error:", err);
          return send(res, 500, { error: err.message });
        }
      }

      // PUT /api/admin/teachers/:id
      if (pathname.match(/^\/api\/admin\/teachers\/[^/]+$/) && req.method === "PUT") {
        try {
          const id = pathname.split("/").pop();
          const body = await parseBody(req);
          const { rows } = await db.query("SELECT * FROM teachers WHERE id = $1", [id]);

          if (rows.length === 0) return send(res, 404, { error: "Teacher not found" });

          const existing = rows[0];
          const firstName = (body.firstName || body.first_name || existing.first_name || "").trim();
          const lastName = (body.lastName || body.last_name || existing.last_name || "").trim();
          const email = (body.email || existing.email || "").trim().toLowerCase();
          const targetGrade = body.targetGrade || body.target_grade || existing.target_grade || "";
          const startTime = body.startTime || body.start_time || existing.start_time || "08:00";
          const endTime = body.endTime || body.end_time || existing.end_time || "16:00";

          const rawSubjects = body.subjects !== undefined ? body.subjects : safeJsonParse(existing.subjects, []);
          const subjectsJSON = JSON.stringify(Array.isArray(rawSubjects) ? rawSubjects : [rawSubjects].filter(Boolean));

          const rawWorkDays = body.workDays !== undefined ? body.workDays : body.work_days !== undefined ? body.work_days : safeJsonParse(existing.work_days, []);
          const workDaysJSON = JSON.stringify(Array.isArray(rawWorkDays) ? rawWorkDays : []);

          const rawAvailability = body.availability !== undefined ? body.availability : safeJsonParse(existing.availability, []);
          const availabilityJSON = JSON.stringify(Array.isArray(rawAvailability) ? rawAvailability : []);

          await db.query(
            `UPDATE teachers
             SET first_name = $1, last_name = $2, email = $3, subjects = $4,
                 target_grade = $5, work_days = $6, start_time = $7, end_time = $8, availability = $9
             WHERE id = $10`,
            [firstName, lastName, email, subjectsJSON, targetGrade, workDaysJSON, startTime, endTime, availabilityJSON, id]
          );

          const updatedResult = await db.query("SELECT * FROM teachers WHERE id = $1", [id]);
          const updatedTeacher = updatedResult.rows[0];

          const newSlots = await generateSchedule({
            ...updatedTeacher,
            workDays: safeJsonParse(updatedTeacher.work_days, []),
            subjects: safeJsonParse(updatedTeacher.subjects, []),
            availability: safeJsonParse(updatedTeacher.availability, []),
          });

          await db.query("DELETE FROM schedules WHERE teacher_id = $1", [String(id)]);
          await db.query("INSERT INTO schedules (teacher_id, slots, generated_at) VALUES ($1, $2, NOW())", [String(id), JSON.stringify(newSlots)]);

          return send(res, 200, {
            success: true,
            teacher: updatedTeacher,
            schedule: { teacherId: id, slots: newSlots },
          });
        } catch (err) {
          console.error("❌ Error updating teacher:", err);
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

          if (!compiledSchedules || typeof compiledSchedules !== "object") {
            return send(res, 400, { error: "Malformed schedule payload matrix." });
          }

          await db.query("DELETE FROM schedules");
          const { rows: teachers } = await db.query("SELECT * FROM teachers");

          for (const [fullName, scheduleObj] of Object.entries(compiledSchedules)) {
            const foundTeacher = teachers.find(
              (t) => `${t.first_name} ${t.last_name}` === fullName || `${t.firstName} ${t.lastName}` === fullName
            );

            if (foundTeacher && scheduleObj && Array.isArray(scheduleObj.slots)) {
              const parsedSlots = scheduleObj.slots.map((slot) => ({
                id: crypto.randomBytes(4).toString("hex"),
                day: slot.day,
                startTime: slot.time ? slot.time.split(" - ")[0] : "08:00 AM",
                endTime: slot.time ? slot.time.split(" - ")[1] : "09:00 AM",
                subject: slot.subject,
                room: slot.room,
                section: slot.section,
                status: "scheduled",
              }));

              await db.query(
                "INSERT INTO schedules (teacher_id, slots, generated_at) VALUES ($1, $2, NOW())",
                [String(foundTeacher.id), JSON.stringify(parsedSlots)]
              );
            }
          }

          return send(res, 200, {
            success: true,
            message: "Master timetable saved directly to PostgreSQL!",
          });
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
          await db.query("DELETE FROM schedules WHERE teacher_id = $1", [String(id)]);
          await db.query(
            `INSERT INTO schedules (teacher_id, slots, generated_at) VALUES ($1, $2, NOW())`,
            [String(id), JSON.stringify(newSlots)]
          );

          return send(res, 200, { teacherId: id, slots: newSlots });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      // ── NEW: POST /api/admin/schedules/save-master ──
      // Saves the admin's client-side master schedule to the per-teacher `schedules`
      // table so teacher dashboards reflect the generated timetable.
      if (pathname === "/api/admin/schedules/save-master" && req.method === "POST") {
        try {
          const body = await parseBody(req);
          const masterSectionSchedules = body.masterSectionSchedules;

          if (!masterSectionSchedules || typeof masterSectionSchedules !== "object") {
            return send(res, 400, { error: "Malformed master schedule payload." });
          }

          const { rows: teachers } = await db.query("SELECT * FROM teachers");

          const normalizeName = (s) =>
            String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

          const teacherByName = new Map();
          teachers.forEach((t) => {
            const full = normalizeName(`${t.first_name || ""} ${t.last_name || ""}`);
            teacherByName.set(full, t);
            if (t.name) teacherByName.set(normalizeName(t.name), t);
          });

          const slotsByTeacher = {};
          let matchedSlots = 0;
          const unmatchedTeachers = new Set();

          const to24 = (t) => {
            if (!t) return "08:00";
            const [hStr, mStr] = String(t).split(":");
            let h = parseInt(hStr, 10);
            const m = parseInt(mStr || "0", 10);
            if (isNaN(h)) h = 8;
            if (h >= 1 && h <= 5) h += 12; // afternoon grid slots
            return `${String(h).padStart(2, "0")}:${String(isNaN(m) ? 0 : m).padStart(2, "0")}`;
          };

          Object.values(masterSectionSchedules).forEach((secObj) => {
            const sectionName = secObj?.details?.name || "Unknown Section";
            const gradeLevel = secObj?.gradeLevel || "";
            const timetable = secObj?.timetable || {};

            Object.entries(timetable).forEach(([day, times]) => {
              Object.entries(times || {}).forEach(([timeRange, slotData]) => {
                if (!slotData || !slotData.teacher) return;

                const teacherName = normalizeName(slotData.teacher);
                const teacherRow = teacherByName.get(teacherName);

                if (!teacherRow) {
                  unmatchedTeachers.add(slotData.teacher);
                  return;
                }

                const teacherIdStr = String(teacherRow.id);
                if (!slotsByTeacher[teacherIdStr]) slotsByTeacher[teacherIdStr] = [];

                let startTime = "08:00";
                let endTime = "09:00";
                if (timeRange && timeRange.includes("-")) {
                  const [s, e] = timeRange.split("-").map((x) => x.trim());
                  startTime = s || startTime;
                  endTime = e || endTime;
                }

                slotsByTeacher[teacherIdStr].push({
                  id: crypto.randomBytes(4).toString("hex"),
                  day,
                  startTime: to24(startTime),
                  endTime: to24(endTime),
                  subject: slotData.subject || "General Subject",
                  section: sectionName,
                  room: slotData.room || "N/A",
                  gradeLevel,
                  status: "scheduled",
                });

                matchedSlots++;
              });
            });
          });

          for (const [teacherId, slots] of Object.entries(slotsByTeacher)) {
            await db.query("DELETE FROM schedules WHERE teacher_id = $1", [teacherId]);
            await db.query(
              "INSERT INTO schedules (teacher_id, slots, generated_at) VALUES ($1, $2, NOW())",
              [teacherId, JSON.stringify(slots)]
            );
          }

          console.log(`✅ Master schedule saved: ${matchedSlots} slots across ${Object.keys(slotsByTeacher).length} teachers`);
          if (unmatchedTeachers.size > 0) {
            console.warn(`⚠️  Teachers in master not matched in DB:`, [...unmatchedTeachers]);
          }

          return send(res, 200, {
            success: true,
            teachersUpdated: Object.keys(slotsByTeacher).length,
            slotsSaved: matchedSlots,
            unmatchedTeachers: [...unmatchedTeachers],
          });
        } catch (err) {
          console.error("❌ Save master schedule failed:", err);
          return send(res, 500, { error: err.message });
        }
      }
    }

    // ── Global Timetable ──
    if (pathname === "/api/timetable" && req.method === "GET") {
      try {
        const auth = getAuth(req);
        if (!auth) return send(res, 401, { error: "Unauthorized access token." });

        const flattenedOutputMatrix = [];
        const { rows: schedules } = await db.query("SELECT * FROM schedules");
        const { rows: teachers } = await db.query("SELECT * FROM teachers");

        schedules.forEach((scheduleSet) => {
          const structuralTeacher = teachers.find((t) => String(t.id) === String(scheduleSet.teacher_id));
          const instructorName = structuralTeacher
            ? `${structuralTeacher.first_name || structuralTeacher.firstName} ${structuralTeacher.last_name || structuralTeacher.lastName}`
            : "Unknown Instructor";

          const slots = safeJsonParse(scheduleSet.slots, []);

          if (Array.isArray(slots)) {
            slots.forEach((slot) => {
              flattenedOutputMatrix.push({
                id: slot.id,
                instructor: instructorName,
                subject: slot.subject,
                section: slot.section,
                room: slot.room,
                day: slot.day,
                timeSlot: `${slot.startTime} to ${slot.endTime}`.replace(" - ", " to "),
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

      // GET /api/teacher/schedule — SELF-HEALING VERSION
      if (pathname === "/api/teacher/schedule" && req.method === "GET") {
        try {
          let targetTeacherId = null;

          const { rows: userRows } = await db.query(
            "SELECT id, name, teacher_id FROM users WHERE id = $1",
            [auth.id]
          );

          if (userRows.length > 0) {
            targetTeacherId = userRows[0].teacher_id;

            if (!targetTeacherId && userRows[0].name) {
              const { rows: byName } = await db.query(
                "SELECT id FROM teachers WHERE (first_name || ' ' || last_name) = $1 LIMIT 1",
                [userRows[0].name]
              );
              if (byName.length > 0) {
                targetTeacherId = String(byName[0].id);
                await db.query(
                  "UPDATE users SET teacher_id = $1 WHERE id = $2",
                  [targetTeacherId, auth.id]
                );
                console.log(`🔧 Backfilled teacher_id=${targetTeacherId} for user ${auth.id}`);
              }
            }
          }

          if (!targetTeacherId) {
            return send(res, 404, { error: "No teacher profile associated with this user." });
          }

          const { rows: teacherRows } = await db.query(
            "SELECT * FROM teachers WHERE id = $1",
            [targetTeacherId]
          );
          const { rows: schedRows } = await db.query(
            "SELECT * FROM schedules WHERE teacher_id = $1",
            [String(targetTeacherId)]
          );

          const scheduleObj = schedRows[0]
            ? { ...schedRows[0], slots: safeJsonParse(schedRows[0].slots, []) }
            : null;

          return send(res, 200, {
            schedule: scheduleObj,
            teacher: teacherRows[0] || null,
          });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }
    }

    return send(res, 404, { error: "API route not found" });
  }

  // ── Static Files Router ──
  const frontendBase = path.resolve(__dirname, "../frontend");

  if (pathname === "/" || pathname === "/login.html") {
    res.writeHead(302, { Location: "/shared/login.html" });
    return res.end();
  }

  const requestedPath = path.resolve(frontendBase, "." + pathname);
  if (!requestedPath.startsWith(frontendBase + path.sep) && requestedPath !== frontendBase) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    return res.end("Forbidden");
  }

  if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
    return serveFile(res, requestedPath);
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, "0.0.0.0", async () => {
  await initAdmin();
  console.log(`\n🚀 Scheduler running locally at http://localhost:${PORT}`);
  console.log(`🔐 Admin login: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);
});

db.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("❌ Supabase Connection Failed:", err.message);
  } else {
    console.log("✅ Successfully connected to Supabase PostgreSQL at:", res.rows[0].now);
  }
});
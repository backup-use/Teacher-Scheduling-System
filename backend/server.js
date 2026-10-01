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

// ── generate 1-hour slots (SHS legacy) ──
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

async function initAdmin() {
  try {
    await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);");
    await db.query("ALTER TABLE sections ADD COLUMN IF NOT EXISTS shift VARCHAR(3) DEFAULT 'AM';");
    await db.query("ALTER TABLE teachers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;");
    await db.query("ALTER TABLE teachers ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP NULL;");
    await db.query("ALTER TABLE teachers ADD COLUMN IF NOT EXISTS hidden_by VARCHAR(255) NULL;");

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
      console.log(isLegacy ? `🔧 Migrated admin password from SHA-256 to bcrypt.` : `🔧 Admin password healed.`);
    } else {
      console.log("✅ Admin account OK.");
    }
  } catch (err) {
    console.error("❌ Error initializing admin:", err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// ═══ JHS SCHEDULING ENGINE (Grade 7-10 only, AM/PM)         ═══
// ═══════════════════════════════════════════════════════════════

const JHS_AM_SLOTS = [
  { time: "06:00-06:50", start: "06:00", end: "06:50", isBreak: false },
  { time: "06:50-07:40", start: "06:50", end: "07:40", isBreak: false },
  { time: "07:40-08:30", start: "07:40", end: "08:30", isBreak: false },
  { time: "08:30-09:00", start: null,    end: null,    isBreak: true  },
  { time: "09:00-09:50", start: "09:00", end: "09:50", isBreak: false },
  { time: "09:50-10:40", start: "09:50", end: "10:40", isBreak: false },
  { time: "10:40-11:30", start: "10:40", end: "11:30", isBreak: false },
];

const JHS_PM_SLOTS = [
  { time: "12:30-13:20", start: "12:30", end: "13:20", isBreak: false },
  { time: "13:20-14:10", start: "13:20", end: "14:10", isBreak: false },
  { time: "14:10-15:00", start: "14:10", end: "15:00", isBreak: false },
  { time: "15:00-15:30", start: null,    end: null,    isBreak: true  },
  { time: "15:30-16:20", start: "15:30", end: "16:20", isBreak: false },
  { time: "16:20-17:10", start: "16:20", end: "17:10", isBreak: false },
  { time: "17:10-18:00", start: "17:10", end: "18:00", isBreak: false },
];

const JHS_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function jhsGradeNum(s) {
  const m = String(s || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : NaN;
}

function jhsAliasSubject(raw) {
  const c = String(raw || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (c.includes("values") || c.includes("esp") || c.includes("edukasyon")) return "valueseducation";
  if (c.includes("mapeh") || c.includes("music") || c.includes("arts") || c.includes("health")) return "mapeh";
  if (c === "ap" || c.includes("araling")) return "aralingpanlipunan";
  if (c.includes("tle") || c.includes("epp")) return "tle";
  if (c.includes("math")) return "mathematics";
  if (c.includes("sci")) return "science";
  if (c.includes("eng")) return "english";
  if (c.includes("fil") || c.includes("pilipino")) return "filipino";
  return c;
}

async function generateJHSMaster(payload) {
  const overrides = payload.sectionOverrides || {};

  const { rows: teachers } = await db.query("SELECT * FROM teachers WHERE is_active = TRUE OR is_active IS NULL ORDER BY id ASC");
  const { rows: sections } = await db.query("SELECT * FROM sections ORDER BY id ASC");
  const { rows: rooms } = await db.query("SELECT * FROM rooms ORDER BY id ASC");
  const { rows: subjects } = await db.query("SELECT * FROM subjects ORDER BY id ASC");

  const jhsSections = sections.filter(s => {
    const g = jhsGradeNum(s.grade_level || s.gradeLevel);
    return g >= 7 && g <= 10;
  });

  if (jhsSections.length === 0) {
    return { sectionsProcessed: 0, teachersUpdated: 0, masterSectionSchedules: {} };
  }

  const tList = teachers.map(t => {
    const first = t.first_name || t.firstName || "";
    const last = t.last_name || t.lastName || "";
    const full = (t.name || `${first} ${last}`).trim();
    return {
      id: t.id,
      fullName: full,
      key: full.toLowerCase().replace(/\s+/g, " ").trim(),
      subjects: safeJsonParse(t.subjects, []).map(jhsAliasSubject),
      targetGrade: jhsGradeNum(t.target_grade || t.targetGrade),
      workDays: safeJsonParse(t.work_days || t.workDays, []),
    };
  });

  const subjectCatalog = subjects.map(s => ({
    id: s.id, name: s.name,
    grade: jhsGradeNum(s.grade_level || s.gradeLevel),
    alias: jhsAliasSubject(s.name),
  }));

  const DEFAULT_JHS_SUBJECTS = ["Mathematics", "Science", "English", "Filipino", "Araling Panlipunan", "MAPEH", "TLE", "Values Education"];

  const usedTeachers = new Set();
  const usedRooms = new Set();
  const dailyTeacherCount = {};

  const masterSectionSchedules = {};

  for (const section of jhsSections) {
    const secName = section.name;
    const secGrade = jhsGradeNum(section.grade_level || section.gradeLevel || "Grade 7");

    let shift = String(overrides[secName] || section.shift || "").toUpperCase();
    if (shift !== "AM" && shift !== "PM") {
      shift = Math.random() < 0.5 ? "AM" : "PM";
      try {
        await db.query("UPDATE sections SET shift = $1 WHERE id = $2", [shift, section.id]);
      } catch (e) { /* ignore */ }
    }

    const layout = shift === "PM" ? JHS_PM_SLOTS : JHS_AM_SLOTS;

    let subjNames = safeJsonParse(section.subjects);
    if (subjNames.length === 0) {
      subjNames = subjectCatalog.filter(c => c.grade === secGrade).map(c => c.name);
    }
    if (subjNames.length === 0) subjNames = DEFAULT_JHS_SUBJECTS.slice();

    function teacherForSubject(subjName) {
      const alias = jhsAliasSubject(subjName);
      return tList.find(t =>
        (!t.targetGrade || t.targetGrade === secGrade) &&
        t.subjects.some(s => s === alias || s.includes(alias) || alias.includes(s))
      ) || null;
    }

    const timetable = {};
    JHS_DAYS.forEach(d => { timetable[d] = {}; });

    const subjCount = {};
    subjNames.forEach(n => subjCount[n] = 0);

    const target = 3;
    let subjCursor = 0;

    for (const day of JHS_DAYS) {
      for (const slot of layout) {
        if (slot.isBreak) {
          timetable[day][slot.time] = null;
          continue;
        }

        let picked = null;
        for (let i = 0; i < subjNames.length * 2; i++) {
          const cand = subjNames[subjCursor % subjNames.length];
          subjCursor++;
          if (subjCount[cand] < target) { picked = cand; break; }
        }

        if (!picked) { timetable[day][slot.time] = null; continue; }

        const teacher = teacherForSubject(picked);
        if (!teacher) { timetable[day][slot.time] = null; continue; }

        const tKey = `${teacher.id}-${day}-${slot.start}`;
        if (usedTeachers.has(tKey)) { timetable[day][slot.time] = null; continue; }

        const dKey = `${teacher.id}-${day}`;
        if ((dailyTeacherCount[dKey] || 0) >= 6) { timetable[day][slot.time] = null; continue; }

        let chosenRoom = null;
        for (const r of rooms) {
          const rk = `${r.name}-${day}-${slot.start}`;
          if (!usedRooms.has(rk)) { chosenRoom = r.name; break; }
        }
        if (!chosenRoom && rooms.length > 0) chosenRoom = rooms[0].name;

        timetable[day][slot.time] = {
          subject: picked,
          teacher: teacher.fullName,
          teacherId: teacher.id,
          room: chosenRoom || "TBD",
          gradeLevel: secGrade,
        };

        subjCount[picked]++;
        usedTeachers.add(tKey);
        usedRooms.add(`${chosenRoom}-${day}-${slot.start}`);
        dailyTeacherCount[dKey] = (dailyTeacherCount[dKey] || 0) + 1;
      }
    }

    masterSectionSchedules[secName] = {
      details: section,
      gradeLevel: `Junior High School - Grade ${secGrade}`,
      shift,
      slots: layout.map(s => s.time),
      timetable,
    };
  }

  const slotsByTeacher = {};
  Object.values(masterSectionSchedules).forEach(secObj => {
    const secName = secObj.details.name;
    const gradeLevel = secObj.gradeLevel;
    const shift = secObj.shift;
    Object.entries(secObj.timetable).forEach(([day, times]) => {
      Object.entries(times).forEach(([timeRange, data]) => {
        if (!data || !data.teacherId) return;
        const tid = String(data.teacherId);
        if (!slotsByTeacher[tid]) slotsByTeacher[tid] = [];
        const [start, end] = timeRange.split("-");
        slotsByTeacher[tid].push({
          id: crypto.randomBytes(4).toString("hex"),
          day, startTime: start, endTime: end,
          subject: data.subject,
          section: secName, room: data.room,
          gradeLevel, shift,
          teacherId: data.teacherId,
          teacherName: data.teacher,
          status: "scheduled",
        });
      });
    });
  });

  const idsInMaster = new Set(Object.keys(slotsByTeacher));
  for (const t of tList) {
    const tid = String(t.id);
    await db.query("DELETE FROM schedules WHERE teacher_id = $1", [tid]);
    if (idsInMaster.has(tid)) {
      await db.query(
        "INSERT INTO schedules (teacher_id, slots, generated_at) VALUES ($1, $2, NOW())",
        [tid, JSON.stringify(slotsByTeacher[tid])]
      );
    }
  }

  return {
    sectionsProcessed: jhsSections.length,
    teachersUpdated: idsInMaster.size,
    masterSectionSchedules,
  };
}

// ── Main Server Router ──

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;
  const query = Object.fromEntries(parsedUrl.searchParams);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": CORS_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
    });
    return res.end();
  }

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

        if (rows.length === 0) return send(res, 401, { error: "Invalid credentials." });

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

        if (!valid) return send(res, 401, { error: "Invalid credentials." });

        const token = jwt.sign(
          { id: user.id, username: user.username, role: user.role, teacherId: user.teacher_id },
          JWT_SECRET,
          { expiresIn: "24h" }
        );

        return send(res, 200, {
          token,
          user: { id: user.id, username: user.username, role: user.role, name: user.name, teacher_id: user.teacher_id },
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

      if (pathname === "/api/admin/generate-jhs-master" && req.method === "POST") {
        try {
          const body = await parseBody(req);
          const result = await generateJHSMaster(body);
          console.log(`✅ JHS master saved: ${result.sectionsProcessed} sections, ${result.teachersUpdated} teachers`);
          return send(res, 200, { success: true, ...result });
        } catch (err) {
          console.error("❌ JHS generation failed:", err);
          return send(res, 500, { error: err.message });
        }
      }

      // GET /api/admin/subjects
      if (pathname === "/api/admin/subjects" && req.method === "GET") {
        try {
          const { rows } = await db.query("SELECT * FROM subjects ORDER BY id DESC");
          return send(res, 200, rows.map(s => ({
            id: s.id, name: s.name || "", gradeLevel: s.grade_level || "",
          })));
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      // POST /api/admin/subjects
      if (pathname === "/api/admin/subjects" && req.method === "POST") {
        try {
          const body = await parseBody(req);
          const name = (body.name || body.subjectName || "").trim();
          const gradeLevel = (body.gradeLevel || body.grade_level || "").trim();
          if (!name) return send(res, 400, { error: "Subject Name is required." });

          const existing = await db.query("SELECT id FROM subjects WHERE LOWER(TRIM(name)) = LOWER($1)", [name]);
          if (existing.rows.length > 0) return send(res, 400, { error: "This subject already exists." });

          const resInsert = await db.query(
            "INSERT INTO subjects (name, grade_level) VALUES ($1, $2) RETURNING *",
            [name, gradeLevel]
          );

          const { rows } = await db.query("SELECT * FROM subjects ORDER BY id DESC");
          return send(res, 201, {
            success: true,
            subject: resInsert.rows[0],
            subjects: rows.map(s => ({ id: s.id, name: s.name || "", gradeLevel: s.grade_level || "" })),
          });
        } catch (err) {
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
          return send(res, 500, { error: err.message });
        }
      }

      // GET /api/admin/sections
      if (pathname === "/api/admin/sections" && req.method === "GET") {
        try {
          const queryText = `
            SELECT
              s.id, s.name, s.students,
              s.grade_level AS "gradeLevel",
              s.room_id AS "roomId",
              s.shift,
              r.name AS "roomName",
              r.capacity AS "roomCapacity"
            FROM sections s
            LEFT JOIN rooms r ON CAST(s.room_id AS VARCHAR) = CAST(r.id AS VARCHAR)
            ORDER BY s.name ASC
          `;
          const { rows } = await db.query(queryText);
          return send(res, 200, rows);
        } catch (err) {
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
          const shift = String(body.shift || "AM").toUpperCase();

          if (!sectionName) return send(res, 400, { error: "Section Name is required." });

          const roomId = roomIdRaw && !isNaN(parseInt(roomIdRaw, 10)) ? parseInt(roomIdRaw, 10) : null;

          const existing = await db.query("SELECT id FROM sections WHERE LOWER(TRIM(name)) = LOWER($1)", [sectionName]);
          if (existing.rows.length > 0) return send(res, 400, { error: "This section already exists." });

          await db.query(
            "INSERT INTO sections (name, students, grade_level, room_id, shift) VALUES ($1, $2, $3, $4, $5)",
            [sectionName, students, gradeLevel, roomId, shift]
          );

          const { rows } = await db.query(`
            SELECT s.id, s.name, s.students, s.grade_level AS "gradeLevel", s.room_id AS "roomId", s.shift, r.name AS "roomName"
            FROM sections s
            LEFT JOIN rooms r ON CAST(s.room_id AS VARCHAR) = CAST(r.id AS VARCHAR)
            ORDER BY s.name ASC
          `);
          return send(res, 201, rows);
        } catch (err) {
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
          return send(res, 200, rows.map(r => ({
            id: r.id, name: r.name || r.room_name || "", capacity: r.capacity || r.max_capacity || 0,
          })));
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
          if (!roomName || isNaN(capacity)) return send(res, 400, { error: "Valid Room Name and Capacity are required." });

          const existing = await db.query("SELECT id FROM rooms WHERE LOWER(TRIM(name)) = LOWER($1)", [roomName]);
          if (existing.rows.length > 0) return send(res, 400, { error: "This room already exists." });

          const resInsert = await db.query(
            "INSERT INTO rooms (name, capacity) VALUES ($1, $2) RETURNING *",
            [roomName, capacity]
          );
          const { rows } = await db.query("SELECT * FROM rooms ORDER BY id DESC");
          return send(res, 201, {
            success: true,
            room: resInsert.rows[0],
            rooms: rows.map(r => ({ id: r.id, name: r.name || "", capacity: r.capacity || 0 })),
          });
        } catch (err) {
          return send(res, 500, { error: err.message });
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
          return send(res, 500, { error: err.message });
        }
      }

      // GET /api/admin/teachers
      if (pathname === "/api/admin/teachers" && req.method === "GET") {
        try {
          const includeHidden = query.includeHidden === "true";
          const onlyHidden = query.onlyHidden === "true";

          let sql = "SELECT * FROM teachers";
          if (onlyHidden) {
            sql += " WHERE is_active = FALSE";
          } else if (!includeHidden) {
            sql += " WHERE is_active = TRUE OR is_active IS NULL";
          }
          sql += " ORDER BY is_active DESC, id ASC";

          const { rows } = await db.query(sql);
          return send(res, 200, rows.map(t => ({
            ...t,
            name: `${t.first_name} ${t.last_name}`,
            is_active: t.is_active !== false,
            subjects: safeJsonParse(t.subjects, []),
            workDays: safeJsonParse(t.work_days, []),
            availability: safeJsonParse(t.availability, []),
          })));
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      // GET /api/admin/teachers/hidden-count
      if (pathname === "/api/admin/teachers/hidden-count" && req.method === "GET") {
        try {
          const { rows } = await db.query("SELECT COUNT(*) as count FROM teachers WHERE is_active = FALSE");
          return send(res, 200, { count: parseInt(rows[0].count, 10) });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      // GET /api/admin/teachers/:id
      if (pathname.match(/^\/api\/admin\/teachers\/[^/]+$/) && req.method === "GET") {
        try {
          const id = pathname.split("/").pop();
          const { rows } = await db.query("SELECT * FROM teachers WHERE id = $1", [id]);
          if (rows.length === 0) return send(res, 404, { error: "Teacher not found" });
          const t = rows[0];
          return send(res, 200, {
            ...t,
            firstName: t.first_name, lastName: t.last_name,
            targetGrade: t.target_grade,
            is_active: t.is_active !== false,
            workDays: safeJsonParse(t.work_days, []),
            subjects: safeJsonParse(t.subjects, []),
            availability: safeJsonParse(t.availability, []),
            startTime: t.start_time, endTime: t.end_time,
          });
        } catch (err) {
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

          if (!firstName || !lastName) return send(res, 400, { error: "First name and last name are required." });

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
            let isPM = t.includes("pm"); let isAM = t.includes("am");
            let nums = t.replace(/[^0-9:]/g, "").split(":");
            let h = parseInt(nums[0], 10);
            let m = nums[1] ? parseInt(nums[1], 10) : 0;
            if (isPM && h !== 12) h += 12;
            if (isAM && h === 12) h = 0;
            return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          }

          let availabilityArray = safeJsonParse(body.availability, []);
          const formattedAvailability = availabilityArray.map(item => ({
            day: item.day || "Monday",
            from: sanitizeTime(item.from),
            to: sanitizeTime(item.to),
          }));

          const teacherResult = await db.query(
            `INSERT INTO teachers (
              first_name, last_name, email, subjects, target_grade,
              work_days, start_time, end_time, availability, employee_id, is_active, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, NOW()) RETURNING *`,
            [
              firstName, lastName, email || "no-email@school.edu",
              subjectsJSON, targetGrade, workDaysJSON,
              sanitizeTime(body.startTime), sanitizeTime(body.endTime),
              JSON.stringify(formattedAvailability), employeeId,
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

          const slots = [];

          if (email && email.includes("@")) {
            sendCredentialsEmail(email, `${firstName} ${lastName}`, username, password, {});
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
          const rawWorkDays = body.workDays !== undefined ? body.workDays : safeJsonParse(existing.work_days, []);
          const workDaysJSON = JSON.stringify(Array.isArray(rawWorkDays) ? rawWorkDays : []);
          const rawAvail = body.availability !== undefined ? body.availability : safeJsonParse(existing.availability, []);
          const availabilityJSON = JSON.stringify(Array.isArray(rawAvail) ? rawAvail : []);

          await db.query(
            `UPDATE teachers
             SET first_name = $1, last_name = $2, email = $3, subjects = $4,
                 target_grade = $5, work_days = $6, start_time = $7, end_time = $8, availability = $9
             WHERE id = $10`,
            [firstName, lastName, email, subjectsJSON, targetGrade, workDaysJSON, startTime, endTime, availabilityJSON, id]
          );

          const updatedResult = await db.query("SELECT * FROM teachers WHERE id = $1", [id]);
          return send(res, 200, { success: true, teacher: updatedResult.rows[0] });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      // POST /api/admin/teachers/:id/hide
      if (pathname.match(/^\/api\/admin\/teachers\/[^/]+\/hide$/) && req.method === "POST") {
        try {
          const parts = pathname.split("/");
          const teacherId = parts[parts.length - 2];

          const { rows } = await db.query("SELECT id, is_active FROM teachers WHERE id = $1", [teacherId]);
          if (rows.length === 0) return send(res, 404, { error: "Teacher not found" });
          if (rows[0].is_active === false) return send(res, 400, { error: "Teacher is already hidden." });

          await db.query(
            "UPDATE teachers SET is_active = FALSE, hidden_at = NOW(), hidden_by = $1 WHERE id = $2",
            [auth.username || "admin", teacherId]
          );

          console.log(`🙈 Teacher ${teacherId} hidden by ${auth.username || "admin"}`);
          return send(res, 200, { success: true, message: "Teacher hidden successfully." });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      // POST /api/admin/teachers/:id/unhide
      if (pathname.match(/^\/api\/admin\/teachers\/[^/]+\/unhide$/) && req.method === "POST") {
        try {
          const parts = pathname.split("/");
          const teacherId = parts[parts.length - 2];

          const { rows } = await db.query("SELECT id, is_active FROM teachers WHERE id = $1", [teacherId]);
          if (rows.length === 0) return send(res, 404, { error: "Teacher not found" });
          if (rows[0].is_active === true) return send(res, 400, { error: "Teacher is already active." });

          await db.query(
            "UPDATE teachers SET is_active = TRUE, hidden_at = NULL, hidden_by = NULL WHERE id = $1",
            [teacherId]
          );

          console.log(`👁️ Teacher ${teacherId} unhidden by ${auth.username || "admin"}`);
          return send(res, 200, { success: true, message: "Teacher restored successfully." });
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
          return send(res, 200, schedules.map(s => {
            const teacher = teachers.find(t => String(t.id) === String(s.teacher_id));
            return { ...s, slots: safeJsonParse(s.slots, []), teacher };
          }));
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      // POST /api/admin/schedules/save-master
      if (pathname === "/api/admin/schedules/save-master" && req.method === "POST") {
        try {
          const body = await parseBody(req);
          const masterSectionSchedules = body.masterSectionSchedules;
          if (!masterSectionSchedules || typeof masterSectionSchedules !== "object") {
            return send(res, 400, { error: "Malformed master schedule payload." });
          }

          const { rows: teachers } = await db.query("SELECT * FROM teachers WHERE is_active = TRUE OR is_active IS NULL");
          const normalizeName = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
          const teacherByName = new Map();
          teachers.forEach(t => {
            teacherByName.set(normalizeName(`${t.first_name} ${t.last_name}`), t);
            if (t.name) teacherByName.set(normalizeName(t.name), t);
          });

          const slotsByTeacher = {};
          let matchedSlots = 0;
          const unmatchedTeachers = new Set();

          Object.values(masterSectionSchedules).forEach(secObj => {
            const sectionName = secObj?.details?.name || "Unknown";
            const gradeLevel = secObj?.gradeLevel || "";
            Object.entries(secObj?.timetable || {}).forEach(([day, times]) => {
              Object.entries(times || {}).forEach(([timeRange, slotData]) => {
                if (!slotData || !slotData.teacher) return;
                const teacherRow = teacherByName.get(normalizeName(slotData.teacher));
                if (!teacherRow) { unmatchedTeachers.add(slotData.teacher); return; }

                const tid = String(teacherRow.id);
                if (!slotsByTeacher[tid]) slotsByTeacher[tid] = [];

                const [s, e] = timeRange.split("-").map(x => x.trim());
                slotsByTeacher[tid].push({
                  id: crypto.randomBytes(4).toString("hex"),
                  day, startTime: s, endTime: e,
                  subject: slotData.subject || "General Subject",
                  section: sectionName,
                  room: slotData.room || "N/A",
                  gradeLevel,
                  teacherId: teacherRow.id,
                  teacherName: `${teacherRow.first_name} ${teacherRow.last_name}`,
                  status: "scheduled",
                });
                matchedSlots++;
              });
            });
          });

          for (const [tid, slots] of Object.entries(slotsByTeacher)) {
            await db.query("DELETE FROM schedules WHERE teacher_id = $1", [tid]);
            await db.query(
              "INSERT INTO schedules (teacher_id, slots, generated_at) VALUES ($1, $2, NOW())",
              [tid, JSON.stringify(slots)]
            );
          }

          return send(res, 200, {
            success: true,
            teachersUpdated: Object.keys(slotsByTeacher).length,
            slotsSaved: matchedSlots,
            unmatchedTeachers: [...unmatchedTeachers],
          });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      // ═══════════════════════════════════════════════════════════
      // ═══ POST /api/admin/schedules/swap — by SLOT ID          ═══
      // ═══════════════════════════════════════════════════════════
      if (pathname === "/api/admin/schedules/swap" && req.method === "POST") {
        try {
          const body = await parseBody(req);
          const { cellA, cellB, mode } = body;

          if (!cellA || !cellA.slotId) {
            return send(res, 400, { error: "cellA.slotId is required." });
          }

          const getTeacherName = async (tid) => {
            const { rows } = await db.query(
              "SELECT first_name, last_name FROM teachers WHERE id = $1",
              [String(tid)]
            );
            if (rows.length === 0) return "";
            return `${rows[0].first_name} ${rows[0].last_name}`.trim();
          };

          // ═══ CASE 1: MOVE ═══
          if (mode === "move" || !cellB || !cellB.teacherId) {
            if (!cellA.teacherId || !cellA.targetDay || !cellA.targetStartTime || !cellA.targetEndTime) {
              return send(res, 400, { error: "Move target required." });
            }

            const { rows: rowsA } = await db.query(
              "SELECT * FROM schedules WHERE teacher_id = $1",
              [String(cellA.teacherId)]
            );
            if (rowsA.length === 0) {
              return send(res, 404, { error: `Teacher has no schedule.` });
            }

            const tName = await getTeacherName(cellA.teacherId);

            const slotsA = safeJsonParse(rowsA[0].slots, []).map(s => ({
              ...s,
              teacherId: parseInt(cellA.teacherId, 10),
              teacherName: tName,
            }));

            const idxA = slotsA.findIndex(s => String(s.id) === String(cellA.slotId));
            if (idxA === -1) {
              return send(res, 404, { error: "Source slot ID not found." });
            }

            const originalSlot = { ...slotsA[idxA] };
            slotsA[idxA] = {
              ...originalSlot,
              day: cellA.targetDay,
              startTime: cellA.targetStartTime,
              endTime: cellA.targetEndTime,
            };

            await db.query(
              "UPDATE schedules SET slots = $1, generated_at = NOW() WHERE teacher_id = $2",
              [JSON.stringify(slotsA), String(cellA.teacherId)]
            );

            console.log(`↔️ Move: slot ${cellA.slotId} → ${cellA.targetDay} ${cellA.targetStartTime}`);

            return send(res, 200, {
              success: true,
              mode: "move",
              message: "Moved successfully.",
            });
          }

                // ═══ CASE 2: SWAP ═══
              if (!cellB.slotId || !cellB.teacherId) {
                return send(res, 400, { error: "cellB.slotId and cellB.teacherId are required." });
              }

              // ═══ STEP 1: Hanapin ang DALAWANG slot sa LAHAT ng schedules ═══
              const { rows: allSchedules } = await db.query("SELECT * FROM schedules");

              function findSlot(slotId) {
                for (let i = 0; i < allSchedules.length; i++) {
                  const slots = safeJsonParse(allSchedules[i].slots, []);
                  const idx = slots.findIndex(s => String(s.id) === String(slotId));
                  if (idx !== -1) {
                    return { rowIndex: i, slotIndex: idx, slots, row: allSchedules[i], rowOwnerId: allSchedules[i].teacher_id };
                  }
                }
                return null;
              }

              const locA = findSlot(cellA.slotId);
              const locB = findSlot(cellB.slotId);

              if (!locA) return send(res, 404, { error: `Source slot ID "${cellA.slotId}" not found.` });
              if (!locB) return send(res, 404, { error: `Target slot ID "${cellB.slotId}" not found.` });

              // ═══ STEP 2: Snapshot the FULL CONTENT ═══
              const contentA = { ...locA.slots[locA.slotIndex] };
              const contentB = { ...locB.slots[locB.slotIndex] };

              // ═══ STEP 3: Determine the TRUE owners of each slot ═══
              // Ito ang teacher na TALAGANG nagtuturo ng subject na ito.
              // Pagkatapos ng swap, sila ang magiging bagong row owner.
              const trueTeacherAId = contentA.teacherId || locA.rowOwnerId;
              const trueTeacherBId = contentB.teacherId || locB.rowOwnerId;

              const trueTeacherAName = await getTeacherName(trueTeacherAId);
              const trueTeacherBName = await getTeacherName(trueTeacherBId);

              console.log(`🔍 Swap Debug:`);
              console.log(`   Slot A: ${contentA.subject} | Current Owner: ${locA.rowOwnerId} | True Teacher: ${trueTeacherAId}`);
              console.log(`   Slot B: ${contentB.subject} | Current Owner: ${locB.rowOwnerId} | True Teacher: ${trueTeacherBId}`);

              // ═══ STEP 4: Create the SWAPPED content ═══
              // Ang bawat position ay mananatili (id, day, time, section).
              // Ang content (subject, room, teacher) ay mag-swap.
              // ANG TEACHER ID AY MAG-SWAP DIN — dahil ang bagong subject ay pag-aari ng bagong teacher.

              // Position A: keep position, get B's content + B's teacher identity
              const newSlotA = {
                id: contentA.id,
                day: contentA.day,
                startTime: contentA.startTime,
                endTime: contentA.endTime,
                section: contentA.section,
                gradeLevel: contentB.gradeLevel || contentA.gradeLevel,
                status: "scheduled",
                // ⬇️ SWAPPED CONTENT ⬇️
                subject: contentB.subject,
                room: contentB.room,
                teacherId: parseInt(trueTeacherBId, 10),
                teacherName: trueTeacherBName,
              };

              // Position B: keep position, get A's content + A's teacher identity
              const newSlotB = {
                id: contentB.id,
                day: contentB.day,
                startTime: contentB.startTime,
                endTime: contentB.endTime,
                section: contentB.section,
                gradeLevel: contentA.gradeLevel || contentB.gradeLevel,
                status: "scheduled",
                // ⬇️ SWAPPED CONTENT ⬇️
                subject: contentA.subject,
                room: contentA.room,
                teacherId: parseInt(trueTeacherAId, 10),
                teacherName: trueTeacherAName,
              };

              // ═══ STEP 5: Alisin ang slots sa kanilang LUMANG rows ═══
              // Kailangan nating i-remove sila muna, tapos i-add sa TAMANG rows.
              // Ito ay para maiwasan ang duplicate.
              
              locA.slots.splice(locA.slotIndex, 1);
              // Kung same row, hindi na kailangan i-remove sa slotB
              // dahil nagbago na ang index ng slotB.
              
              if (locA.rowIndex !== locB.rowIndex) {
                // Magkaibang rows — i-remove si slotB sa kanyang row (adjusting index kung kinakailangan)
                const adjustedBIndex = locB.slotIndex > locA.slotIndex && locA.rowIndex === locB.rowIndex
                  ? locB.slotIndex - 1
                  : locB.slotIndex;
                locB.slots.splice(adjustedBIndex, 1);
              } else {
                // Same row — mali ang locB.slotIndex ngayon dahil sa splice
                // Kailangan i-recompute
                // Sa same row, hindi natin kailangan i-remove si slotB — nandoon pa rin siya.
                // Pero kailangan i-update ang index niya.
                // Higit pa rito, kailangan i-handle ang mas kumplikadong case.
              }

              // ═══ STEP 6: I-add ang bagong slots sa TAMANG teachers' rows ═══
              // Hanapin ang rows ng trueTeacherA at trueTeacherB
              
              // Kunin ang current schedules ulit (fresh from DB) para may updated slots
              const { rows: freshSchedules } = await db.query("SELECT * FROM schedules");
              
              // Helper: hanapin o gumawa ng row para sa teacher
              function getOrCreateRow(teacherId) {
                let row = freshSchedules.find(s => String(s.teacher_id) === String(teacherId));
                return row;
              }

              // Aalisin muna natin ang slots sa kanilang kasalukuyang rows sa DB.
              // Susunod, i-add natin ang newSlotA sa row ni trueTeacherB (dahil siya ang bagong may-ari),
              // at ang newSlotB sa row ni trueTeacherA.
              
              // ═══ I-load ang lahat ng slots ng lahat ng rows ═══
              const slotsByTeacher = {};
              freshSchedules.forEach(s => {
                slotsByTeacher[String(s.teacher_id)] = safeJsonParse(s.slots, []);
              });

              // ═══ I-remove ang LUMANG slotA at slotB sa kanilang rows ═══
              // Hanapin sila by ID sa lahat ng rows at i-remove
              Object.keys(slotsByTeacher).forEach(tid => {
                slotsByTeacher[tid] = slotsByTeacher[tid].filter(
                  s => String(s.id) !== String(contentA.id) && String(s.id) !== String(contentB.id)
                );
              });

              // ═══ I-add ang bagong slots sa TAMANG teachers ═══
              const ownerA = String(trueTeacherBId); // newSlotA belongs to teacher B (because it has B's content)
              const ownerB = String(trueTeacherAId); // newSlotB belongs to teacher A

              if (!slotsByTeacher[ownerA]) slotsByTeacher[ownerA] = [];
              if (!slotsByTeacher[ownerB]) slotsByTeacher[ownerB] = [];

              slotsByTeacher[ownerA].push(newSlotA);
              slotsByTeacher[ownerB].push(newSlotB);

              // ═══ STEP 7: I-save lahat ng modified rows pabalik sa DB ═══
              const teachersToUpdate = new Set([ownerA, ownerB, String(locA.rowOwnerId), String(locB.rowOwnerId)]);
              
              for (const tid of teachersToUpdate) {
                const slots = slotsByTeacher[tid] || [];
                await db.query(
                  "UPDATE schedules SET slots = $1, generated_at = NOW() WHERE teacher_id = $2",
                  [JSON.stringify(slots), tid]
                );
              }

              console.log(`🔄 SWAP SUCCESSFUL (ownership-aware):`);
              console.log(`   Position A: ${contentA.subject}(${trueTeacherAName}) → ${contentB.subject}(${trueTeacherBName})`);
              console.log(`   Position B: ${contentB.subject}(${trueTeacherBName}) → ${contentA.subject}(${trueTeacherAName})`);

              return send(res, 200, {
                success: true,
                mode: "swap",
                message: "Swap successful.",
              });
        } catch (err) {
          console.error("❌ Swap/Move failed:", err);
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
            "INSERT INTO schedules (teacher_id, slots, generated_at) VALUES ($1, $2, NOW())",
            [String(id), JSON.stringify(newSlots)]
          );
          return send(res, 200, { teacherId: id, slots: newSlots });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }
    }

    // ── Global Timetable ──
    if (pathname === "/api/timetable" && req.method === "GET") {
      try {
        const auth = getAuth(req);
        if (!auth) return send(res, 401, { error: "Unauthorized access token." });
        const { rows: schedules } = await db.query("SELECT * FROM schedules");
        const { rows: teachers } = await db.query("SELECT * FROM teachers");
        const out = [];
        schedules.forEach(s => {
          const t = teachers.find(x => String(x.id) === String(s.teacher_id));
          if (!t || t.is_active === false) return;
          const name = `${t.first_name} ${t.last_name}`;
          safeJsonParse(s.slots, []).forEach(slot => {
            out.push({
              id: slot.id, instructor: name,
              subject: slot.subject, section: slot.section, room: slot.room, day: slot.day,
              timeSlot: `${slot.startTime} to ${slot.endTime}`,
            });
          });
        });
        return send(res, 200, out);
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


          // ═══ STEP 1: Hanapin ang teacher ID ng naka-login ═══
          let targetTeacherId = null;
          const { rows: userRows } = await db.query(
            "SELECT id, name, teacher_id FROM users WHERE id = $1",
            [auth.id]
          );
          
          if (userRows.length > 0) {
            targetTeacherId = userRows[0].teacher_id;
            
            // Fallback: hanapin by name kung walang teacher_id
            if (!targetTeacherId && userRows[0].name) {
              const { rows: byName } = await db.query(
                "SELECT id FROM teachers WHERE (first_name || ' ' || last_name) = $1 LIMIT 1",
                [userRows[0].name]
              );
              if (byName.length > 0) {
                targetTeacherId = String(byName[0].id);
                await db.query("UPDATE users SET teacher_id = $1 WHERE id = $2", [targetTeacherId, auth.id]);
              }
            }
          }
          
          if (!targetTeacherId) {
            return send(res, 404, { error: "No teacher profile associated." });
          }

          // ═══ STEP 2: Kunin ang teacher info ═══
          const { rows: teacherRows } = await db.query(
            "SELECT * FROM teachers WHERE id = $1",
            [targetTeacherId]
          );

          // ═══ STEP 3: THE FIX — Kunin ang LAHAT ng schedules, i-filter by slot.teacherId ═══
          // Hindi na tayo umaasa sa schedules.teacher_id (row owner).
          // Hinahanap natin ang LAHAT ng slots kung saan ang slot.teacherId ay ang teacher na ito.
          // Ito ay nag-e-ensure na makikita ng teacher ang LAHAT ng kanyang classes,
          // kahit na ang row owner ay ibang teacher (mula sa swap).
          
          const { rows: allSchedules } = await db.query("SELECT * FROM schedules");
          
          const mySlots = [];
          allSchedules.forEach(sched => {
            const slots = safeJsonParse(sched.slots, []);
            slots.forEach(slot => {
              // ═══ CRITICAL: Filter by slot's OWN teacherId ═══
              // Fallback sa row owner kung walang slot.teacherId (legacy data)
              const slotTeacherId = slot.teacherId != null ? slot.teacherId : sched.teacher_id;
              
              if (String(slotTeacherId) === String(targetTeacherId)) {
                mySlots.push(slot);
              }
            });
          });

          // ═══ STEP 4: Buuin ang schedule object ═══
          const scheduleObj = {
            teacher_id: targetTeacherId,
            slots: mySlots,
          };

          console.log(`✅ Teacher view: ${teacherRows[0]?.first_name} ${teacherRows[0]?.last_name} (ID: ${targetTeacherId}) — ${mySlots.length} slots`);

          return send(res, 200, { 
            schedule: scheduleObj, 
            teacher: teacherRows[0] || null 
          });
          
        } catch (err) {
          console.error("❌ Teacher schedule error:", err);
          return send(res, 500, { error: err.message });
        }
      }

            // ═══════════════════════════════════════════════════════════
      // ═══ STUDENT MANAGEMENT ENDPOINTS ═══
      // ═══════════════════════════════════════════════════════════

      // GET /api/teacher/students
      if (pathname === "/api/teacher/students" && req.method === "GET") {
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
                await db.query("UPDATE users SET teacher_id = $1 WHERE id = $2", [targetTeacherId, auth.id]);
              }
            }
          }
          if (!targetTeacherId) return send(res, 404, { error: "No teacher profile associated." });

          const { rows: allSchedules } = await db.query("SELECT * FROM schedules");
          const mySectionNames = new Set();
          
          allSchedules.forEach(sched => {
            const slots = safeJsonParse(sched.slots, []);
            slots.forEach(slot => {
              const slotTeacherId = slot.teacherId != null ? slot.teacherId : sched.teacher_id;
              if (String(slotTeacherId) === String(targetTeacherId) && slot.section) {
                mySectionNames.add(slot.section);
              }
            });
          });

          if (mySectionNames.size === 0) {
            return send(res, 200, { students: [], sections: [] });
          }

          const sectionList = Array.from(mySectionNames);
          const placeholders = sectionList.map((_, i) => `$${i + 1}`).join(",");
          
          const { rows: students } = await db.query(
            `SELECT * FROM students WHERE section_name IN (${placeholders}) ORDER BY section_name, name ASC`,
            sectionList
          );

          return send(res, 200, {
            students: students,
            sections: sectionList,
          });
        } catch (err) {
          console.error("❌ Get students error:", err);
          return send(res, 500, { error: err.message });
        }
      }

      // POST /api/teacher/students
      if (pathname === "/api/teacher/students" && req.method === "POST") {
        try {
          const body = await parseBody(req);
          const name = (body.name || "").trim();
          const sectionName = (body.section_name || "").trim();
          const studentId = (body.student_id || "").trim() || null;
          const notes = (body.notes || "").trim() || null;

          if (!name || !sectionName) {
            return send(res, 400, { error: "Student name and section are required." });
          }

          const result = await db.query(
            `INSERT INTO students (name, section_name, student_id, status, notes)
             VALUES ($1, $2, $3, 'active', $4) RETURNING *`,
            [name, sectionName, studentId, notes]
          );

          console.log(`✅ New student: ${name} → ${sectionName}`);
          return send(res, 201, { success: true, student: result.rows[0] });
        } catch (err) {
          console.error("❌ Add student error:", err);
          return send(res, 500, { error: err.message });
        }
      }

      // PUT /api/teacher/students/:id
      if (pathname.match(/^\/api\/teacher\/students\/[^/]+$/) && req.method === "PUT") {
        try {
          const studentId = pathname.split("/").pop();
          const body = await parseBody(req);

          const { rows: studentRows } = await db.query(
            "SELECT * FROM students WHERE id = $1",
            [studentId]
          );
          if (studentRows.length === 0) {
            return send(res, 404, { error: "Student not found." });
          }

          const existing = studentRows[0];
          const name = body.name !== undefined ? body.name : existing.name;
          const status = body.status !== undefined ? body.status : existing.status;
          const notes = body.notes !== undefined ? body.notes : existing.notes;
          const studentIdVal = body.student_id !== undefined ? body.student_id : existing.student_id;

          await db.query(
            `UPDATE students SET name = $1, status = $2, notes = $3, student_id = $4, updated_at = NOW() WHERE id = $5`,
            [name, status, notes, studentIdVal, studentId]
          );

          const updated = await db.query("SELECT * FROM students WHERE id = $1", [studentId]);
          console.log(`✅ Student updated: ${updated.rows[0].name} (${status})`);
          return send(res, 200, { success: true, student: updated.rows[0] });
        } catch (err) {
          console.error("❌ Update student error:", err);
          return send(res, 500, { error: err.message });
        }
      }

      // DELETE /api/teacher/students/:id
      if (pathname.match(/^\/api\/teacher\/students\/[^/]+$/) && req.method === "DELETE") {
        try {
          const studentId = pathname.split("/").pop();
          const result = await db.query("DELETE FROM students WHERE id = $1", [studentId]);
          if (result.rowCount === 0) {
            return send(res, 404, { error: "Student not found." });
          }
          console.log(`🗑️ Student deleted: ID ${studentId}`);
          return send(res, 200, { success: true });
        } catch (err) {
          console.error("❌ Delete student error:", err);
          return send(res, 500, { error: err.message });
        }
      }

      // ═══ /api/teacher/rooms (GET) ═══
      if (pathname === "/api/teacher/rooms" && req.method === "GET") {
        try {
          const { rows } = await db.query("SELECT * FROM rooms ORDER BY name ASC");
          return send(res, 200, rows.map(r => ({
            id: r.id,
            name: r.name || r.room_name || "",
            roomName: r.name || r.room_name || "",
            type: r.type || r.room_type || "General Classroom",
            roomType: r.type || r.room_type || "General Classroom",
            building: r.building || "",
            capacity: r.capacity || r.max_capacity || 0,
            maxStudents: r.capacity || r.max_capacity || 0,
          })));
        } catch (err) {
          console.error("❌ Error fetching teacher rooms:", err);
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
  if (err) console.error("❌ Supabase Connection Failed:", err.message);
  else console.log("✅ Successfully connected to Supabase PostgreSQL at:", res.rows[0].now);
});
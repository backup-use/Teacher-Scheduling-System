require("dotenv").config();
const http = require("http");
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

// ═══════════════════════════════════════════════════════
// ═══ SECURITY HEADERS & RESPONSE HELPERS             ═══
// ═══════════════════════════════════════════════════════

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
};

function send(res, status, data, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    ...SECURITY_HEADERS,
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

function safeJsonParse(input, fallback = []) {
  if (typeof input === "object" && input !== null) return input;
  if (!input || typeof input !== "string") return fallback;
  try {
    return JSON.parse(input);
  } catch {
    return fallback;
  }
}

// ═══════════════════════════════════════════════════════
// ═══ INPUT VALIDATION & SANITIZATION                 ═══
// ═══════════════════════════════════════════════════════

function sanitizeString(input, maxLength = 255) {
  if (typeof input !== "string") return "";
  return input
    .replace(/\0/g, "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim()
    .substring(0, maxLength);
}

function validateEmail(email) {
  if (typeof email !== "string") return null;
  const cleaned = email.trim().toLowerCase();
  if (cleaned.length > 254) return null;
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(cleaned)) return null;
  return cleaned;
}

function validateName(name) {
  if (typeof name !== "string") return null;
  const cleaned = name.trim();
  if (cleaned.length < 1 || cleaned.length > 100) return null;
  const nameRegex = /^[a-zA-ZÀ-ÿñÑ\s\-'.]+$/;
  if (!nameRegex.test(cleaned)) return null;
  return cleaned;
}

function validateUsername(username) {
  if (typeof username !== "string") return null;
  const cleaned = username.trim();
  if (cleaned.length < 3 || cleaned.length > 50) return null;
  const usernameRegex = /^[a-zA-Z0-9._-]+$/;
  if (!usernameRegex.test(cleaned)) return null;
  return cleaned;
}

// ═══════════════════════════════════════════════════════
// ═══ JWT & AUTHENTICATION                            ═══
// ═══════════════════════════════════════════════════════

function getAuth(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  let token = cookies["lectura_token"];

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
  }

  if (!token || token === "null" || token === "undefined") return null;
  
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    console.log("⚠️ JWT Verification failed:", err.message);
    return null;
  }
}

async function getAuthWithSessionCheck(req) {
  const decoded = getAuth(req);
  if (!decoded) return null;

  try {
    const { rows } = await db.query(
      "SELECT session_version FROM public.users WHERE id = $1",
      [decoded.id]
    );
    if (rows.length === 0) return null;

    const currentVersion = rows[0].session_version || 1;
    const tokenVersion = decoded.sessionVersion || 1;

    if (currentVersion !== tokenVersion) {
      console.log("⚠️ Session version mismatch — token invalidated");
      return null;
    }

    return decoded;
  } catch (err) {
    console.error("❌ getAuthWithSessionCheck error:", err.message);
    return null;
  }
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split("=");
    if (name) cookies[name] = decodeURIComponent(rest.join("="));
  });
  return cookies;
}

// ═══════════════════════════════════════════════════════
// ═══ RATE LIMITER                                    ═══
// ═══════════════════════════════════════════════════════

const rateLimitMap = new Map();

function rateLimit(req, res, options = {}) {
  const { windowMs = 60_000, maxRequests = 60, keyPrefix = "global" } = options;
  const ip = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const key = `${keyPrefix}:${ip}`;

  let entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + windowMs };
    rateLimitMap.set(key, entry);
  }

  entry.count++;

  if (entry.count > maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.writeHead(429, {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfter),
      ...SECURITY_HEADERS,
    });
    res.end(JSON.stringify({
      error: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
    }));
    return false;
  }

  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (entry.resetAt < now) rateLimitMap.delete(key);
  }
}, 5 * 60_000);

// ═══════════════════════════════════════════════════════
// ═══ AUDIT LOGGING                                   ═══
// ═══════════════════════════════════════════════════════

async function logAuditEvent(action, userId, ip, details = {}) {
  try {
    await db.query(
      `INSERT INTO audit_logs (action, user_id, ip_address, details, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [action, userId || null, ip || null, JSON.stringify(details)]
    );
  } catch (err) {
    console.error("⚠️ Failed to log audit event:", err.message);
  }
}

// ═══════════════════════════════════════════════════════
// ═══ FILE SERVING                                     ═══
// ═══════════════════════════════════════════════════════

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
    res.writeHead(200, {
      "Content-Type": contentType,
      ...SECURITY_HEADERS,
    });
    res.end(data);
  });
}

function sendCredentialsEmail(email, name, username, password, details) {
  console.log(`📧 [MOCK EMAIL] Sent to ${email} for ${name} (User: ${username})`);
}

// ═══════════════════════════════════════════════════════
// ═══ SCHEDULE GENERATOR (SHS legacy)                 ═══
// ═══════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════
// ═══ ADMIN INIT                                      ═══
// ═══════════════════════════════════════════════════════

async function initAdmin() {
  try {
    // ═══ 1. CREATE USERS TABLE IF IT DOESN'T EXIST ═══
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.users (
        id VARCHAR(255) PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'teacher',
        name VARCHAR(255),
        display_name VARCHAR(255),
        teacher_id VARCHAR(255),
        email VARCHAR(255),
        session_version INTEGER DEFAULT 1,
        last_password_change TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✅ Users table ready.");

    // ═══ 2. ADD MISSING COLUMNS TO USERS (safety net) ═══
    const userColumns = [
      ["created_at", "TIMESTAMP DEFAULT NOW()"],
      ["updated_at", "TIMESTAMP DEFAULT NOW()"],
      ["email", "VARCHAR(255)"],
      ["display_name", "VARCHAR(255)"],
      ["last_password_change", "TIMESTAMP"],
      ["session_version", "INTEGER DEFAULT 1"]
    ];
    for (const [col, type] of userColumns) {
      try {
        await db.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ${col} ${type};`);
      } catch (e) {
        console.log(`⚠️ Could not add column ${col}:`, e.message);
      }
    }
    console.log("✅ User columns verified.");

    // ═══ 3. TEACHERS & SECTIONS columns ═══
    try {
      await db.query("ALTER TABLE sections ADD COLUMN IF NOT EXISTS shift VARCHAR(3) DEFAULT 'AM';");
      await db.query("ALTER TABLE teachers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;");
      await db.query("ALTER TABLE teachers ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP NULL;");
      await db.query("ALTER TABLE teachers ADD COLUMN IF NOT EXISTS hidden_by VARCHAR(255) NULL;");
    } catch (e) {
      console.log("⚠️ Some teacher/section columns could not be added:", e.message);
    }

    // ═══ 4. AUDIT LOGS ═══
    await db.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        action VARCHAR(100) NOT NULL,
        user_id VARCHAR(255),
        ip_address VARCHAR(45),
        details JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);");
    await db.query("CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);");
    await db.query("CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);");
    console.log("✅ Audit logs table ready.");

    // ═══ 5. CONSENT LOGS ═══
    await db.query(`
      CREATE TABLE IF NOT EXISTS consent_logs (
        id SERIAL PRIMARY KEY,
        teacher_id VARCHAR(255) NOT NULL,
        consent_type VARCHAR(100) NOT NULL,
        consent_version VARCHAR(20) DEFAULT 'v1.0',
        consent_given_at TIMESTAMP DEFAULT NOW(),
        ip_address VARCHAR(45),
        withdrawn_at TIMESTAMP NULL
      );
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_consent_teacher ON consent_logs(teacher_id);");
    console.log("✅ Consent logs table ready.");

    // ═══ 6. USER PROFILE CHANGES ═══
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_profile_changes (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        change_type VARCHAR(50) NOT NULL,
        old_value VARCHAR(500),
        new_value VARCHAR(500),
        ip_address VARCHAR(45),
        user_agent TEXT,
        changed_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_profile_changes_user ON user_profile_changes(user_id);");
    await db.query("CREATE INDEX IF NOT EXISTS idx_profile_changes_type ON user_profile_changes(change_type);");
    await db.query("CREATE INDEX IF NOT EXISTS idx_profile_changes_date ON user_profile_changes(changed_at DESC);");
    console.log("✅ User profile changes table ready.");

    // ═══ 7. Set display_name for existing users ═══
    try {
      await db.query("UPDATE public.users SET display_name = name WHERE display_name IS NULL;");
      await db.query("UPDATE public.users SET session_version = 1 WHERE session_version IS NULL;");
    } catch (e) {
      console.log("⚠️ Could not update display_name/session_version:", e.message);
    }

    // ═══ 8. CHECK ADMIN ACCOUNT ═══
    const { rows } = await db.query(
      "SELECT id, password FROM public.users WHERE username = $1",
      [ADMIN_USERNAME]
    );

    if (rows.length === 0) {
      const adminId = "usr-" + genId();
      const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await db.query(
        `INSERT INTO public.users (id, username, password, role, name, display_name, teacher_id, email, session_version) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)`,
        [adminId, ADMIN_USERNAME, hashed, "admin", ADMIN_NAME, ADMIN_NAME, null, null]
      );
      console.log(`✅ Admin account created: ${ADMIN_USERNAME}`);
      return;
    }

    const matches = await bcrypt.compare(ADMIN_PASSWORD, rows[0].password).catch(() => false);
    if (!matches) {
      const sha = crypto.createHash("sha256").update(ADMIN_PASSWORD).digest("hex");
      const isLegacy = rows[0].password === sha;
      const newHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await db.query(
        "UPDATE public.users SET password = $1 WHERE username = $2",
        [newHash, ADMIN_USERNAME]
      );
      console.log(isLegacy ? `🔧 Migrated admin password to bcrypt.` : `🔧 Admin password healed.`);
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

// ═══════════════════════════════════════════════════════
// ═══ MAIN SERVER ROUTER                              ═══
// ═══════════════════════════════════════════════════════

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
      ...SECURITY_HEADERS,
    });
    return res.end();
  }

  if (pathname.startsWith("/api/")) {
    if (!rateLimit(req, res, { windowMs: 60_000, maxRequests: 100, keyPrefix: "api" })) {
      return;
    }

    // ═══ AUTH: LOGIN ═══
    if (pathname === "/api/auth/login" && req.method === "POST") {
      // DEV MODE: Relaxed rate limit for testing (50 attempts per 2 minutes)
      // PRODUCTION MODE: Uncomment the second line and comment out the first
      const loginLimitOptions = { windowMs: 2 * 60_000, maxRequests: 50, keyPrefix: "login" };
      // const loginLimitOptions = { windowMs: 15 * 60_000, maxRequests: 5, keyPrefix: "login" }; // Strict production
      
      if (!rateLimit(req, res, loginLimitOptions)) {
        return;
      }
      try {
        const body = await parseBody(req);
        const username = sanitizeString(body.username, 100);
        const password = typeof body.password === "string" ? body.password : "";

        if (!username || !password) {
          return send(res, 400, { error: "Username and password required." });
        }

        const { rows } = await db.query(
          "SELECT id, username, role, name, display_name, teacher_id, password, session_version FROM public.users WHERE username = $1",
          [username]
        );

        if (rows.length === 0) {
          await logAuditEvent("login_failed", null, req.socket.remoteAddress, { username, reason: "user_not_found" });
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
            await db.query("UPDATE public.users SET password = $1 WHERE id = $2", [newHash, user.id]);
          }
        }

        if (!valid) {
          await logAuditEvent("login_failed", null, req.socket.remoteAddress, { username, reason: "invalid_password" });
          return send(res, 401, { error: "Invalid credentials." });
        }

        const token = jwt.sign(
          {
            id: user.id,
            username: user.username,
            role: user.role,
            teacherId: user.teacher_id,
            sessionVersion: user.session_version || 1,
          },
          JWT_SECRET,
          { expiresIn: "8h" }
        );

        await logAuditEvent("login_success", user.id, req.socket.remoteAddress, { role: user.role });

        const cookieOptions = [
          `lectura_token=${token}`,
          "HttpOnly",
          "SameSite=Strict",
          "Path=/",
          "Max-Age=28800",
        ];
        if (process.env.NODE_ENV === "production") {
          cookieOptions.push("Secure");
        }

        return send(
          res,
          200,
          {
            token,
            user: {
              id: user.id,
              username: user.username,
              role: user.role,
              name: user.display_name || user.name,
              teacher_id: user.teacher_id,
            },
          },
          { "Set-Cookie": cookieOptions.join("; ") }
        );
      } catch (err) {
        return send(res, 500, { error: "Login failed." });
      }
    }

    // ── ADMIN PROTECTED ROUTES ──
    if (pathname.startsWith("/api/admin/")) {
      const auth = await getAuthWithSessionCheck(req);
      if (!auth || auth.role !== "admin") {
        await logAuditEvent("unauthorized_access", null, req.socket.remoteAddress, { path: pathname });
        return send(res, 403, { error: "Forbidden: Admin privileges required." });
      }

      // ═══ GET /api/admin/profile ═══
      if (pathname === "/api/admin/profile" && req.method === "GET") {
        try {
          const { rows } = await db.query(
            "SELECT * FROM public.users WHERE id = $1",
            [auth.id]
          );
          
          if (rows.length === 0) {
            return send(res, 404, { error: "Profile not found." });
          }

          const profile = rows[0];

          return send(res, 200, {
            id: profile.id || "",
            username: profile.username || "admin",
            name: profile.name || "Administrator",
            displayName: profile.display_name || profile.name || "Administrator",
            email: profile.email || "",
            role: profile.role || "admin",
            createdAt: profile.created_at || new Date().toISOString(),
            updatedAt: profile.updated_at || new Date().toISOString(),
            lastPasswordChange: profile.last_password_change || null,
          });
        } catch (err) {
          console.error("❌ Get profile error:", err.message);
          console.error("Stack:", err.stack);
          return send(res, 500, { error: "Failed to load profile: " + err.message });
        }
      }

      // ═══ PUT /api/admin/profile (display name + email) ═══
      if (pathname === "/api/admin/profile" && req.method === "PUT") {
        if (!rateLimit(req, res, { windowMs: 60_000, maxRequests: 10, keyPrefix: "profile-update" })) return;
        try {
          const body = await parseBody(req);
          const displayName = sanitizeString(body.displayName || body.name, 100);
          const email = body.email ? validateEmail(body.email) : null;

          if (!displayName) {
            return send(res, 400, { error: "Display name is required." });
          }

          const { rows } = await db.query("SELECT * FROM public.users WHERE id = $1", [auth.id]);
          if (rows.length === 0) return send(res, 404, { error: "Profile not found." });
          const existing = rows[0];

          await db.query(
            `UPDATE public.users 
             SET name = $1, display_name = $2, email = $3, updated_at = NOW()
             WHERE id = $4`,
            [displayName, displayName, email || existing.email, auth.id]
          );

          if (displayName !== (existing.display_name || existing.name)) {
            await db.query(
              `INSERT INTO user_profile_changes (user_id, change_type, old_value, new_value, ip_address, user_agent)
               VALUES ($1, 'display_name', $2, $3, $4, $5)`,
              [auth.id, existing.display_name || existing.name, displayName, req.socket.remoteAddress, req.headers["user-agent"] || ""]
            );
          }
          if (email && email !== existing.email) {
            await db.query(
              `INSERT INTO user_profile_changes (user_id, change_type, old_value, new_value, ip_address, user_agent)
               VALUES ($1, 'email', $2, $3, $4, $5)`,
              [auth.id, existing.email || "", email, req.socket.remoteAddress, req.headers["user-agent"] || ""]
            );
          }

          await logAuditEvent("update_profile", auth.id, req.socket.remoteAddress, {
            displayName,
            emailChanged: !!(email && email !== existing.email),
          });

          const updated = await db.query(
            "SELECT * FROM public.users WHERE id = $1",
            [auth.id]
          );

          const profile = updated.rows[0];
          return send(res, 200, {
            success: true,
            profile: {
              id: profile.id,
              username: profile.username,
              name: profile.name,
              displayName: profile.display_name || profile.name,
              email: profile.email || "",
              role: profile.role,
              createdAt: profile.created_at || new Date().toISOString(),
              updatedAt: profile.updated_at || new Date().toISOString(),
              lastPasswordChange: profile.last_password_change || null,
            },
          });
        } catch (err) {
          console.error("❌ Update profile error:", err.message);
          return send(res, 500, { error: "Failed to update profile: " + err.message });
        }
      }

      // ═══ PUT /api/admin/profile/username ═══
      if (pathname === "/api/admin/profile/username" && req.method === "PUT") {
        if (!rateLimit(req, res, { windowMs: 60 * 60_000, maxRequests: 3, keyPrefix: "change-username" })) return;
        try {
          const body = await parseBody(req);
          const newUsername = validateUsername(body.newUsername);
          const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";

          if (!newUsername) {
            return send(res, 400, { error: "Invalid username. Use 3-50 characters (letters, numbers, dots, dashes, underscores)." });
          }
          if (!currentPassword) {
            return send(res, 400, { error: "Current password is required." });
          }

          const { rows } = await db.query("SELECT * FROM public.users WHERE id = $1", [auth.id]);
          if (rows.length === 0) return send(res, 404, { error: "Profile not found." });
          const existing = rows[0];

          const passwordValid = await bcrypt.compare(currentPassword, existing.password);
          if (!passwordValid) {
            await logAuditEvent("change_username_failed", auth.id, req.socket.remoteAddress, { reason: "invalid_password" });
            return send(res, 401, { error: "Current password is incorrect." });
          }

          if (newUsername.toLowerCase() !== existing.username.toLowerCase()) {
            const usernameCheck = await db.query(
              "SELECT id FROM public.users WHERE LOWER(username) = LOWER($1) AND id != $2",
              [newUsername, auth.id]
            );
            if (usernameCheck.rows.length > 0) {
              return send(res, 400, { error: "Username is already taken." });
            }
          }

          await db.query(
            `UPDATE public.users SET username = $1, updated_at = NOW() WHERE id = $2`,
            [newUsername, auth.id]
          );

          await db.query(
            `INSERT INTO user_profile_changes (user_id, change_type, old_value, new_value, ip_address, user_agent)
             VALUES ($1, 'username', $2, $3, $4, $5)`,
            [auth.id, existing.username, newUsername, req.socket.remoteAddress, req.headers["user-agent"] || ""]
          );

          await logAuditEvent("change_username", auth.id, req.socket.remoteAddress, {
            oldUsername: existing.username,
            newUsername,
          });

          return send(res, 200, {
            success: true,
            message: "Username updated successfully. Please use your new username next time you log in.",
            username: newUsername,
          });
        } catch (err) {
          console.error("❌ Change username error:", err.message);
          return send(res, 500, { error: "Failed to change username: " + err.message });
        }
      }

      // ═══ PUT /api/admin/profile/password ═══
      if (pathname === "/api/admin/profile/password" && req.method === "PUT") {
        if (!rateLimit(req, res, { windowMs: 60 * 60_000, maxRequests: 5, keyPrefix: "change-password" })) return;
        try {
          const body = await parseBody(req);
          const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
          const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

          if (!currentPassword || !newPassword) {
            return send(res, 400, { error: "Current password and new password are required." });
          }

          if (newPassword.length < 8) {
            return send(res, 400, { error: "Password must be at least 8 characters." });
          }
          if (!/[A-Z]/.test(newPassword)) {
            return send(res, 400, { error: "Password must contain at least one uppercase letter." });
          }
          if (!/[a-z]/.test(newPassword)) {
            return send(res, 400, { error: "Password must contain at least one lowercase letter." });
          }
          if (!/[0-9]/.test(newPassword)) {
            return send(res, 400, { error: "Password must contain at least one number." });
          }

          const { rows } = await db.query("SELECT * FROM public.users WHERE id = $1", [auth.id]);
          if (rows.length === 0) return send(res, 404, { error: "Profile not found." });
          const existing = rows[0];

          const passwordValid = await bcrypt.compare(currentPassword, existing.password);
          if (!passwordValid) {
            await logAuditEvent("change_password_failed", auth.id, req.socket.remoteAddress, { reason: "invalid_password" });
            return send(res, 401, { error: "Current password is incorrect." });
          }

          const samePassword = await bcrypt.compare(newPassword, existing.password);
          if (samePassword) {
            return send(res, 400, { error: "New password must be different from current password." });
          }

          const newHashedPassword = await bcrypt.hash(newPassword, 10);

          await db.query(
            `UPDATE public.users 
             SET password = $1, 
                 last_password_change = NOW(), 
                 updated_at = NOW(),
                 session_version = COALESCE(session_version, 1) + 1
             WHERE id = $2`,
            [newHashedPassword, auth.id]
          );

          await db.query(
            `INSERT INTO user_profile_changes (user_id, change_type, old_value, new_value, ip_address, user_agent)
             VALUES ($1, 'password', '***', '***', $2, $3)`,
            [auth.id, req.socket.remoteAddress, req.headers["user-agent"] || ""]
          );

          await logAuditEvent("change_password", auth.id, req.socket.remoteAddress, {
            sessionVersionIncremented: true,
          });

          return send(res, 200, {
            success: true,
            message: "Password changed successfully. All other sessions have been logged out for security.",
          });
        } catch (err) {
          console.error("❌ Change password error:", err.message);
          return send(res, 500, { error: "Failed to change password: " + err.message });
        }
      }

      // ═══ GET /api/admin/profile/history ═══
      if (pathname === "/api/admin/profile/history" && req.method === "GET") {
        try {
          const { rows } = await db.query(
            `SELECT id, change_type, old_value, new_value, ip_address, changed_at
             FROM user_profile_changes 
             WHERE user_id = $1
             ORDER BY changed_at DESC
             LIMIT 50`,
            [auth.id]
          );
          return send(res, 200, { history: rows });
        } catch (err) {
          console.error("❌ Get profile history error:", err.message);
          return send(res, 500, { error: "Failed to load history." });
        }
      }

      // ═══ POST /api/admin/generate-jhs-master ═══
      if (pathname === "/api/admin/generate-jhs-master" && req.method === "POST") {
        if (!rateLimit(req, res, { windowMs: 30 * 60_000, maxRequests: 5, keyPrefix: "gen-jhs" })) {
          return;
        }
        try {
          const body = await parseBody(req);
          const result = await generateJHSMaster(body);
          await logAuditEvent("generate_jhs_master", auth.id, req.socket.remoteAddress, {
            sections: result.sectionsProcessed,
            teachers: result.teachersUpdated,
          });
          console.log(`✅ JHS master saved: ${result.sectionsProcessed} sections, ${result.teachersUpdated} teachers`);
          return send(res, 200, { success: true, ...result });
        } catch (err) {
          console.error("❌ JHS generation failed:", err);
          return send(res, 500, { error: err.message });
        }
      }

      // ═══ SUBJECTS ═══
      if (pathname === "/api/admin/subjects" && req.method === "GET") {
        try {
          const { rows } = await db.query("SELECT * FROM subjects ORDER BY id DESC");
          return send(res, 200, rows.map(s => ({
            id: s.id,
            name: sanitizeString(s.name, 100),
            gradeLevel: sanitizeString(s.grade_level, 100),
          })));
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      if (pathname === "/api/admin/subjects" && req.method === "POST") {
        try {
          const body = await parseBody(req);
          const name = sanitizeString(body.name || body.subjectName, 100);
          const gradeLevel = sanitizeString(body.gradeLevel || body.grade_level, 100);
          if (!name) return send(res, 400, { error: "Subject Name is required." });

          const existing = await db.query(
            "SELECT id FROM subjects WHERE LOWER(TRIM(name)) = LOWER($1)",
            [name]
          );
          if (existing.rows.length > 0) return send(res, 400, { error: "This subject already exists." });

          const resInsert = await db.query(
            "INSERT INTO subjects (name, grade_level) VALUES ($1, $2) RETURNING *",
            [name, gradeLevel]
          );

          await logAuditEvent("create_subject", auth.id, req.socket.remoteAddress, { name, gradeLevel });

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

      if (pathname.startsWith("/api/admin/subjects/") && req.method === "DELETE") {
        try {
          const subjectId = pathname.split("/").pop();
          const result = await db.query("DELETE FROM subjects WHERE id = $1", [subjectId]);
          if (result.rowCount === 0) return send(res, 404, { error: "Subject not found." });
          await logAuditEvent("delete_subject", auth.id, req.socket.remoteAddress, { subjectId });
          return send(res, 200, { success: true });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      // ═══ SECTIONS ═══
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

      if (pathname === "/api/admin/sections" && req.method === "POST") {
        try {
          const body = await parseBody(req);
          const sectionName = sanitizeString(body.sectionName || body.name, 100);
          const gradeLevel = sanitizeString(body.gradeLevel || body.grade, 100);
          const roomIdRaw = body.assignedRoom || body.room_id || body.roomId || null;
          const students = body.students !== undefined ? Math.max(0, parseInt(body.students, 10) || 0) : 0;
          const shift = String(body.shift || "AM").toUpperCase();

          if (!sectionName) return send(res, 400, { error: "Section Name is required." });

          const roomId = roomIdRaw && !isNaN(parseInt(roomIdRaw, 10)) ? parseInt(roomIdRaw, 10) : null;

          const existing = await db.query(
            "SELECT id FROM sections WHERE LOWER(TRIM(name)) = LOWER($1)",
            [sectionName]
          );
          if (existing.rows.length > 0) return send(res, 400, { error: "This section already exists." });

          await db.query(
            "INSERT INTO sections (name, students, grade_level, room_id, shift) VALUES ($1, $2, $3, $4, $5)",
            [sectionName, students, gradeLevel, roomId, shift]
          );

          await logAuditEvent("create_section", auth.id, req.socket.remoteAddress, { sectionName, gradeLevel });

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

      if (pathname.startsWith("/api/admin/sections/") && req.method === "DELETE") {
        try {
          const sectionId = pathname.split("/").pop();
          const result = await db.query("DELETE FROM sections WHERE id = $1", [sectionId]);
          if (result.rowCount === 0) return send(res, 404, { error: "Section not found." });
          await logAuditEvent("delete_section", auth.id, req.socket.remoteAddress, { sectionId });
          return send(res, 200, { success: true });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      // ═══ ROOMS ═══
      if (pathname === "/api/admin/rooms" && req.method === "GET") {
        try {
          const { rows } = await db.query("SELECT * FROM rooms ORDER BY id DESC");
          return send(res, 200, rows.map(r => ({
            id: r.id,
            name: r.name || r.room_name || "",
            capacity: r.capacity || r.max_capacity || 0,
          })));
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      if (pathname === "/api/admin/rooms" && req.method === "POST") {
        try {
          const body = await parseBody(req);
          const roomName = sanitizeString(body.name || body.roomName, 100);
          const capacity = body.capacity !== undefined ? parseInt(body.capacity, 10) : parseInt(body.maxCapacity, 10);
          if (!roomName || isNaN(capacity) || capacity < 0) {
            return send(res, 400, { error: "Valid Room Name and Capacity are required." });
          }

          const existing = await db.query(
            "SELECT id FROM rooms WHERE LOWER(TRIM(name)) = LOWER($1)",
            [roomName]
          );
          if (existing.rows.length > 0) return send(res, 400, { error: "This room already exists." });

          const resInsert = await db.query(
            "INSERT INTO rooms (name, capacity) VALUES ($1, $2) RETURNING *",
            [roomName, capacity]
          );

          await logAuditEvent("create_room", auth.id, req.socket.remoteAddress, { roomName, capacity });

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

      if (pathname.startsWith("/api/admin/rooms/") && req.method === "DELETE") {
        try {
          const roomId = pathname.split("/").pop();
          const result = await db.query("DELETE FROM rooms WHERE id = $1", [roomId]);
          if (result.rowCount === 0) return send(res, 404, { error: "Room not found." });
          await logAuditEvent("delete_room", auth.id, req.socket.remoteAddress, { roomId });
          return send(res, 200, { success: true });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      // ═══ TEACHERS ═══
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

      if (pathname === "/api/admin/teachers/hidden-count" && req.method === "GET") {
        try {
          const { rows } = await db.query("SELECT COUNT(*) as count FROM teachers WHERE is_active = FALSE");
          return send(res, 200, { count: parseInt(rows[0].count, 10) });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      if (pathname.match(/^\/api\/admin\/teachers\/[^/]+$/) && req.method === "GET") {
        try {
          const id = pathname.split("/").pop();
          const { rows } = await db.query("SELECT * FROM teachers WHERE id = $1", [id]);
          if (rows.length === 0) return send(res, 404, { error: "Teacher not found" });
          const t = rows[0];
          return send(res, 200, {
            ...t,
            firstName: t.first_name,
            lastName: t.last_name,
            targetGrade: t.target_grade,
            is_active: t.is_active !== false,
            workDays: safeJsonParse(t.work_days, []),
            subjects: safeJsonParse(t.subjects, []),
            availability: safeJsonParse(t.availability, []),
            startTime: t.start_time,
            endTime: t.end_time,
          });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      if (pathname === "/api/admin/teachers" && req.method === "POST") {
        if (!rateLimit(req, res, { windowMs: 60 * 60_000, maxRequests: 10, keyPrefix: "teacher-create" })) {
          return;
        }
        try {
          const body = await parseBody(req);
          const firstName = validateName(body.firstName);
          const lastName = validateName(body.lastName);
          const email = validateEmail(body.email);

          if (!firstName) return send(res, 400, { error: "Invalid first name." });
          if (!lastName) return send(res, 400, { error: "Invalid last name." });
          if (!email) return send(res, 400, { error: "Invalid email address." });

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
            const existingUser = await db.query("SELECT id FROM public.users WHERE username = $1", [username]);
            if (existingUser.rows.length === 0) break;
            username = `${baseUsername}${Math.floor(100 + Math.random() * 900)}`;
          }

          const password = "teacher" + Math.floor(1000 + Math.random() * 9000);
          const employeeId = "EMP-" + Math.floor(1000 + Math.random() * 9000);

          const rawSubjects = Array.isArray(body.subjects) ? body.subjects : [body.subjects].filter(Boolean);
          const subjectsJSON = JSON.stringify(rawSubjects.map(s => sanitizeString(s, 100)).filter(Boolean));
          const workDaysJSON = JSON.stringify(Array.isArray(body.workDays) ? body.workDays : []);
          const targetGrade = sanitizeString(body.targetGrade || body.target_grade, 50);

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
          const formattedAvailability = availabilityArray.map(item => ({
            day: sanitizeString(item.day, 20) || "Monday",
            from: sanitizeTime(item.from),
            to: sanitizeTime(item.to),
          }));

          const teacherResult = await db.query(
            `INSERT INTO teachers (
              first_name, last_name, email, subjects, target_grade,
              work_days, start_time, end_time, availability, employee_id, is_active, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, NOW()) RETURNING *`,
            [
              firstName, lastName, email,
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
            "INSERT INTO public.users (id, username, password, role, name, display_name, teacher_id, email, session_version) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)",
            [userId, username, hashedPassword, "teacher", `${firstName} ${lastName}`, `${firstName} ${lastName}`, teacherIdStr, email]
          );

          await logAuditEvent("create_teacher", auth.id, req.socket.remoteAddress, {
            teacherId: teacherIdStr,
            name: `${firstName} ${lastName}`,
          });

          try {
            await db.query(
              `INSERT INTO consent_logs (
                teacher_id, consent_type, consent_version, consent_given_at, ip_address
              ) VALUES ($1, $2, $3, NOW(), $4)`,
              [teacherIdStr, "account_creation", "v1.0", req.socket.remoteAddress || "unknown"]
            );
          } catch (consentErr) {
            console.error("⚠️ Consent logging failed:", consentErr.message);
          }

          if (email && email.includes("@")) {
            sendCredentialsEmail(email, `${firstName} ${lastName}`, username, password, {});
          }

          return send(res, 201, {
            success: true,
            teacher: newTeacher,
            credentials: { username, password },
            schedule: { teacherId: newTeacher.id, slots: [] },
          });
        } catch (err) {
          console.error("❌ Teacher registration error:", err);
          return send(res, 500, { error: "Failed to create teacher account." });
        }
      }

      if (pathname.match(/^\/api\/admin\/teachers\/[^/]+$/) && req.method === "PUT") {
        try {
          const id = pathname.split("/").pop();
          const body = await parseBody(req);
          const { rows } = await db.query("SELECT * FROM teachers WHERE id = $1", [id]);
          if (rows.length === 0) return send(res, 404, { error: "Teacher not found" });

          const existing = rows[0];
          const firstName = validateName(body.firstName || body.first_name || existing.first_name) || existing.first_name;
          const lastName = validateName(body.lastName || body.last_name || existing.last_name) || existing.last_name;
          const email = validateEmail(body.email || existing.email) || existing.email;
          const targetGrade = sanitizeString(body.targetGrade || body.target_grade || existing.target_grade, 50);
          const startTime = sanitizeString(body.startTime || body.start_time || existing.start_time, 10);
          const endTime = sanitizeString(body.endTime || body.end_time || existing.end_time, 10);

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

          await logAuditEvent("update_teacher", auth.id, req.socket.remoteAddress, { teacherId: id });

          const updatedResult = await db.query("SELECT * FROM teachers WHERE id = $1", [id]);
          return send(res, 200, { success: true, teacher: updatedResult.rows[0] });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

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

          await logAuditEvent("hide_teacher", auth.id, req.socket.remoteAddress, { teacherId });

          return send(res, 200, { success: true, message: "Teacher hidden successfully." });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

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

          await logAuditEvent("unhide_teacher", auth.id, req.socket.remoteAddress, { teacherId });

          return send(res, 200, { success: true, message: "Teacher restored successfully." });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      if (pathname.match(/^\/api\/admin\/teachers\/[^/]+$/) && req.method === "DELETE") {
        try {
          const id = pathname.split("/").pop();
          await db.query("DELETE FROM teachers WHERE id = $1", [id]);
          await db.query("DELETE FROM public.users WHERE teacher_id = $1 OR id = $1", [String(id)]);
          await db.query("DELETE FROM schedules WHERE teacher_id = $1", [String(id)]);

          await logAuditEvent("delete_teacher", auth.id, req.socket.remoteAddress, { teacherId: id });

          return send(res, 200, { success: true });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      // ═══ SCHEDULES ═══
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

          await logAuditEvent("save_master_schedule", auth.id, req.socket.remoteAddress, {
            teachersUpdated: Object.keys(slotsByTeacher).length,
            slotsSaved: matchedSlots,
          });

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

      if (pathname === "/api/admin/schedules/swap" && req.method === "POST") {
        if (!rateLimit(req, res, { windowMs: 60_000, maxRequests: 30, keyPrefix: "swap" })) {
          return;
        }
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

            await logAuditEvent("move_slot", auth.id, req.socket.remoteAddress, {
              slotId: cellA.slotId,
              to: `${cellA.targetDay} ${cellA.targetStartTime}`,
            });

            return send(res, 200, {
              success: true,
              mode: "move",
              message: "Moved successfully.",
            });
          }

          if (!cellB.slotId || !cellB.teacherId) {
            return send(res, 400, { error: "cellB.slotId and cellB.teacherId are required." });
          }

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

          const contentA = { ...locA.slots[locA.slotIndex] };
          const contentB = { ...locB.slots[locB.slotIndex] };

          const trueTeacherAId = contentA.teacherId || locA.rowOwnerId;
          const trueTeacherBId = contentB.teacherId || locB.rowOwnerId;

          const trueTeacherAName = await getTeacherName(trueTeacherAId);
          const trueTeacherBName = await getTeacherName(trueTeacherBId);

          const newSlotA = {
            id: contentA.id,
            day: contentA.day,
            startTime: contentA.startTime,
            endTime: contentA.endTime,
            section: contentA.section,
            gradeLevel: contentB.gradeLevel || contentA.gradeLevel,
            status: "scheduled",
            subject: contentB.subject,
            room: contentB.room,
            teacherId: parseInt(trueTeacherBId, 10),
            teacherName: trueTeacherBName,
          };

          const newSlotB = {
            id: contentB.id,
            day: contentB.day,
            startTime: contentB.startTime,
            endTime: contentB.endTime,
            section: contentB.section,
            gradeLevel: contentA.gradeLevel || contentB.gradeLevel,
            status: "scheduled",
            subject: contentA.subject,
            room: contentA.room,
            teacherId: parseInt(trueTeacherAId, 10),
            teacherName: trueTeacherAName,
          };

          const { rows: freshSchedules } = await db.query("SELECT * FROM schedules");

          const slotsByTeacher = {};
          freshSchedules.forEach(s => {
            slotsByTeacher[String(s.teacher_id)] = safeJsonParse(s.slots, []);
          });

          Object.keys(slotsByTeacher).forEach(tid => {
            slotsByTeacher[tid] = slotsByTeacher[tid].filter(
              s => String(s.id) !== String(contentA.id) && String(s.id) !== String(contentB.id)
            );
          });

          const ownerA = String(trueTeacherBId);
          const ownerB = String(trueTeacherAId);

          if (!slotsByTeacher[ownerA]) slotsByTeacher[ownerA] = [];
          if (!slotsByTeacher[ownerB]) slotsByTeacher[ownerB] = [];

          slotsByTeacher[ownerA].push(newSlotA);
          slotsByTeacher[ownerB].push(newSlotB);

          const teachersToUpdate = new Set([ownerA, ownerB, String(locA.rowOwnerId), String(locB.rowOwnerId)]);

          for (const tid of teachersToUpdate) {
            const slots = slotsByTeacher[tid] || [];
            await db.query(
              "UPDATE schedules SET slots = $1, generated_at = NOW() WHERE teacher_id = $2",
              [JSON.stringify(slots), tid]
            );
          }

          await logAuditEvent("swap_slots", auth.id, req.socket.remoteAddress, {
            slotA: cellA.slotId,
            slotB: cellB.slotId,
          });

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

    // ═══ Global Timetable ═══
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

    // ═══ TEACHER-ONLY ROUTES ═══
    if (pathname.startsWith("/api/teacher/")) {
      const auth = getAuth(req);
      if (!auth || auth.role !== "teacher") return send(res, 403, { error: "Forbidden" });

      if (pathname === "/api/teacher/schedule" && req.method === "GET") {
        try {
          let targetTeacherId = null;
          const { rows: userRows } = await db.query(
            "SELECT id, name, teacher_id FROM public.users WHERE id = $1",
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
                await db.query("UPDATE public.users SET teacher_id = $1 WHERE id = $2", [targetTeacherId, auth.id]);
              }
            }
          }

          if (!targetTeacherId) {
            return send(res, 404, { error: "No teacher profile associated." });
          }

          const { rows: teacherRows } = await db.query(
            "SELECT * FROM teachers WHERE id = $1",
            [targetTeacherId]
          );

          const { rows: allSchedules } = await db.query("SELECT * FROM schedules");

          const mySlots = [];
          allSchedules.forEach(sched => {
            const slots = safeJsonParse(sched.slots, []);
            slots.forEach(slot => {
              const slotTeacherId = slot.teacherId != null ? slot.teacherId : sched.teacher_id;
              if (String(slotTeacherId) === String(targetTeacherId)) {
                mySlots.push(slot);
              }
            });
          });

          const scheduleObj = {
            teacher_id: targetTeacherId,
            slots: mySlots,
          };

          return send(res, 200, {
            schedule: scheduleObj,
            teacher: teacherRows[0] || null,
          });
        } catch (err) {
          console.error("❌ Teacher schedule error:", err);
          return send(res, 500, { error: err.message });
        }
      }

      if (pathname === "/api/teacher/students" && req.method === "GET") {
        try {
          let targetTeacherId = null;
          const { rows: userRows } = await db.query(
            "SELECT id, name, teacher_id FROM public.users WHERE id = $1",
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
                await db.query("UPDATE public.users SET teacher_id = $1 WHERE id = $2", [targetTeacherId, auth.id]);
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

      if (pathname === "/api/teacher/students" && req.method === "POST") {
        if (!rateLimit(req, res, { windowMs: 60_000, maxRequests: 20, keyPrefix: "student-create" })) {
          return;
        }
        try {
          const body = await parseBody(req);
          const name = sanitizeString(body.name, 100);
          const sectionName = sanitizeString(body.section_name, 100);
          const studentId = sanitizeString(body.student_id, 50) || null;
          const notes = sanitizeString(body.notes, 500) || null;

          if (!name || !sectionName) {
            return send(res, 400, { error: "Student name and section are required." });
          }

          const result = await db.query(
            `INSERT INTO students (name, section_name, student_id, status, notes)
             VALUES ($1, $2, $3, 'active', $4) RETURNING *`,
            [name, sectionName, studentId, notes]
          );

          return send(res, 201, { success: true, student: result.rows[0] });
        } catch (err) {
          console.error("❌ Add student error:", err);
          return send(res, 500, { error: err.message });
        }
      }

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
          const name = body.name !== undefined ? sanitizeString(body.name, 100) : existing.name;
          const status = body.status !== undefined ? sanitizeString(body.status, 20) : existing.status;
          const notes = body.notes !== undefined ? sanitizeString(body.notes, 500) : existing.notes;
          const studentIdVal = body.student_id !== undefined ? sanitizeString(body.student_id, 50) : existing.student_id;

          await db.query(
            `UPDATE students SET name = $1, status = $2, notes = $3, student_id = $4, updated_at = NOW() WHERE id = $5`,
            [name, status, notes, studentIdVal, studentId]
          );

          const updated = await db.query("SELECT * FROM students WHERE id = $1", [studentId]);
          return send(res, 200, { success: true, student: updated.rows[0] });
        } catch (err) {
          console.error("❌ Update student error:", err);
          return send(res, 500, { error: err.message });
        }
      }

      if (pathname.match(/^\/api\/teacher\/students\/[^/]+$/) && req.method === "DELETE") {
        try {
          const studentId = pathname.split("/").pop();
          const result = await db.query("DELETE FROM students WHERE id = $1", [studentId]);
          if (result.rowCount === 0) {
            return send(res, 404, { error: "Student not found." });
          }
          return send(res, 200, { success: true });
        } catch (err) {
          console.error("❌ Delete student error:", err);
          return send(res, 500, { error: err.message });
        }
      }

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

  // ═══ STATIC FILES ROUTER ═══
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

server.listen(PORT, "0.0.0.0", () => {
  // ✅ Print URL IMMEDIATELY so you always see it, even if DB is slow
  console.log(`\n${"═".repeat(60)}`);
  console.log(`🚀  Lectura Scheduler is running!`);
  console.log(`${"═".repeat(60)}`);
  console.log(`🌐  Open this URL in your browser:`);
  console.log(`    👉  http://localhost:${PORT}`);
  console.log(`\n🔐  Admin Login:`);
  console.log(`    Username: ${ADMIN_USERNAME}`);
  console.log(`${"═".repeat(60)}\n`);

  // ✅ Then run DB initialization AFTER printing the URL
  initAdmin().catch((err) => {
    console.error("❌ initAdmin failed:", err.message);
  });
});

// ═══ Startup DB ping (for logging only) ═══
db.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("❌ Supabase Connection Failed:", err.message);
  } else {
    console.log("✅ Successfully connected to Supabase PostgreSQL at:", res.rows[0].now);
  }
});
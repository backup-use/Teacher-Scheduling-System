require("dotenv").config();
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const db = require("./db");

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || null;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || null;
const ADMIN_NAME = process.env.ADMIN_NAME || "System Administrator";
const MASTER_KEY = process.env.MASTER_KEY;
const DEBUG = process.env.DEBUG === "true";
const dlog = (...args) => { if (DEBUG) console.log(...args); };

const REQUIRED_ENV = ["JWT_SECRET", "MASTER_KEY"];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`[FATAL] Missing required environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}
if (JWT_SECRET.length < 32) {
  console.error("[FATAL] JWT_SECRET must be at least 32 characters long.");
  process.exit(1);
}

// ── Security headers & response helpers ──
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
      } catch {
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

// ── Input validation & sanitization ──
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

// ── User-agent parser (for device labels in activity log) ──
function parseUserAgentServer(ua) {
  if (!ua) return "Unknown Device";
  if (/Edg\//.test(ua))     return "Edge";
  if (/Chrome\//.test(ua))  return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua))  return "Safari";
  return "Unknown Browser";
}

// ── Name matching helper (for schedule lookup) ──
function normalizeTeacherName(name) {
  if (!name) return "";
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Mail transport ──
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendCredentialsEmail({ to, name, username, password }) {
  const loginUrl = `${process.env.APP_URL || "http://localhost:3000"}/auth/login.html`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">
      <h2 style="color: #111827;">Your MIS Scheduler account</h2>
      <p>Hi ${name},</p>
      <p>An administrator created an account for you. Use the credentials below to sign in:</p>
      <table style="border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 6px 12px; background: #f3f4f6;"><strong>Username</strong></td>
          <td style="padding: 6px 12px;">${username}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px; background: #f3f4f6;"><strong>Password</strong></td>
          <td style="padding: 6px 12px;">${password}</td>
        </tr>
      </table>
      <p>
        <a href="${loginUrl}"
           style="display:inline-block; padding:10px 20px; background:#2563eb; color:#fff;
                  text-decoration:none; border-radius:6px;">
          Sign in
        </a>
      </p>
      <p style="color:#6b7280; font-size: 13px;">
        For your security, please change this password after your first login.
      </p>
    </div>
  `;

  const text =
    `Hi ${name},\n\n` +
    `Your MIS Scheduler account:\n` +
    `Username: ${username}\n` +
    `Password: ${password}\n\n` +
    `Sign in: ${loginUrl}\n\n` +
    `Please change your password after first login.`;

  await mailer.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: "Your MIS Scheduler account",
    text,
    html,
  });
}

// ── JWT & authentication ──
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split("=");
    if (name) cookies[name] = decodeURIComponent(rest.join("="));
  });
  return cookies;
}

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
  } catch {
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

    if (currentVersion !== tokenVersion) return null;
    return decoded;
  } catch (err) {
    console.error("[auth] session check failed:", err.message);
    return null;
  }
}

// ── Rate limiter ──
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

// ── Audit logging ──
async function logAuditEvent(action, userId, ip, details = {}) {
  try {
    await db.query(
      `INSERT INTO audit_logs (action, user_id, ip_address, details, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [action, userId || null, ip || null, JSON.stringify(details)]
    );
  } catch (err) {
    console.error("[audit] failed to log event:", err.message);
  }
}

// ── File serving ──
const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
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

// ── Admin initialization ──
async function initAdmin() {
  try {
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
    dlog("[init] users table ready");

    const userColumns = [
      ["created_at", "TIMESTAMP DEFAULT NOW()"],
      ["updated_at", "TIMESTAMP DEFAULT NOW()"],
      ["email", "VARCHAR(255)"],
      ["display_name", "VARCHAR(255)"],
      ["last_password_change", "TIMESTAMP"],
      ["session_version", "INTEGER DEFAULT 1"],
    ];
    for (const [col, type] of userColumns) {
      try {
        await db.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ${col} ${type};`);
      } catch (err) {
        console.warn(`[init] could not add users column ${col}:`, err.message);
      }
    }
    dlog("[init] user columns verified");

    try {
      await db.query("ALTER TABLE sections ADD COLUMN IF NOT EXISTS shift VARCHAR(3) DEFAULT 'AM';");
      await db.query("ALTER TABLE teachers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;");
      await db.query("ALTER TABLE teachers ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP NULL;");
      await db.query("ALTER TABLE teachers ADD COLUMN IF NOT EXISTS hidden_by VARCHAR(255) NULL;");
    } catch (err) {
      console.warn("[init] could not add teacher/section columns:", err.message);
    }

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
    dlog("[init] audit_logs table ready");

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
    dlog("[init] user_profile_changes table ready");

    try {
      await db.query("UPDATE public.users SET display_name = name WHERE display_name IS NULL;");
      await db.query("UPDATE public.users SET session_version = 1 WHERE session_version IS NULL;");
    } catch (err) {
      console.warn("[init] could not backfill display_name/session_version:", err.message);
    }

    if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
      dlog("[init] ADMIN_USERNAME/ADMIN_PASSWORD not set — skipping admin seed");
      return;
    }

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
      dlog(`[init] admin account created: ${ADMIN_USERNAME}`);
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
      dlog(isLegacy
        ? "[init] migrated admin password to bcrypt"
        : "[init] admin password healed");
    } else {
      dlog("[init] admin account verified");
    }
  } catch (err) {
    console.error("[init] admin initialization failed:", err.message);
  }
}

// ═══════════════════════════════════════════════════════
// ═══ JHS SCHEDULING ENGINE (FULL DAY)                ═══
// ═══════════════════════════════════════════════════════

const JHS_AM_SLOTS = [
  { time: "06:00-07:00", start: "06:00", end: "07:00", isBreak: false },
  { time: "07:00-08:00", start: "07:00", end: "08:00", isBreak: false },
  { time: "08:00-09:00", start: "08:00", end: "09:00", isBreak: false },
  { time: "09:00-09:15", start: null,    end: null,    isBreak: true  },
  { time: "09:15-10:15", start: "09:15", end: "10:15", isBreak: false },
  { time: "10:15-11:15", start: "10:15", end: "11:15", isBreak: false },
  { time: "11:15-12:15", start: "11:15", end: "12:15", isBreak: false },
];

const JHS_PM_SLOTS = [
  { time: "12:15-13:45", start: null,    end: null,    isBreak: true  },
  { time: "13:45-14:45", start: "13:45", end: "14:45", isBreak: false },
  { time: "14:45-15:00", start: null,    end: null,    isBreak: true  },
  { time: "15:00-16:00", start: "15:00", end: "16:00", isBreak: false },
  { time: "16:00-17:00", start: "16:00", end: "17:00", isBreak: false },
  { time: "17:00-18:00", start: "17:00", end: "18:00", isBreak: false },
  { time: "18:00-19:00", start: "18:00", end: "19:00", isBreak: false },
];

const JHS_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const RESERVED_SLOTS = [
  { day: "Monday", start: "06:00", end: "07:00" },
];

function isReservedSlot(day, startTime) {
  return RESERVED_SLOTS.some(
    r => r.day === day && r.start === startTime
  );
}

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
    return { sectionsProcessed: 0, teachersUpdated: 0, masterSectionSchedules: {}, skippedSections: [] };
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
    };
  });

  const DEFAULT_JHS_SUBJECTS = ["Mathematics", "Science", "English", "Filipino", "Araling Panlipunan", "MAPEH", "TLE", "Values Education"];

  function teacherCanTeach(t, subjectAlias, gradeNum) {
    if (t.targetGrade && t.targetGrade !== gradeNum) return false;
    return t.subjects.some(s => s === subjectAlias || s.includes(subjectAlias) || subjectAlias.includes(s));
  }

  const globalTeacherTotalHours = {};
  const GRADE_LEVELS = [7, 8, 9, 10];
  const masterSectionSchedules = {};
  const skippedSections = [];

  for (const gradeNum of GRADE_LEVELS) {
    const gradeSections = jhsSections.filter(s => {
      const g = jhsGradeNum(s.grade_level || s.gradeLevel);
      return g === gradeNum;
    });

    if (gradeSections.length === 0) continue;

    console.log(`[JHS] Processing Grade ${gradeNum}: ${gradeSections.length} sections`);

    const sortedGradeSections = [...gradeSections].sort((a, b) => String(a.name).localeCompare(String(b.name)));

    const usedTeachers = new Set();
    const usedRooms = new Set();
    const teacherDailyHours = {};
    const teacherDailyCount = {};

    const MAX_TEACHING_HOURS_PER_DAY = 6;
    const MAX_CLASSES_PER_DAY = 6;

    for (const section of sortedGradeSections) {
      const secName = section.name;
      const secGrade = gradeNum;

      let subjNames = safeJsonParse(section.subjects);
      if (subjNames.length === 0) {
        subjNames = DEFAULT_JHS_SUBJECTS.slice();
      }

      const subjectAvailability = subjNames.map(subjName => {
        const alias = jhsAliasSubject(subjName);
        const qualified = tList.filter(t => teacherCanTeach(t, alias, secGrade));
        return {
          subject: subjName,
          alias,
          qualifiedCount: qualified.length,
          hasTeacher: qualified.length > 0,
        };
      });

      const missingSubjects = subjectAvailability.filter(s => !s.hasTeacher);

      if (missingSubjects.length > 0) {
        const errorMsg = `No qualified teacher for: ${missingSubjects.map(m => m.subject).join(', ')}`;
        console.warn(`[JHS] SKIPPED: ${secName} — ${errorMsg}`);
        skippedSections.push({
          section: secName,
          grade: secGrade,
          reason: errorMsg,
          missingSubjects: missingSubjects.map(m => m.subject),
        });
        continue;
      }

      const slotsPerSubjectPerSection = 6;
      const slotsPerTeacherPerWeek = MAX_TEACHING_HOURS_PER_DAY * JHS_DAYS.length;

      const subjCapacityIssues = [];

      for (const subjName of subjNames) {
        const alias = jhsAliasSubject(subjName);
        const qualifiedTeachers = tList.filter(t => teacherCanTeach(t, alias, secGrade));

        if (qualifiedTeachers.length === 0) continue;

        const subjCapacity = qualifiedTeachers.length * slotsPerTeacherPerWeek;

        if (subjCapacity < slotsPerSubjectPerSection) {
          subjCapacityIssues.push({
            subject: subjName,
            teacherCount: qualifiedTeachers.length,
            capacity: subjCapacity,
            needed: slotsPerSubjectPerSection,
          });
        }
      }

      if (subjCapacityIssues.length > 0) {
        const errorMsg = `Insufficient teacher capacity for: ${subjCapacityIssues.map(i =>
          `${i.subject} (${i.teacherCount} teacher(s), need ${i.needed} slots, have ${i.capacity})`
        ).join('; ')}`;
        console.warn(`[JHS] SKIPPED: ${secName} — ${errorMsg}`);
        skippedSections.push({
          section: secName,
          grade: secGrade,
          reason: errorMsg,
          capacityIssues: subjCapacityIssues,
        });
        continue;
      }

      const allGradeSections = jhsSections.filter(s => {
        const g = jhsGradeNum(s.grade_level || s.gradeLevel);
        return g === secGrade;
      });

      let totalAllSectionsSlots = 0;
      for (const sec of allGradeSections) {
        let secSlots = 0;
        for (const day of JHS_DAYS) {
          for (const slot of JHS_AM_SLOTS) {
            if (slot.isBreak) continue;
            if (slot.start === "06:00") continue;
            if (isReservedSlot(day, slot.start)) continue;
            secSlots++;
          }
          for (const slot of JHS_PM_SLOTS) {
            if (slot.isBreak) continue;
            secSlots++;
          }
        }
        totalAllSectionsSlots += secSlots;
      }

      const gradeTeachers = tList.filter(t => !t.targetGrade || t.targetGrade === secGrade);
      const totalGradeCapacity = gradeTeachers.length * slotsPerTeacherPerWeek;

      console.log(`[JHS] Grade ${secGrade}: ${allGradeSections.length} sections, ${totalAllSectionsSlots} slots needed, ${totalGradeCapacity} capacity`);

      if (totalAllSectionsSlots > totalGradeCapacity) {
        const errorMsg = `Grade ${secGrade} insufficient capacity: ${allGradeSections.length} sections need ${totalAllSectionsSlots} slots, but only ${totalGradeCapacity} slots available (${gradeTeachers.length} teachers)`;
        console.warn(`[JHS] SKIPPED: ${secName} — ${errorMsg}`);
        skippedSections.push({
          section: secName,
          grade: secGrade,
          reason: errorMsg,
          requiredSlots: totalAllSectionsSlots,
          availableCapacity: totalGradeCapacity,
          sectionCount: allGradeSections.length,
          teacherCount: gradeTeachers.length,
        });
        continue;
      }

      console.log(`[JHS] Section "${secName}" passed all pre-checks. Processing...`);

      const timetable = {};
      JHS_DAYS.forEach(d => { timetable[d] = {}; });

      function findTeacherForSubject(subjName, day, startTime) {
        const alias = jhsAliasSubject(subjName);
        const qualified = tList.filter(t => teacherCanTeach(t, alias, secGrade));
        if (qualified.length === 0) return null;

        const available = qualified.filter(t => {
          const tKey = `${t.id}-${day}-${startTime}`;
          if (usedTeachers.has(tKey)) return false;

          const dKey = `${t.id}-${day}`;
          const hoursToday = teacherDailyHours[dKey] || 0;
          const classesToday = teacherDailyCount[dKey] || 0;

          if (hoursToday >= MAX_TEACHING_HOURS_PER_DAY * 60) return false;
          if (classesToday >= MAX_CLASSES_PER_DAY) return false;

          return true;
        });

        if (available.length === 0) return null;

        available.sort((a, b) => {
          const aHours = globalTeacherTotalHours[a.id] || 0;
          const bHours = globalTeacherTotalHours[b.id] || 0;
          return aHours - bHours;
        });

        return available[0];
      }

      const amSubjCount = {};
      subjNames.forEach(n => amSubjCount[n] = 0);
      let amCursor = 0;
      const amTarget = 3;

      for (const day of JHS_DAYS) {
        for (const slot of JHS_AM_SLOTS) {
          if (slot.isBreak) {
            timetable[day][slot.time] = null;
            continue;
          }

          if (isReservedSlot(day, slot.start)) {
            timetable[day][slot.time] = null;
            continue;
          }

          let picked = null;
          let attempts = 0;
          const maxAttempts = subjNames.length * 3;

          while (attempts < maxAttempts) {
            const cand = subjNames[amCursor % subjNames.length];
            amCursor++;
            attempts++;
            if (amSubjCount[cand] < amTarget) { picked = cand; break; }
          }

          if (!picked) { timetable[day][slot.time] = null; continue; }

          const teacher = findTeacherForSubject(picked, day, slot.start);
          if (!teacher) { timetable[day][slot.time] = null; continue; }

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
            shift: "AM",
          };

          amSubjCount[picked]++;
          usedTeachers.add(`${teacher.id}-${day}-${slot.start}`);
          usedRooms.add(`${chosenRoom}-${day}-${slot.start}`);

          const dKey = `${teacher.id}-${day}`;
          teacherDailyHours[dKey] = (teacherDailyHours[dKey] || 0) + 60;
          teacherDailyCount[dKey] = (teacherDailyCount[dKey] || 0) + 1;
          globalTeacherTotalHours[teacher.id] = (globalTeacherTotalHours[teacher.id] || 0) + 60;
        }
      }

      const pmSubjCount = {};
      subjNames.forEach(n => pmSubjCount[n] = 0);
      let pmCursor = 0;
      const pmTarget = 3;

      for (const day of JHS_DAYS) {
        for (const slot of JHS_PM_SLOTS) {
          if (slot.isBreak) {
            timetable[day][slot.time] = null;
            continue;
          }

          let picked = null;
          let attempts = 0;
          const maxAttempts = subjNames.length * 3;

          while (attempts < maxAttempts) {
            const cand = subjNames[pmCursor % subjNames.length];
            pmCursor++;
            attempts++;
            if (pmSubjCount[cand] < pmTarget) { picked = cand; break; }
          }

          if (!picked) { timetable[day][slot.time] = null; continue; }

          const teacher = findTeacherForSubject(picked, day, slot.start);
          if (!teacher) { timetable[day][slot.time] = null; continue; }

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
            shift: "PM",
          };

          pmSubjCount[picked]++;
          usedTeachers.add(`${teacher.id}-${day}-${slot.start}`);
          usedRooms.add(`${chosenRoom}-${day}-${slot.start}`);

          const dKey = `${teacher.id}-${day}`;
          teacherDailyHours[dKey] = (teacherDailyHours[dKey] || 0) + 60;
          teacherDailyCount[dKey] = (teacherDailyCount[dKey] || 0) + 1;
          globalTeacherTotalHours[teacher.id] = (globalTeacherTotalHours[teacher.id] || 0) + 60;
        }
      }

      let amVacantCount = 0;
      let amTotalSlots = 0;
      let pmVacantCount = 0;
      let pmTotalSlots = 0;

      for (const day of JHS_DAYS) {
        for (const slot of JHS_AM_SLOTS) {
          if (slot.isBreak) continue;
          if (isReservedSlot(day, slot.start)) continue;

          amTotalSlots++;
          const slotData = timetable[day]?.[slot.time];
          if (!slotData || !slotData.teacherId) amVacantCount++;
        }

        for (const slot of JHS_PM_SLOTS) {
          if (slot.isBreak) continue;

          pmTotalSlots++;
          const slotData = timetable[day]?.[slot.time];
          if (!slotData || !slotData.teacherId) pmVacantCount++;
        }
      }

      const amFilled = amTotalSlots - amVacantCount;
      const pmFilled = pmTotalSlots - pmVacantCount;

      const totalSubjects = subjNames.length;
      const expectedAmVacant = Math.max(0, amTotalSlots - (totalSubjects * 3));
      const expectedPmVacant = Math.max(0, pmTotalSlots - (totalSubjects * 3));

      const amComplete = amVacantCount <= expectedAmVacant;
      const pmComplete = pmVacantCount <= expectedPmVacant;

      console.log(`[JHS] ${secName}: AM ${amFilled}/${amTotalSlots} (${amVacantCount} vacant), PM ${pmFilled}/${pmTotalSlots} (${pmVacantCount} vacant)`);

      if (!amComplete && !pmComplete) {
        const errorMsg = `Parehong kulang ang AM at PM shift — AM ${amFilled}/${amTotalSlots}, PM ${pmFilled}/${pmTotalSlots}`;
        console.warn(`[JHS] SKIPPED: ${secName} — ${errorMsg}`);
        skippedSections.push({
          section: secName,
          grade: secGrade,
          reason: errorMsg,
          amFillRate: `${amFilled}/${amTotalSlots}`,
          pmFillRate: `${pmFilled}/${pmTotalSlots}`,
        });
        continue;
      }

      masterSectionSchedules[secName] = {
        details: section,
        gradeLevel: `Junior High School - Grade ${secGrade}`,
        shift: "FULL",
        slots: [...JHS_AM_SLOTS, ...JHS_PM_SLOTS].map(s => s.time),
        timetable,
      };

      console.log(`[JHS] Section "${secName}" saved. AM: ${amFilled}/${amTotalSlots}, PM: ${pmFilled}/${pmTotalSlots}`);
    }
  }

  const slotsByTeacher = {};
  Object.values(masterSectionSchedules).forEach(secObj => {
    const secName = secObj.details.name;
    const gradeLevel = secObj.gradeLevel;
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
          gradeLevel,
          shift: data.shift,
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
    sectionsProcessed: Object.keys(masterSectionSchedules).length,
    teachersUpdated: idsInMaster.size,
    masterSectionSchedules,
    skippedSections,
  };
}

// ── Main server ──
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
    if (!rateLimit(req, res, { windowMs: 60_000, maxRequests: 100, keyPrefix: "api" })) return;

    // ── Login ──
    if (pathname === "/api/auth/login" && req.method === "POST") {
      if (!rateLimit(req, res, { windowMs: 2 * 60_000, maxRequests: 50, keyPrefix: "login" })) return;
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

        let sessionVersion = user.session_version || 1;

        if (user.role === "admin") {
          sessionVersion = sessionVersion + 1;
          await db.query(
            "UPDATE public.users SET session_version = $1 WHERE id = $2",
            [sessionVersion, user.id]
          );
        }

        const token = jwt.sign(
          {
            id: user.id,
            username: user.username,
            role: user.role,
            teacherId: user.teacher_id,
            sessionVersion,
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
        if (process.env.NODE_ENV === "production") cookieOptions.push("Secure");

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
      } catch {
        return send(res, 500, { error: "Login failed." });
      }
    }

    // ── Logout ──
    if (pathname === "/api/auth/logout" && req.method === "POST") {
      const auth = getAuth(req);
      if (auth) {
        await logAuditEvent("logout", auth.id, req.socket.remoteAddress, {
          username: auth.username,
          role: auth.role,
        });
      }
      return send(res, 200, { success: true }, {
        "Set-Cookie": "lectura_token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      });
    }

    // ── Reset password ──
    if (pathname === "/api/auth/reset-password" && req.method === "POST") {
      if (!rateLimit(req, res, { windowMs: 15 * 60_000, maxRequests: 10, keyPrefix: "reset-pw" })) return;

      try {
        const body = await parseBody(req);
        const username = sanitizeString(body.username, 100);
        const masterKey = typeof body.masterKey === "string" ? body.masterKey : "";
        const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

        if (!username) return send(res, 400, { error: "Username is required." });
        if (!masterKey) return send(res, 400, { error: "Master Security Key is required." });
        if (!newPassword) return send(res, 400, { error: "New password is required." });
        if (newPassword.length < 8) return send(res, 400, { error: "Password must be at least 8 characters." });
        if (!/[A-Z]/.test(newPassword)) return send(res, 400, { error: "Password must contain at least one uppercase letter." });
        if (!/[a-z]/.test(newPassword)) return send(res, 400, { error: "Password must contain at least one lowercase letter." });
        if (!/[0-9]/.test(newPassword)) return send(res, 400, { error: "Password must contain at least one number." });

        if (masterKey !== MASTER_KEY) {
          await logAuditEvent("reset_password_failed", null, req.socket.remoteAddress, { username, reason: "invalid_master_key" });
          return send(res, 401, { error: "Invalid Master Security Key. Please contact your administrator." });
        }

        const { rows } = await db.query(
          "SELECT id, username FROM public.users WHERE LOWER(username) = LOWER($1)",
          [username]
        );

        if (rows.length === 0) {
          await logAuditEvent("reset_password_failed", null, req.socket.remoteAddress, { username, reason: "user_not_found" });
          return send(res, 404, { error: "Username not found. Please check your username." });
        }

        const user = rows[0];
        const newHashedPassword = await bcrypt.hash(newPassword, 10);

        await db.query(
          `UPDATE public.users
           SET password = $1,
               last_password_change = NOW(),
               updated_at = NOW(),
               session_version = COALESCE(session_version, 1) + 1
           WHERE id = $2`,
          [newHashedPassword, user.id]
        );

        await logAuditEvent("reset_password_success", user.id, req.socket.remoteAddress, {
          username: user.username,
          method: "master_key_reset",
        });

        dlog("[auth] password reset:", user.username);
        return send(res, 200, {
          success: true,
          message: "Password reset successfully. You can now log in with your new password. All other sessions have been logged out.",
        });
      } catch (err) {
        console.error("[auth] reset password error:", err.message);
        return send(res, 500, { error: "Failed to reset password. Please try again." });
      }
    }

    // ── Admin routes ──
    if (pathname.startsWith("/api/admin/")) {
      const auth = await getAuthWithSessionCheck(req);
      if (!auth || auth.role !== "admin") {
        await logAuditEvent("unauthorized_access", null, req.socket.remoteAddress, { path: pathname });
        return send(res, 403, { error: "Forbidden: Admin privileges required." });
      }

      if (pathname === "/api/admin/profile" && req.method === "GET") {
        try {
          const { rows } = await db.query("SELECT * FROM public.users WHERE id = $1", [auth.id]);
          if (rows.length === 0) return send(res, 404, { error: "Profile not found." });
          const p = rows[0];
          return send(res, 200, {
            id: p.id || "",
            username: p.username || "admin",
            name: p.name || "Administrator",
            displayName: p.display_name || p.name || "Administrator",
            email: p.email || "",
            role: p.role || "admin",
            createdAt: p.created_at || new Date().toISOString(),
            updatedAt: p.updated_at || new Date().toISOString(),
            lastPasswordChange: p.last_password_change || null,
          });
        } catch (err) {
          console.error("[admin] get profile error:", err.message);
          return send(res, 500, { error: "Failed to load profile." });
        }
      }

      if (pathname === "/api/admin/profile" && req.method === "PUT") {
        if (!rateLimit(req, res, { windowMs: 60_000, maxRequests: 10, keyPrefix: "profile-update" })) return;
        try {
          const body = await parseBody(req);
          const displayName = sanitizeString(body.displayName || body.name, 100);
          const email = body.email ? validateEmail(body.email) : null;

          if (!displayName) return send(res, 400, { error: "Display name is required." });

          const { rows } = await db.query("SELECT * FROM public.users WHERE id = $1", [auth.id]);
          if (rows.length === 0) return send(res, 404, { error: "Profile not found." });
          const existing = rows[0];

          await db.query(
            `UPDATE public.users SET name = $1, display_name = $2, email = $3, updated_at = NOW() WHERE id = $4`,
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

          const updated = await db.query("SELECT * FROM public.users WHERE id = $1", [auth.id]);
          const p = updated.rows[0];
          return send(res, 200, {
            success: true,
            profile: {
              id: p.id,
              username: p.username,
              name: p.name,
              displayName: p.display_name || p.name,
              email: p.email || "",
              role: p.role,
              createdAt: p.created_at || new Date().toISOString(),
              updatedAt: p.updated_at || new Date().toISOString(),
              lastPasswordChange: p.last_password_change || null,
            },
          });
        } catch (err) {
          console.error("[admin] update profile error:", err.message);
          return send(res, 500, { error: "Failed to update profile." });
        }
      }

      if (pathname === "/api/admin/profile/username" && req.method === "PUT") {
        if (!rateLimit(req, res, { windowMs: 60 * 60_000, maxRequests: 3, keyPrefix: "change-username" })) return;
        try {
          const body = await parseBody(req);
          const newUsername = validateUsername(body.newUsername);
          const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";

          if (!newUsername) return send(res, 400, { error: "Invalid username. Use 3-50 characters (letters, numbers, dots, dashes, underscores)." });
          if (!currentPassword) return send(res, 400, { error: "Current password is required." });

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
          console.error("[admin] change username error:", err.message);
          return send(res, 500, { error: "Failed to change username." });
        }
      }

      if (pathname === "/api/admin/profile/password" && req.method === "PUT") {
        if (!rateLimit(req, res, { windowMs: 60 * 60_000, maxRequests: 5, keyPrefix: "change-password" })) return;
        try {
          const body = await parseBody(req);
          const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
          const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

          if (!currentPassword || !newPassword) return send(res, 400, { error: "Current password and new password are required." });
          if (newPassword.length < 8) return send(res, 400, { error: "Password must be at least 8 characters." });
          if (!/[A-Z]/.test(newPassword)) return send(res, 400, { error: "Password must contain at least one uppercase letter." });
          if (!/[a-z]/.test(newPassword)) return send(res, 400, { error: "Password must contain at least one lowercase letter." });
          if (!/[0-9]/.test(newPassword)) return send(res, 400, { error: "Password must contain at least one number." });

          const { rows } = await db.query("SELECT * FROM public.users WHERE id = $1", [auth.id]);
          if (rows.length === 0) return send(res, 404, { error: "Profile not found." });
          const existing = rows[0];

          const passwordValid = await bcrypt.compare(currentPassword, existing.password);
          if (!passwordValid) {
            await logAuditEvent("change_password_failed", auth.id, req.socket.remoteAddress, { reason: "invalid_password" });
            return send(res, 401, { error: "Current password is incorrect." });
          }

          const samePassword = await bcrypt.compare(newPassword, existing.password);
          if (samePassword) return send(res, 400, { error: "New password must be different from current password." });

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

          await logAuditEvent("change_password", auth.id, req.socket.remoteAddress, { sessionVersionIncremented: true });

          return send(res, 200, {
            success: true,
            message: "Password changed successfully. All other sessions have been logged out.",
          });
        } catch (err) {
          console.error("[admin] change password error:", err.message);
          return send(res, 500, { error: "Failed to change password." });
        }
      }

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
          console.error("[admin] get profile history error:", err.message);
          return send(res, 500, { error: "Failed to load history." });
        }
      }

      if (pathname === "/api/admin/audit-log" && req.method === "GET") {
        try {
          const limit = Math.min(parseInt(query.limit, 10) || 50, 200);
          const offset = Math.max(parseInt(query.offset, 10) || 0, 0);
          const actionFilter = query.action ? sanitizeString(query.action, 50) : null;
          const userIdFilter = query.userId ? sanitizeString(query.userId, 100) : null;

          const conditions = [];
          const params = [];

          if (actionFilter) {
            params.push(actionFilter);
            conditions.push(`al.action = $${params.length}`);
          }
          if (userIdFilter) {
            params.push(userIdFilter);
            conditions.push(`al.user_id = $${params.length}`);
          }

          const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

          params.push(limit);
          const limitIdx = params.length;
          params.push(offset);
          const offsetIdx = params.length;

          const { rows } = await db.query(
            `SELECT
               al.id,
               al.action,
               al.user_id       AS "userId",
               al.ip_address    AS "ipAddress",
               al.details,
               al.created_at    AS "createdAt",
               u.username,
               u.role,
               COALESCE(u.display_name, u.name) AS "displayName"
             FROM audit_logs al
             LEFT JOIN public.users u ON u.id = al.user_id
             ${whereClause}
             ORDER BY al.created_at DESC
             LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
            params
          );

          const { rows: countRows } = await db.query(
            `SELECT COUNT(*)::int AS total FROM audit_logs al ${whereClause}`,
            params.slice(0, params.length - 2)
          );

          return send(res, 200, {
            total: countRows[0].total,
            limit,
            offset,
            entries: rows,
          });
        } catch (err) {
          console.error("[admin] audit log read error:", err.message);
          return send(res, 500, { error: "Failed to load audit log." });
        }
      }

      if (pathname === "/api/admin/generate-jhs-master" && req.method === "POST") {
        if (!rateLimit(req, res, { windowMs: 30 * 60_000, maxRequests: 5, keyPrefix: "gen-jhs" })) return;
        try {
          const body = await parseBody(req);
          const result = await generateJHSMaster(body);
          await logAuditEvent("generate_jhs_master", auth.id, req.socket.remoteAddress, {
            sections: result.sectionsProcessed,
            teachers: result.teachersUpdated,
          });
          dlog(`[jhs] generated: ${result.sectionsProcessed} sections, ${result.teachersUpdated} teachers`);
          return send(res, 200, { success: true, ...result });
        } catch (err) {
          console.error("[jhs] generation failed:", err);
          return send(res, 500, { error: err.message });
        }
      }

      // ── Subjects ──
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

      if (pathname === "/api/admin/subjects/batch-delete" && req.method === "DELETE") {
        try {
          const body = await parseBody(req);
          const names = Array.isArray(body.subjectNames) ? body.subjectNames.filter(Boolean) : [];
          if (names.length === 0) {
            return send(res, 400, { error: "No subjects provided." });
          }

          const lowered = names.map(n => String(n).trim().toLowerCase());
          const result = await db.query(
            `DELETE FROM subjects WHERE LOWER(TRIM(name)) = ANY($1::text[])`,
            [lowered]
          );

          await logAuditEvent("batch_delete_subjects", auth.id, req.socket.remoteAddress, {
            count: result.rowCount,
            names,
          });

          return send(res, 200, { success: true, deleted: result.rowCount });
        } catch (err) {
          console.error("[admin] batch delete subjects error:", err.message);
          return send(res, 500, { error: "Failed to delete subjects." });
        }
      }

      if (pathname.startsWith("/api/admin/subjects/") && req.method === "DELETE") {
        try {
          const identifier = decodeURIComponent(pathname.split("/").pop());
          const isNumeric = /^\d+$/.test(identifier);

          const result = isNumeric
            ? await db.query("DELETE FROM subjects WHERE id = $1 RETURNING id", [identifier])
            : await db.query(
                "DELETE FROM subjects WHERE LOWER(TRIM(name)) = LOWER($1) RETURNING id",
                [identifier]
              );

          if (result.rowCount === 0) return send(res, 404, { error: "Subject not found." });

          await logAuditEvent("delete_subject", auth.id, req.socket.remoteAddress, {
            identifier,
            by: isNumeric ? "id" : "name",
          });

          return send(res, 200, { success: true });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      // ── Sections ──
      if (pathname === "/api/admin/sections" && req.method === "GET") {
        try {
          const { rows } = await db.query(`
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
          `);
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

          if (roomId) {
            const roomConflict = await db.query(
              `SELECT s.name AS section_name, s.grade_level, r.name AS room_name
              FROM sections s
              LEFT JOIN rooms r ON CAST(s.room_id AS VARCHAR) = CAST(r.id AS VARCHAR)
              WHERE s.room_id = $1
                AND LOWER(TRIM(s.grade_level)) = LOWER(TRIM($2))`,
              [roomId, gradeLevel]
            );

            if (roomConflict.rows.length > 0) {
              const conflict = roomConflict.rows[0];
              return send(res, 400, {
                error: `Room "${conflict.room_name}" is already assigned to section "${conflict.section_name}" in ${gradeLevel}. Please choose a different room.`,
                code: "ROOM_CONFLICT",
              });
            }
          }

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
          const identifier = decodeURIComponent(pathname.split("/").pop());
          const isNumeric = /^\d+$/.test(identifier);

          const result = isNumeric
            ? await db.query("DELETE FROM sections WHERE id = $1 RETURNING id", [identifier])
            : await db.query(
                "DELETE FROM sections WHERE LOWER(TRIM(name)) = LOWER($1) RETURNING id",
                [identifier]
              );

          if (result.rowCount === 0) return send(res, 404, { error: "Section not found." });

          await logAuditEvent("delete_section", auth.id, req.socket.remoteAddress, {
            identifier,
            by: isNumeric ? "id" : "name",
          });

          return send(res, 200, { success: true });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }

      // ── Rooms ──
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

      // ── Teachers ──
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
        if (!rateLimit(req, res, { windowMs: 60 * 60_000, maxRequests: 10, keyPrefix: "teacher-create" })) return;
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
            return send(res, 400, { error: `Teacher "${firstName} ${lastName}" is already registered.` });
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
            const t = timeStr.trim().toLowerCase();
            const isPM = t.includes("pm");
            const isAM = t.includes("am");
            const nums = t.replace(/[^0-9:]/g, "").split(":");
            let h = parseInt(nums[0], 10);
            const m = nums[1] ? parseInt(nums[1], 10) : 0;
            if (isPM && h !== 12) h += 12;
            if (isAM && h === 12) h = 0;
            return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          }

          const availabilityArray = safeJsonParse(body.availability, []);
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
              firstName, lastName, email, subjectsJSON, targetGrade, workDaysJSON,
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

          let emailSent = false;
          if (email) {
            try {
              await sendCredentialsEmail({
                to: email,
                name: `${firstName} ${lastName}`,
                username,
                password,
              });
              emailSent = true;
              await logAuditEvent("send_credentials_email", auth.id, req.socket.remoteAddress, { teacherEmail: email });
            } catch (mailErr) {
              console.error("[mail] failed to send credentials:", mailErr.message);
              await logAuditEvent("send_credentials_email_failed", auth.id, req.socket.remoteAddress, {
                teacherEmail: email,
                error: mailErr.message,
              });
            }
          }

          return send(res, 201, {
            success: true,
            teacher: newTeacher,
            credentials: { username, password },
            emailSent,
            schedule: { teacherId: newTeacher.id, slots: [] },
          });
        } catch (err) {
          console.error("[teacher] registration error:", err);
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

      // ── Schedules ──
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
        if (!rateLimit(req, res, { windowMs: 60_000, maxRequests: 30, keyPrefix: "swap" })) return;
        try {
          const body = await parseBody(req);
          const { cellA, cellB, mode } = body;

          if (!cellA || !cellA.slotId) return send(res, 400, { error: "cellA.slotId is required." });

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
            if (rowsA.length === 0) return send(res, 404, { error: "Teacher has no schedule." });

            const tName = await getTeacherName(cellA.teacherId);

            const slotsA = safeJsonParse(rowsA[0].slots, []).map(s => ({
              ...s,
              teacherId: parseInt(cellA.teacherId, 10),
              teacherName: tName,
            }));

            const idxA = slotsA.findIndex(s => String(s.id) === String(cellA.slotId));
            if (idxA === -1) return send(res, 404, { error: "Source slot ID not found." });

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

            return send(res, 200, { success: true, mode: "move", message: "Moved successfully." });
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

          return send(res, 200, { success: true, mode: "swap", message: "Swap successful." });
        } catch (err) {
          console.error("[swap] failed:", err);
          return send(res, 500, { error: err.message });
        }
      }
    }

    // ── Global timetable ──
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
              id: slot.id,
              instructor: name,
              subject: slot.subject,
              section: slot.section,
              room: slot.room,
              day: slot.day,
              timeSlot: `${slot.startTime} to ${slot.endTime}`,
            });
          });
        });
        return send(res, 200, out);
      } catch (err) {
        return send(res, 500, { error: err.message });
      }
    }

    // ── Teacher routes ──
    if (pathname.startsWith("/api/teacher/")) {
      const auth = await getAuthWithSessionCheck(req);
      if (!auth || auth.role !== "teacher") return send(res, 403, { error: "Forbidden" });

      if (pathname === "/api/teacher/profile" && req.method === "GET") {
        try {
          const { rows } = await db.query("SELECT * FROM public.users WHERE id = $1", [auth.id]);
          if (rows.length === 0) return send(res, 404, { error: "Profile not found." });
          const p = rows[0];
          return send(res, 200, {
            id: p.id || "",
            username: p.username || "",
            name: p.name || "",
            displayName: p.display_name || p.name || "",
            email: p.email || "",
            role: p.role || "teacher",
            teacherId: p.teacher_id || null,
            createdAt: p.created_at || new Date().toISOString(),
            updatedAt: p.updated_at || new Date().toISOString(),
            lastPasswordChange: p.last_password_change || null,
          });
        } catch (err) {
          console.error("[teacher] get profile error:", err.message);
          return send(res, 500, { error: "Failed to load profile." });
        }
      }

      if (pathname === "/api/teacher/profile" && req.method === "PUT") {
        if (!rateLimit(req, res, { windowMs: 60_000, maxRequests: 10, keyPrefix: "teacher-profile-update" })) return;
        try {
          const body = await parseBody(req);
          const displayName = sanitizeString(body.displayName || body.name, 100);
          const email = body.email ? validateEmail(body.email) : null;

          if (!displayName) return send(res, 400, { error: "Display name is required." });

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
            role: "teacher",
          });

          const updated = await db.query("SELECT * FROM public.users WHERE id = $1", [auth.id]);
          const p = updated.rows[0];
          return send(res, 200, {
            success: true,
            profile: {
              id: p.id,
              username: p.username,
              name: p.name,
              displayName: p.display_name || p.name,
              email: p.email || "",
              role: p.role,
              createdAt: p.created_at || new Date().toISOString(),
              updatedAt: p.updated_at || new Date().toISOString(),
              lastPasswordChange: p.last_password_change || null,
            },
          });
        } catch (err) {
          console.error("[teacher] update profile error:", err.message);
          return send(res, 500, { error: "Failed to update profile." });
        }
      }

      if (pathname === "/api/teacher/profile/password" && req.method === "PUT") {
        if (!rateLimit(req, res, { windowMs: 60 * 60_000, maxRequests: 5, keyPrefix: "teacher-change-password" })) return;
        try {
          const body = await parseBody(req);
          const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
          const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

          if (!currentPassword || !newPassword) return send(res, 400, { error: "Current password and new password are required." });
          if (newPassword.length < 8) return send(res, 400, { error: "Password must be at least 8 characters." });
          if (!/[A-Z]/.test(newPassword)) return send(res, 400, { error: "Password must contain at least one uppercase letter." });
          if (!/[a-z]/.test(newPassword)) return send(res, 400, { error: "Password must contain at least one lowercase letter." });
          if (!/[0-9]/.test(newPassword)) return send(res, 400, { error: "Password must contain at least one number." });

          const { rows } = await db.query("SELECT * FROM public.users WHERE id = $1", [auth.id]);
          if (rows.length === 0) return send(res, 404, { error: "Profile not found." });
          const existing = rows[0];

          const passwordValid = await bcrypt.compare(currentPassword, existing.password);
          if (!passwordValid) {
            await logAuditEvent("change_password_failed", auth.id, req.socket.remoteAddress, { reason: "invalid_password", role: "teacher" });
            return send(res, 401, { error: "Current password is incorrect." });
          }

          const samePassword = await bcrypt.compare(newPassword, existing.password);
          if (samePassword) return send(res, 400, { error: "New password must be different from current password." });

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
            role: "teacher",
          });

          return send(res, 200, {
            success: true,
            message: "Password changed successfully. All other sessions have been logged out.",
          });
        } catch (err) {
          console.error("[teacher] change password error:", err.message);
          return send(res, 500, { error: "Failed to change password." });
        }
      }

      if (pathname === "/api/teacher/profile/history" && req.method === "GET") {
        try {
          const { rows: profileChanges } = await db.query(
            `SELECT
               'profile_change' AS source,
               change_type,
               old_value,
               new_value,
               ip_address,
               user_agent,
               changed_at AS timestamp
             FROM user_profile_changes
             WHERE user_id = $1`,
            [auth.id]
          );

          const { rows: auditEvents } = await db.query(
            `SELECT
               'audit' AS source,
               action AS change_type,
               NULL AS old_value,
               NULL AS new_value,
               ip_address,
               NULL AS user_agent,
               created_at AS timestamp
             FROM audit_logs
             WHERE user_id = $1
               AND action IN (
                 'change_password',
                 'change_password_failed',
                 'reset_password_success',
                 'reset_password_failed',
                 'update_profile'
               )`,
            [auth.id]
          );

          const merged = [...profileChanges, ...auditEvents]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 50);

          const sanitized = merged.map(row => {
            const ip = row.ip_address || "";
            const isLocal = !ip || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);

            return {
              source: row.source,
              change_type: row.change_type,
              old_value: row.old_value,
              new_value: row.new_value,
              device: parseUserAgentServer(row.user_agent),
              location: isLocal ? "Local Network" : "Your Network",
              timestamp: row.timestamp,
            };
          });

          return send(res, 200, { history: sanitized });
        } catch (err) {
          console.error("[teacher] get profile history error:", err.message);
          return send(res, 500, { error: "Failed to load history." });
        }
      }

      // ═══════════════════════════════════════════════════════
      // ═══ TEACHER SCHEDULE — FIXED VERSION              ═══
      // ═══════════════════════════════════════════════════════
      if (pathname === "/api/teacher/schedule" && req.method === "GET") {
        try {
          // ── Step 1: Resolve this teacher's user row ──
          const { rows: userRows } = await db.query(
            "SELECT id, username, name, display_name, teacher_id FROM public.users WHERE id = $1",
            [auth.id]
          );

          if (userRows.length === 0) {
            return send(res, 404, { error: "User not found." });
          }

          const user = userRows[0];
          let targetTeacherId = user.teacher_id;
          let targetTeacherName = null;

          console.log(`[teacher/schedule] Resolving for user: ${user.username} (teacher_id=${targetTeacherId})`);

          // ── Step 2: If teacher_id exists, look up their name ──
          if (targetTeacherId) {
            const { rows: t } = await db.query(
              "SELECT id, first_name, last_name FROM teachers WHERE id = $1",
              [targetTeacherId]
            );
            if (t.length > 0) {
              targetTeacherName = `${t[0].first_name || ""} ${t[0].last_name || ""}`.trim();
            }
          }

          // ── Step 3: If no teacher_id, try to match by name ──
          if (!targetTeacherId) {
            const nameToTry = user.display_name || user.name;
            console.log(`[teacher/schedule] No teacher_id, trying name match: "${nameToTry}"`);

            if (nameToTry) {
              const { rows: byName } = await db.query(
                `SELECT id, first_name, last_name FROM teachers
                 WHERE LOWER(first_name || ' ' || last_name) = LOWER($1)
                    OR LOWER(COALESCE(name, '')) = LOWER($1)
                 LIMIT 1`,
                [nameToTry]
              );
              if (byName.length > 0) {
                targetTeacherId = String(byName[0].id);
                targetTeacherName = `${byName[0].first_name || ""} ${byName[0].last_name || ""}`.trim();

                // Persist for next time
                await db.query(
                  "UPDATE public.users SET teacher_id = $1 WHERE id = $2",
                  [targetTeacherId, auth.id]
                );
                console.log(`[teacher/schedule] Matched by name → teacher_id=${targetTeacherId}`);
              }
            }
          }

          if (!targetTeacherId) {
            console.log(`[teacher/schedule] No teacher profile for user ${user.username}`);
            return send(res, 200, {
              schedule: { teacher_id: null, teacher_name: null, slots: [] },
              teacher: null,
              message: "No teacher profile linked to this account.",
            });
          }

          // ── Step 4: Fetch ALL schedules and filter slots ──
          const { rows: allSchedules } = await db.query("SELECT * FROM schedules");

          const mySlots = [];
          const normalizedTargetName = normalizeTeacherName(targetTeacherName);

          allSchedules.forEach(sched => {
            const slots = safeJsonParse(sched.slots, []);
            slots.forEach(slot => {
              // Match #1 — by teacherId (from slot OR row owner)
              const slotTeacherId = slot.teacherId != null ? slot.teacherId : sched.teacher_id;
              const idMatch = String(slotTeacherId) === String(targetTeacherId);

              // Match #2 — by teacherName (fallback safety net)
              const slotName = slot.teacherName || slot.teacher || "";
              const nameMatch = normalizedTargetName &&
                normalizeTeacherName(slotName) === normalizedTargetName;

              if (idMatch || nameMatch) {
                mySlots.push(slot);
              }
            });
          });

          console.log(`[teacher/schedule] Returning ${mySlots.length} slots for teacher ${targetTeacherId} ("${targetTeacherName}")`);

          // ── Step 5: Get teacher details ──
          const { rows: teacherRows } = await db.query(
            "SELECT * FROM teachers WHERE id = $1",
            [targetTeacherId]
          );

          return send(res, 200, {
            schedule: {
              teacher_id: targetTeacherId,
              teacher_name: targetTeacherName,
              slots: mySlots,
            },
            teacher: teacherRows[0] || null,
          });
        } catch (err) {
          console.error("[teacher] schedule error:", err);
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

          return send(res, 200, { students, sections: sectionList });
        } catch (err) {
          console.error("[teacher] get students error:", err);
          return send(res, 500, { error: err.message });
        }
      }

      if (pathname === "/api/teacher/students" && req.method === "POST") {
        if (!rateLimit(req, res, { windowMs: 60_000, maxRequests: 20, keyPrefix: "student-create" })) return;
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
          console.error("[teacher] add student error:", err);
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
          if (studentRows.length === 0) return send(res, 404, { error: "Student not found." });

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
          console.error("[teacher] update student error:", err);
          return send(res, 500, { error: err.message });
        }
      }

      if (pathname.match(/^\/api\/teacher\/students\/[^/]+$/) && req.method === "DELETE") {
        try {
          const studentId = pathname.split("/").pop();
          const result = await db.query("DELETE FROM students WHERE id = $1", [studentId]);
          if (result.rowCount === 0) return send(res, 404, { error: "Student not found." });
          return send(res, 200, { success: true });
        } catch (err) {
          console.error("[teacher] delete student error:", err);
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
          console.error("[teacher] rooms error:", err);
          return send(res, 500, { error: err.message });
        }
      }
    }

    return send(res, 404, { error: "API route not found" });
  }

  // ── Static files ──
  const frontendBase = path.resolve(__dirname, "../frontend");

  if (pathname === "/" || pathname === "/login.html") {
    res.writeHead(302, { Location: "/auth/login.html" });
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
  console.log(`[server] ready: http://localhost:${PORT}`);

  db.initDatabase()
    .then(() => initAdmin())
    .catch((err) => console.error("[init] startup error:", err.message));
});
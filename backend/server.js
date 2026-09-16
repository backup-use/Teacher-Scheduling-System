const http = require("http");
const url = require("url");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { db } = require("./db"); // Adjust path if your db connection module is located elsewhere

const PORT = process.env.PORT || 3000;

// ── Utility Helpers ──

function send(res, status, data, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function safeJsonParse(data, fallback = []) {
  if (typeof data !== "string") return data || fallback;
  try {
    return JSON.parse(data);
  } catch (e) {
    return fallback;
  }
}

function sanitizeTime(timeStr) {
  if (!timeStr) return "08:00";
  return timeStr.trim();
}

function genId() {
  return crypto.randomBytes(8).toString("hex");
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function getAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  try {
    return JSON.parse(Buffer.from(token, "base64").toString("ascii"));
  } catch (e) {
    return null;
  }
}

async function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
  };
  const contentType = mimeTypes[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Server Error");
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    }
  });
}

// Dummy helper for schedule generation
async function generateSchedule(teacher) {
  return [
    {
      id: genId(),
      day: "Monday",
      startTime: teacher.start_time || "08:00 AM",
      endTime: teacher.end_time || "09:00 AM",
      subject: safeJsonParse(teacher.subjects, ["General"])[0] || "General",
      room: "Room 101",
      section: "Section A",
      status: "scheduled",
    },
  ];
}

// Dummy helper for email notifications
function sendCredentialsEmail(email, name, username, password, details) {
  console.log(`📧 Credentials sent to ${email} for user: ${username}`);
}

// ── Database Initializer ──

async function initAdmin() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        name VARCHAR(255),
        teacher_id VARCHAR(255),
        email VARCHAR(255)
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS teachers (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        email VARCHAR(255),
        subjects TEXT,
        target_grade VARCHAR(50),
        work_days TEXT,
        start_time VARCHAR(50),
        end_time VARCHAR(50),
        availability TEXT,
        employee_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS schedules (
        id SERIAL PRIMARY KEY,
        teacher_id VARCHAR(255),
        slots TEXT,
        generated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    const adminCheck = await db.query("SELECT * FROM users WHERE role = $1", ["admin"]);
    if (adminCheck.rows.length === 0) {
      await db.query(
        "INSERT INTO users (id, username, password, role, name) VALUES ($1, $2, $3, $4, $5)",
        ["usr-admin", "admin", hashPassword("admin123"), "admin", "System Administrator"]
      );
      console.log("🔑 Default admin created: admin / admin123");
    }
  } catch (err) {
    console.error("❌ Database initialization error:", err.message);
  }
}

// ── HTTP Server Request Handler ──

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // ── API Router ──

  if (pathname.startsWith("/api/")) {
    
    // Auth: Login
    if (pathname === "/api/login" && req.method === "POST") {
      try {
        const body = await parseBody(req);
        const { username, password } = body;
        const { rows } = await db.query("SELECT * FROM users WHERE username = $1", [username]);
        const user = rows[0];

        if (!user || user.password !== hashPassword(password)) {
          return send(res, 401, { error: "Invalid username or password" });
        }

        const tokenPayload = { id: user.id, username: user.username, role: user.role, teacherId: user.teacher_id };
        const token = Buffer.from(JSON.stringify(tokenPayload)).toString("base64");

        return send(res, 200, { success: true, token, user: tokenPayload });
      } catch (err) {
        return send(res, 500, { error: err.message });
      }
    }

    // ── Admin Routes ──

    if (pathname.startsWith("/api/admin/")) {
      const auth = getAuth(req);
      if (!auth || auth.role !== "admin") {
        return send(res, 403, { error: "Forbidden: Admin access required." });
      }

      // POST /api/admin/teachers (CREATE TEACHER)
      if (pathname === "/api/admin/teachers" && req.method === "POST") {
        try {
          const body = await parseBody(req);
          const firstName = (body.firstName || body.first_name || "").trim();
          const lastName = (body.lastName || body.last_name || "").trim();
          const email = (body.email || "").trim().toLowerCase();
          const username = (body.username || `${firstName.toLowerCase()}.${lastName.toLowerCase()}`).trim();
          const password = body.password || "Teacher123!";
          const employeeId = body.employeeId || `EMP-${genId().slice(0, 4)}`;
          const targetGrade = body.targetGrade || body.target_grade || "";

          const rawSubjects = body.subjects || [];
          const subjectsJSON = JSON.stringify(Array.isArray(rawSubjects) ? rawSubjects : [rawSubjects].filter(Boolean));
          const workDaysJSON = JSON.stringify(Array.isArray(body.workDays) ? body.workDays : []);

          let availabilityArray = [];
          if (typeof body.availability === "string") {
            try { availabilityArray = JSON.parse(body.availability); } catch (e) { availabilityArray = []; }
          } else if (Array.isArray(body.availability)) {
            availabilityArray = body.availability;
          }

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

          await db.query(
            "INSERT INTO users (id, username, password, role, name, teacher_id, email) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            [userId, username, hashPassword(password), "teacher", `${firstName} ${lastName}`, teacherIdStr, email]
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
          return send(res, 500, { error: err.message, details: err.stack });
        }
      }

      // PUT /api/admin/teachers/:id (UPDATE TEACHER)
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

      // POST /api/admin/schedules/save-bulk (TRANSACTION WRAPPED)
      if (pathname === "/api/admin/schedules/save-bulk" && req.method === "POST") {
        try {
          const body = await parseBody(req);
          const compiledSchedules = body.schedules;

          if (!compiledSchedules || typeof compiledSchedules !== "object") {
            return send(res, 400, { error: "Malformed schedule payload matrix." });
          }

          // Begin SQL Transaction to prevent accidental data erasure on parse errors
          await db.query("BEGIN");

          await db.query("DELETE FROM schedules");
          const { rows: teachers } = await db.query("SELECT * FROM teachers");

          for (const [fullName, scheduleObj] of Object.entries(compiledSchedules)) {
            const foundTeacher = teachers.find(
              (t) =>
                `${t.first_name} ${t.last_name}` === fullName ||
                `${t.firstName} ${t.lastName}` === fullName
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

          await db.query("COMMIT");

          return send(res, 200, {
            success: true,
            message: "Master timetable saved directly to PostgreSQL!",
          });
        } catch (err) {
          await db.query("ROLLBACK");
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

    // ── Global Timetable Endpoint for Dashboards ──

    if (pathname === "/api/timetable" && req.method === "GET") {
      try {
        const auth = getAuth(req);
        if (!auth) return send(res, 401, { error: "Unauthorized access token." });

        const flattenedOutputMatrix = [];
        const { rows: schedules } = await db.query("SELECT * FROM schedules");
        const { rows: teachers } = await db.query("SELECT * FROM teachers");

        schedules.forEach((scheduleSet) => {
          const structuralTeacher = teachers.find(
            (t) => String(t.id) === String(scheduleSet.teacher_id)
          );

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

    // ── Teacher-Only Routes ──

    if (pathname.startsWith("/api/teacher/")) {
      const auth = getAuth(req);
      if (!auth || auth.role !== "teacher") {
        return send(res, 403, { error: "Forbidden: Teacher access required." });
      }

      if (pathname === "/api/teacher/schedule" && req.method === "GET") {
        try {
          const { rows: userRows } = await db.query(
            "SELECT teacher_id FROM users WHERE id = $1",
            [auth.id]
          );

          const targetTeacherId = userRows[0]?.teacher_id;
          if (!targetTeacherId) {
            return send(res, 404, { error: "No associated teacher profile found for this user." });
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

  const frontendBase = path.join(__dirname, "../frontend");

  if (pathname === "/" || pathname === "/login.html") {
    res.writeHead(302, { Location: "/shared/login.html" });
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

// Test Supabase Database Connection

db.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("❌ Supabase Connection Failed:", err.message);
  } else {
    console.log("✅ Successfully connected to Supabase PostgreSQL at:", res.rows[0].now);
  }
});
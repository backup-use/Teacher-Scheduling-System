const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("./db");

const PORT = process.env.PORT || 3000;

// ── Utility Helpers ──

function send(res, status, data, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...headers,
  });
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
    const payload = JSON.parse(Buffer.from(token, "base64").toString("ascii"));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
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

function sanitizeTime(timeStr) {
  if (!timeStr || typeof timeStr !== "string" || timeStr.trim() === "") return "08:00";
  let t = timeStr.trim().toLowerCase();
  let isPM = t.includes("pm");
  let isAM = t.includes("am");
  let nums = t.replace(/[^0-9:]/g, "").split(":");
  let h = parseInt(nums[0], 10) || 8;
  let m = nums[1] ? parseInt(nums[1], 10) : 0;
  if (isPM && h !== 12) h += 12;
  if (isAM && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
    ".svg": "image/svg+xml",
  };
  const contentType = mimeTypes[ext] || "text/plain";
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

async function generateSchedule(teacher) {
  const days = safeJsonParse(teacher.work_days || teacher.workDays, ["Monday", "Wednesday", "Friday"]);
  const subjects = safeJsonParse(teacher.subjects, ["General Subject"]);
  const slots = [];

  days.forEach((day, idx) => {
    slots.push({
      id: crypto.randomBytes(4).toString("hex"),
      day,
      startTime: teacher.start_time || teacher.startTime || "08:00 AM",
      endTime: teacher.end_time || teacher.endTime || "09:00 AM",
      subject: subjects[idx % subjects.length] || "General Subject",
      room: "Room 101",
      section: "Section A",
      status: "scheduled",
    });
  });

  return slots;
}

async function initAdmin() {
  try {
    const { rows } = await db.query("SELECT id FROM users WHERE username = $1", ["admin"]);
    if (rows.length === 0) {
      const adminId = "usr-" + genId();
      await db.query(
        "INSERT INTO users (id, username, password, role, name) VALUES ($1, $2, $3, $4, $5)",
        [adminId, "admin", hashPassword("admin123"), "admin", "System Administrator"]
      );
      console.log("✅ Admin account initialized: admin / admin123");
    }
  } catch (err) {
    console.error("❌ Error initializing admin:", err.message);
  }
}

// ── Main Server Router ──

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    return res.end();
  }

  // ── API Routes ──
  if (pathname.startsWith("/api/")) {

    // Auth: Login
    if (pathname === "/api/auth/login" && req.method === "POST") {
      try {
        const body = await parseBody(req);
        const { username, password } = body;

        if (!username || !password) {
          return send(res, 400, { error: "Username and password required." });
        }

        const hashedPassword = hashPassword(password);
        const { rows } = await db.query(
          "SELECT id, username, role, name, teacher_id FROM users WHERE username = $1 AND password = $2",
          [username, hashedPassword]
        );

        if (rows.length === 0) {
          return send(res, 401, { error: "Invalid credentials." });
        }

        const user = rows[0];
        const tokenPayload = {
          id: user.id,
          username: user.username,
          role: user.role,
          teacherId: user.teacher_id,
          exp: Date.now() + 24 * 60 * 60 * 1000,
        };
        const token = Buffer.from(JSON.stringify(tokenPayload)).toString("base64");

        return send(res, 200, { token, user, role: user.role, name: user.name, teacherId: user.teacher_id });
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

      // POST /api/admin/generate-schedule
      if (pathname === "/api/admin/generate-schedule" && req.method === "POST") {
        try {
          const { rows: teachers } = await db.query("SELECT * FROM teachers");
          const generatedSchedules = [];

          for (const teacher of teachers) {
            const slots = await generateSchedule(teacher);
            const teacherIdStr = String(teacher.id);

            await db.query(
              `INSERT INTO schedules (teacher_id, slots, generated_at) 
               VALUES ($1, $2, NOW()) 
               ON CONFLICT (teacher_id) DO UPDATE SET slots = EXCLUDED.slots, generated_at = NOW()`,
              [teacherIdStr, JSON.stringify(slots)]
            );

            generatedSchedules.push({ teacherId: teacher.id, teacherName: `${teacher.first_name} ${teacher.last_name}`, slots });
          }

          return send(res, 200, { success: true, message: "Timetable generated successfully.", schedules: generatedSchedules });
        } catch (err) {
          console.error("❌ Schedule Generation Error:", err);
          return send(res, 500, { error: err.message });
        }
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

          const resInsert = await db.query("INSERT INTO subjects (name, grade_level) VALUES ($1, $2) RETURNING *", [name, gradeLevel]);
          const { rows } = await db.query("SELECT * FROM subjects ORDER BY id DESC");
          const normalized = rows.map((s) => ({ id: s.id, name: s.name || "", gradeLevel: s.grade_level || "" }));

          return send(res, 201, { success: true, subject: resInsert.rows[0], subjects: normalized });
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
            SELECT s.id, s.name, s.students, s.grade_level AS "gradeLevel",
                   s.room_id AS "roomId", r.name AS "roomName", r.capacity AS "roomCapacity"
            FROM sections s
            LEFT JOIN rooms r ON CAST(s.room_id AS VARCHAR) = CAST(r.id AS VARCHAR)
            ORDER BY s.name ASC`;
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

          if (!sectionName) return send(res, 400, { error: "Section Name is required." });
          const roomId = roomIdRaw && !isNaN(parseInt(roomIdRaw, 10)) ? parseInt(roomIdRaw, 10) : null;

          const existing = await db.query("SELECT id FROM sections WHERE LOWER(TRIM(name)) = LOWER($1)", [sectionName]);
          if (existing.rows.length > 0) return send(res, 400, { error: "This section already exists." });

          await db.query("INSERT INTO sections (name, students, grade_level, room_id) VALUES ($1, $2, $3, $4)", [sectionName, students, gradeLevel, roomId]);
          const { rows } = await db.query(`
            SELECT s.id, s.name, s.students, s.grade_level AS "gradeLevel",
                   s.room_id AS "roomId", r.name AS "roomName"
            FROM sections s
            LEFT JOIN rooms r ON CAST(s.room_id AS VARCHAR) = CAST(r.id AS VARCHAR)
            ORDER BY s.name ASC`);
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
          const normalized = rows.map((r) => ({ id: r.id, name: r.name || r.room_name || "", capacity: r.capacity || r.max_capacity || 0 }));
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

          if (!roomName || isNaN(capacity)) return send(res, 400, { error: "Valid Room Name and Capacity are required." });

          const existing = await db.query("SELECT id FROM rooms WHERE LOWER(TRIM(name)) = LOWER($1)", [roomName]);
          if (existing.rows.length > 0) return send(res, 400, { error: "This room already exists." });

          const resInsert = await db.query("INSERT INTO rooms (name, capacity) VALUES ($1, $2) RETURNING *", [roomName, capacity]);
          const { rows } = await db.query("SELECT * FROM rooms ORDER BY id DESC");
          const normalized = rows.map((r) => ({ id: r.id, name: r.name || "", capacity: r.capacity || 0 }));

          return send(res, 201, { success: true, room: resInsert.rows[0], rooms: normalized });
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
          if (nameCheck.rows.length > 0) return send(res, 400, { error: `Teacher "${firstName} ${lastName}" is already registered!` });

          let baseUsername = (firstName.toLowerCase() + "." + lastName.toLowerCase()).replace(/\s+/g, "");
          let username = baseUsername;
          const existingUser = await db.query("SELECT id FROM users WHERE username = $1", [username]);
          if (existingUser.rows.length > 0) username = `${baseUsername}${Math.floor(100 + Math.random() * 900)}`;

          const password = "teacher" + Math.floor(1000 + Math.random() * 9000);
          const employeeId = "EMP-" + Math.floor(1000 + Math.random() * 9000);

          const rawSubjects = Array.isArray(body.subjects) ? body.subjects : [body.subjects].filter(Boolean);
          const subjectsJSON = JSON.stringify(rawSubjects);
          const workDaysJSON = JSON.stringify(Array.isArray(body.workDays) ? body.workDays : []);
          const targetGrade = body.targetGrade || body.target_grade || "";

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

          await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);");
          await db.query(
            "INSERT INTO users (id, username, password, role, name, teacher_id, email) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            [userId, username, hashPassword(password), "teacher", `${firstName} ${lastName}`, teacherIdStr, email]
          );

          const slots = await generateSchedule(newTeacher);
          await db.query("INSERT INTO schedules (teacher_id, slots, generated_at) VALUES ($1, $2, NOW())", [teacherIdStr, JSON.stringify(slots)]);

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
          const startTime = sanitizeTime(body.startTime || body.start_time || existing.start_time);
          const endTime = sanitizeTime(body.endTime || body.end_time || existing.end_time);

          const rawSubjects = body.subjects !== undefined ? body.subjects : safeJsonParse(existing.subjects, []);
          const subjectsJSON = JSON.stringify(Array.isArray(rawSubjects) ? rawSubjects : [rawSubjects].filter(Boolean));

          const rawWorkDays = body.workDays !== undefined ? body.workDays : body.work_days !== undefined ? body.work_days : safeJsonParse(existing.work_days, []);
          const workDaysJSON = JSON.stringify(Array.isArray(rawWorkDays) ? rawWorkDays : []);

          const rawAvailability = body.availability !== undefined ? body.availability : safeJsonParse(existing.availability, []);
          const formattedAvailability = Array.isArray(rawAvailability)
            ? rawAvailability.map((item) => ({ day: item.day || "Monday", from: sanitizeTime(item.from), to: sanitizeTime(item.to) }))
            : [];
          const availabilityJSON = JSON.stringify(formattedAvailability);

          await db.query(
            `UPDATE teachers
             SET first_name = $1, last_name = $2, email = $3, subjects = $4,
                 target_grade = $5, work_days = $6, start_time = $7, end_time = $8, availability = $9
             WHERE id = $10`,
            [firstName, lastName, email, subjectsJSON, targetGrade, workDaysJSON, startTime, endTime, availabilityJSON, id]
          );

          await db.query(`UPDATE users SET name = $1, email = $2 WHERE teacher_id = $3`, [`${firstName} ${lastName}`, email, String(id)]);

          const updatedResult = await db.query("SELECT * FROM teachers WHERE id = $1", [id]);
          const updatedTeacher = updatedResult.rows[0];

          const newSlots = await generateSchedule({
            ...updatedTeacher,
            workDays: safeJsonParse(updatedTeacher.work_days, []),
            subjects: safeJsonParse(updatedTeacher.subjects, []),
            availability: safeJsonParse(updatedTeacher.availability, []),
          });

          await db.query(
            `INSERT INTO schedules (teacher_id, slots, generated_at) 
             VALUES ($1, $2, NOW())
             ON CONFLICT (teacher_id) DO UPDATE SET slots = EXCLUDED.slots, generated_at = NOW()`,
            [String(id), JSON.stringify(newSlots)]
          );

          return send(res, 200, { success: true, teacher: updatedTeacher, schedule: { teacherId: id, slots: newSlots } });
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

      // POST /api/admin/schedules/save-bulk (Transaction Safe)
      if (pathname === "/api/admin/schedules/save-bulk" && req.method === "POST") {
        const client = await db.connect();
        try {
          const body = await parseBody(req);
          const compiledSchedules = body.schedules;

          if (!compiledSchedules || typeof compiledSchedules !== "object") {
            return send(res, 400, { error: "Malformed schedule payload matrix." });
          }

          await client.query("BEGIN");
          await client.query("DELETE FROM schedules");

          const { rows: teachers } = await client.query("SELECT id, first_name, last_name FROM teachers");

          for (const [fullName, scheduleObj] of Object.entries(compiledSchedules)) {
            const foundTeacher = teachers.find(
              (t) => `${t.first_name} ${t.last_name}`.trim().toLowerCase() === fullName.trim().toLowerCase()
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

              await client.query(
                "INSERT INTO schedules (teacher_id, slots, generated_at) VALUES ($1, $2, NOW())",
                [String(foundTeacher.id), JSON.stringify(parsedSlots)]
              );
            }
          }

          await client.query("COMMIT");
          return send(res, 200, { success: true, message: "Master timetable saved directly to PostgreSQL!" });
        } catch (err) {
          await client.query("ROLLBACK");
          return send(res, 500, { error: err.message });
        } finally {
          client.release();
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
             VALUES ($1, $2, NOW())
             ON CONFLICT (teacher_id) DO UPDATE SET slots = EXCLUDED.slots, generated_at = NOW()`,
            [String(id), JSON.stringify(newSlots)]
          );

          return send(res, 200, { teacherId: id, slots: newSlots });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      }
    }

    // ── Global Timetable Endpoint ──
    if (pathname === "/api/timetable" && req.method === "GET") {
      try {
        const auth = getAuth(req);
        if (!auth) return send(res, 401, { error: "Unauthorized access token." });

        const queryText = `
          SELECT s.slots, t.first_name, t.last_name 
          FROM schedules s
          LEFT JOIN teachers t ON String(t.id) = String(s.teacher_id)
        `;
        const { rows } = await db.query(queryText);

        const flattenedOutputMatrix = rows.flatMap((row) => {
          const instructorName = row.first_name ? `${row.first_name} ${row.last_name}` : "Unknown Instructor";
          const slots = safeJsonParse(row.slots, []);

          return Array.isArray(slots)
            ? slots.map((slot) => ({
                id: slot.id,
                instructor: instructorName,
                subject: slot.subject,
                section: slot.section,
                room: slot.room,
                day: slot.day,
                timeSlot: `${slot.startTime} to ${slot.endTime}`,
              }))
            : [];
        });

        return send(res, 200, flattenedOutputMatrix);
      } catch (err) {
        return send(res, 500, { error: err.message });
      }
    }

    // ── Teacher-Only Routes ──
    if (pathname.startsWith("/api/teacher/")) {
      const auth = getAuth(req);

      if (!auth || auth.role !== "teacher") return send(res, 403, { error: "Forbidden" });

      if (pathname === "/api/teacher/schedule" && req.method === "GET") {
        try {
          const { rows: userRows } = await db.query("SELECT teacher_id FROM users WHERE id = $1", [auth.id]);
          const targetTeacherId = userRows[0]?.teacher_id;

          if (!targetTeacherId) return send(res, 404, { error: "No teacher profile associated with this user." });

          const { rows: teacherRows } = await db.query("SELECT * FROM teachers WHERE id = $1", [targetTeacherId]);
          const { rows: schedRows } = await db.query("SELECT * FROM schedules WHERE teacher_id = $1", [String(targetTeacherId)]);

          const scheduleObj = schedRows[0]
            ? { ...schedRows[0], slots: safeJsonParse(schedRows[0].slots, []) }
            : null;

          return send(res, 200, { schedule: scheduleObj, teacher: teacherRows[0] || null });
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
  console.log(`\n🚀 Scheduler running locally at http://localhost:${PORT}`);
  console.log(`🔐 Admin login: admin / admin123`);
});

db.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("❌ PostgreSQL Connection Failed:", err.message);
  } else {
    console.log("✅ Successfully connected to PostgreSQL at:", res.rows[0].now);
  }
});
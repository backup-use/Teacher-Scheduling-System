const http = require("http");
const url = require("url");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// Safe Import handling both named and default pool exports from ./db.js
const dbModule = require("./db");
const db = dbModule.db || dbModule.pool || dbModule;
const { initAdmin, genId, hashPassword, signToken, verifyToken } = dbModule;

const PORT = process.env.PORT || 3000;

// Helper: Parse JSON body securely
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
  });
}

// Helper: Send JSON response
function send(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// Helper: Serve Static Files
function serveFile(res, filePath) {
  const ext = path.extname(filePath);
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
      res.writeHead(500);
      res.end(`Server Error: ${err.code}`);
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content, "utf-8");
    }
  });
}

// Helper: Safe JSON Parse to prevent crashes on non-JSON/double-stringified input
function safeJsonParse(data, fallback = []) {
  if (typeof data !== "string") return data || fallback;
  try {
    const parsed = JSON.parse(data);
    return typeof parsed === "string" ? safeJsonParse(parsed, fallback) : parsed;
  } catch (e) {
    return fallback;
  }
}

// Helper: Extract Auth Bearer Token
function getAuth(req) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return verifyToken(authHeader.split(" ")[1]);
}

// Helper: Schedule Generator
async function generateSchedule(teacher) {
  const days = Array.isArray(teacher.work_days) 
    ? teacher.work_days 
    : safeJsonParse(teacher.work_days, ["Monday", "Wednesday", "Friday"]);
    
  const subjects = Array.isArray(teacher.subjects) 
    ? teacher.subjects 
    : safeJsonParse(teacher.subjects, ["General Subject"]);

  const slots = [];
  days.forEach((day, index) => {
    slots.push({
      id: crypto.randomBytes(4).toString("hex"),
      day: day,
      startTime: "08:00 AM",
      endTime: "10:00 AM",
      subject: subjects[index % subjects.length] || "General Subject",
      room: `Room ${101 + index}`,
      section: `Section ${String.fromCharCode(65 + index)}`,
      status: "scheduled"
    });
  });
  return slots;
}

// Dummy email sender stub
function sendCredentialsEmail(email, name, username, password, details) {
  console.log(`📧 Credentials Email sent to ${email} for user ${username}`);
}

// Server Main Handler
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Enable CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // ── Authentication Routes ──
  if (pathname === "/api/login" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const { username, password } = body;

      const { rows } = await db.query("SELECT * FROM users WHERE username = $1", [username]);
      if (rows.length === 0) return send(res, 401, { error: "Invalid username or password" });

      const user = rows[0];
      if (user.password !== hashPassword(password)) {
        return send(res, 401, { error: "Invalid username or password" });
      }

      const token = signToken({ 
        id: user.id, 
        role: user.role, 
        name: user.name, 
        teacher_id: user.teacher_id 
      });

      return send(res, 200, {
        token,
        user: { 
          id: user.id, 
          username: user.username, 
          role: user.role, 
          name: user.name, 
          teacherId: user.teacher_id 
        }
      });
    } catch (err) {
      return send(res, 500, { error: err.message });
    }
  }

  // ── Admin Routes ──
  if (pathname.startsWith("/api/admin/")) {
    const auth = getAuth(req);
    if (!auth || auth.role !== "admin") return send(res, 403, { error: "Forbidden: Admin access required" });

    // GET /api/admin/teachers
    if (pathname === "/api/admin/teachers" && req.method === "GET") {
      try {
        const { rows } = await db.query("SELECT * FROM teachers ORDER BY id DESC");
        const formatted = rows.map(t => ({
          ...t,
          subjects: safeJsonParse(t.subjects, []),
          workDays: safeJsonParse(t.work_days, []),
          availability: safeJsonParse(t.availability, [])
        }));
        return send(res, 200, formatted);
      } catch (err) {
        return send(res, 500, { error: err.message });
      }
    }

    // POST /api/admin/teachers (REGISTER TEACHER)
    if (pathname === "/api/admin/teachers" && req.method === "POST") {
      try {
        const body = await parseBody(req);
        const firstName = (body.firstName || body.first_name || "").trim();
        const lastName = (body.lastName || body.last_name || "").trim();
        const email = (body.email || "").trim().toLowerCase();
        const username = (body.username || `${firstName.toLowerCase()}${lastName.toLowerCase()}`).trim();
        const password = body.password || "teacher123";

        const rawSubjects = body.subjects || [];
        const subjectsJSON = JSON.stringify(Array.isArray(rawSubjects) ? rawSubjects : [rawSubjects].filter(Boolean));
        const workDaysJSON = JSON.stringify(Array.isArray(body.workDays) ? body.workDays : []);
        const availabilityJSON = JSON.stringify(Array.isArray(body.availability) ? body.availability : []);

        const teacherResult = await db.query(
          `INSERT INTO teachers (first_name, last_name, email, subjects, target_grade, work_days, start_time, end_time, availability)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [
            firstName, lastName, email, subjectsJSON, 
            body.targetGrade || "", workDaysJSON, 
            body.startTime || "08:00", body.endTime || "16:00", availabilityJSON
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
          sendCredentialsEmail(email, `${firstName} ${lastName}`, username, password, {
            subjects: rawSubjects,
            workDays: Array.isArray(body.workDays) ? body.workDays : [],
            startTime: body.startTime,
            endTime: body.endTime
          });
        }

        return send(res, 201, { 
          success: true,
          teacher: newTeacher, 
          credentials: { username, password }, 
          schedule: { teacherId: newTeacher.id, slots } 
        });
      } catch (err) {
        console.error('❌ Teacher registration error:', err);
        return send(res, 500, { error: err.message, details: err.stack });
      }
    }

    // PUT /api/admin/teachers/:id (UPDATE TEACHER)
    if (pathname.match(/^\/api\/admin\/teachers\/[^/]+$/) && req.method === "PUT") {
      try {
        const id = pathname.split("/").pop();
        const body = await parseBody(req);

        const { rows } = await db.query("SELECT * FROM teachers WHERE id::text = $1::text", [String(id)]);
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

        const rawWorkDays = body.workDays !== undefined ? body.workDays : (body.work_days !== undefined ? body.work_days : safeJsonParse(existing.work_days, []));
        const workDaysJSON = JSON.stringify(Array.isArray(rawWorkDays) ? rawWorkDays : []);

        const rawAvailability = body.availability !== undefined ? body.availability : safeJsonParse(existing.availability, []);
        const availabilityJSON = JSON.stringify(Array.isArray(rawAvailability) ? rawAvailability : []);

        await db.query(
          `UPDATE teachers 
           SET first_name = $1, last_name = $2, email = $3, subjects = $4, 
               target_grade = $5, work_days = $6, start_time = $7, end_time = $8, availability = $9
           WHERE id::text = $10::text`,
          [firstName, lastName, email, subjectsJSON, targetGrade, workDaysJSON, startTime, endTime, availabilityJSON, String(id)]
        );

        const updatedResult = await db.query("SELECT * FROM teachers WHERE id::text = $1::text", [String(id)]);
        const updatedTeacher = updatedResult.rows[0];

        const newSlots = await generateSchedule({
          ...updatedTeacher,
          workDays: safeJsonParse(updatedTeacher.work_days, []),
          subjects: safeJsonParse(updatedTeacher.subjects, []),
          availability: safeJsonParse(updatedTeacher.availability, [])
        });

        await db.query("DELETE FROM schedules WHERE teacher_id::text = $1::text", [String(id)]);
        await db.query(
          `INSERT INTO schedules (teacher_id, slots, generated_at) VALUES ($1, $2, NOW())`,
          [String(id), JSON.stringify(newSlots)]
        );

        return send(res, 200, { success: true, teacher: updatedTeacher, schedule: { teacherId: id, slots: newSlots } });
      } catch (err) {
        console.error("❌ Error updating teacher:", err);
        return send(res, 500, { error: err.message });
      }
    }

    // DELETE /api/admin/teachers/:id
    if (pathname.match(/^\/api\/admin\/teachers\/[^/]+$/) && req.method === "DELETE") {
      try {
        const id = pathname.split("/").pop();
        await db.query("DELETE FROM teachers WHERE id::text = $1::text", [String(id)]);
        await db.query("DELETE FROM users WHERE teacher_id::text = $1::text OR id::text = $1::text", [String(id)]);
        await db.query("DELETE FROM schedules WHERE teacher_id::text = $1::text", [String(id)]);
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
          const foundTeacher = teachers.find(t => 
            `${t.first_name || ''} ${t.last_name || ''}`.trim().toLowerCase() === fullName.trim().toLowerCase() ||
            `${t.firstName || ''} ${t.lastName || ''}`.trim().toLowerCase() === fullName.trim().toLowerCase()
          );
          
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
        const { rows } = await db.query("SELECT * FROM teachers WHERE id::text = $1::text", [String(id)]);
        if (rows.length === 0) return send(res, 404, { error: "Teacher not found" });
        
        const newSlots = await generateSchedule(rows[0]);
        await db.query("DELETE FROM schedules WHERE teacher_id::text = $1::text", [String(id)]);
        await db.query(
          `INSERT INTO schedules (teacher_id, slots, generated_at) VALUES ($1, $2, NOW())`,
          [String(id), JSON.stringify(newSlots)]
        );

        return send(res, 200, { teacherId: id, slots: newSlots });
      } catch (err) {
        return send(res, 500, { error: err.message });
      }
    }
  }

  // ── Global Timetable Endpoint (FIXED PREVENT 500 ERROR) ──
  if (pathname === "/api/timetable" && req.method === "GET") {
    try {
      const auth = getAuth(req);
      if (!auth) return send(res, 401, { error: "Unauthorized access token." });

      const flattenedOutputMatrix = [];
      const { rows: schedules } = await db.query("SELECT * FROM schedules");
      const { rows: teachers } = await db.query("SELECT * FROM teachers");

      schedules.forEach(scheduleSet => {
        const structuralTeacher = teachers.find(t => String(t.id) === String(scheduleSet.teacher_id));
        
        let instructorName = "Unknown Instructor";
        if (structuralTeacher) {
          const fName = structuralTeacher.first_name || structuralTeacher.firstName || "";
          const lName = structuralTeacher.last_name || structuralTeacher.lastName || "";
          instructorName = `${fName} ${lName}`.trim() || structuralTeacher.name || "Unknown Instructor";
        }

        const slots = safeJsonParse(scheduleSet.slots, []);

        if (Array.isArray(slots)) {
          slots.forEach(slot => {
            const rawTime = slot.time || slot.timeSlot || `${slot.startTime || ''} - ${slot.endTime || ''}`;
            flattenedOutputMatrix.push({
              id: slot.id || crypto.randomBytes(4).toString("hex"),
              instructor: instructorName,
              subject: slot.subject || "General Subject",
              section: slot.section || "N/A",
              room: slot.room || "TBD",
              day: slot.day || "N/A",
              time: rawTime,
              timeSlot: rawTime.replace(" - ", " to ")
            });
          });
        }
      });

      return send(res, 200, flattenedOutputMatrix);
    } catch (err) {
      console.error("❌ /api/timetable crash:", err);
      return send(res, 500, { error: err.message });
    }
  }

  // ── Teacher-only Routes ──
  if (pathname.startsWith("/api/teacher/")) {
    const auth = getAuth(req);
    if (!auth || auth.role !== "teacher") return send(res, 403, { error: "Forbidden access" });

    // GET /api/teacher/schedule
    if (pathname === "/api/teacher/schedule" && req.method === "GET") {
      try {
        const { rows: userRows } = await db.query("SELECT teacher_id FROM users WHERE id::text = $1::text", [String(auth.id)]);
        const targetTeacherId = userRows[0]?.teacher_id || auth.teacher_id || auth.id;

        const { rows: schedRows } = await db.query(
          "SELECT * FROM schedules WHERE teacher_id::text = $1::text ORDER BY generated_at DESC LIMIT 1", 
          [String(targetTeacherId)]
        );
        
        const { rows: teacherRows } = await db.query(
          "SELECT * FROM teachers WHERE id::text = $1::text", 
          [String(targetTeacherId)]
        );

        const teacherObj = teacherRows[0] || null;
        const rawSlots = schedRows[0] ? safeJsonParse(schedRows[0].slots, []) : [];
        const instructorName = teacherObj 
          ? `${teacherObj.first_name || teacherObj.firstName} ${teacherObj.last_name || teacherObj.lastName}`.trim() 
          : auth.name;

        const formattedSlots = rawSlots.map(slot => ({
          id: slot.id || crypto.randomBytes(4).toString("hex"),
          day: slot.day || 'N/A',
          time: `${slot.startTime || ''} - ${slot.endTime || ''}`.trim(),
          timeSlot: `${slot.startTime || ''} to ${slot.endTime || ''}`.trim(),
          startTime: slot.startTime || '',
          endTime: slot.endTime || '',
          subject: slot.subject || 'General Class',
          room: slot.room || 'TBD',
          section: slot.section || 'N/A',
          instructor: instructorName
        }));

        return send(res, 200, { 
          success: true,
          teacher: teacherObj,
          schedule: schedRows[0] ? { ...schedRows[0], slots: formattedSlots } : null, 
          slots: formattedSlots
        });
      } catch (err) {
        console.error("❌ Teacher Schedule Fetch Error:", err);
        return send(res, 500, { error: err.message });
      }
    }
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

  return send(res, 404, { error: "API route not found" });
});

server.listen(PORT, "0.0.0.0", async () => {
  if (typeof initAdmin === "function") {
    await initAdmin();
  }
  console.log(`\n Scheduler running locally at http://localhost:${PORT}`);
  console.log(` Admin login: admin / admin123`);
});

// Test connection on server start
if (db && typeof db.query === "function") {
  db.query("SELECT NOW()", (err, res) => {
    if (err) {
      console.error("❌ Database Connection Failed:", err.message);
    } else {
      console.log("✅ Successfully connected to PostgreSQL at:", res.rows[0].now);
    }
  });
}
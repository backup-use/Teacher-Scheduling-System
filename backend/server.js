const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = 3000;
const DB_FILE = path.join(__dirname, "db.json");

// ─── Tiny DB ────────────────────────────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const init = {
      users: [
        {
          id: "admin-001",
          username: "admin",
          password: hashPassword("admin123"),
          role: "admin",
          name: "Administrator",
        },
      ],
      schoolSubjects: ["Math", "Science", "English", "History", "ICT"], // Master School List
      teachers: [],
      schedules: [],
      rooms: [],    // Initialized permanent rooms array registry
      sections: []  // Initialized permanent sections array registry
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function hashPassword(pw) {
  return crypto.createHash("sha256").update(pw + "salt_key_2024").digest("hex");
}

// Generates an 8-byte hex string for strong, reliable matching
function genId() {
  return crypto.randomBytes(8).toString("hex");
}

// ─── JWT-lite (HMAC tokens) ──────────────────────────────────────────────────
const SECRET = "scheduler_secret_2024_xyz";

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

// ─── Schedule Generator ──────────────────────────────────────────────────────
function generateSchedule(teacher) {
  const db = loadDB();
  const slots = [];
  const days = teacher.workDays || [];
  
  const startTime = teacher.startTime || "08:00";
  const endTime = teacher.endTime || "16:00";
  const timeSlots = generateTimeSlots(startTime, endTime, 60);

  const availableSchoolSubjects = db.schoolSubjects || ["Math", "Science", "English", "History", "ICT"];
  const validSubjects = (teacher.subjects || []).filter(sub => availableSchoolSubjects.includes(sub));
  
  const primarySubject = validSubjects.length > 0 ? validSubjects[0] : ((teacher.subjects && teacher.subjects[0]) || "General Class");

  days.forEach((day) => {
    timeSlots.forEach((slot) => {
      const availabilityList = teacher.availability || [];
      const isAvailable = availabilityList.some(
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

// ─── Router Helper Utils ─────────────────────────────────────────────────────
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
    const db = loadDB();

    // POST /api/login
    if (pathname === "/api/login" && req.method === "POST") {
      const body = await parseBody(req);
      const user = db.users.find(
        (u) => u.username === body.username && u.password === hashPassword(body.password)
      );
      if (!user) return send(res, 401, { error: "Invalid credentials" });
      const token = signToken({ id: user.id, role: user.role, name: user.name });
      return send(res, 200, { token, role: user.role, name: user.name, id: user.id });
    }

    // GET /api/me
    if (pathname === "/api/me" && req.method === "GET") {
      const auth = getAuth(req);
      if (!auth) return send(res, 401, { error: "Unauthorized" });
      return send(res, 200, { id: auth.id, role: auth.role, name: auth.name });
    }

    // ── Public Access Bypass for Sections & Rooms (Iwas Error sa Fetch) ──
    
    // GET /api/admin/sections
    if (pathname === "/api/admin/sections" && req.method === "GET") {
      return send(res, 200, db.sections || []);
    }

    // POST /api/admin/sections
    if (pathname === "/api/admin/sections" && req.method === "POST") {
      const body = await parseBody(req);
      if (!body.name || body.students === undefined) {
        return send(res, 400, { error: "Section Name and Student count are required." });
      }
      if (!db.sections) db.sections = [];
      db.sections.push(body);
      saveDB(db);
      return send(res, 201, db.sections);
    }

    // DELETE /api/admin/sections/:id
    if (pathname.startsWith("/api/admin/sections/") && req.method === "DELETE") {
      const segments = pathname.split("/");
      const sectionId = segments[segments.length - 1];
      if (!db.sections) db.sections = [];
      const index = db.sections.findIndex(s => s.id === sectionId);
      if (index === -1) return send(res, 404, { error: "Section not found." });
      db.sections.splice(index, 1);
      saveDB(db);
      return send(res, 200, { success: true });
    }

    // GET /api/admin/rooms
    if (pathname === "/api/admin/rooms" && req.method === "GET") {
      return send(res, 200, db.rooms || []);
    }

    // POST /api/admin/rooms
    if (pathname === "/api/admin/rooms" && req.method === "POST") {
      const body = await parseBody(req);
      if (!body.name || body.capacity === undefined) {
        return send(res, 400, { error: "Room Name and Capacity are required." });
      }
      if (!db.rooms) db.rooms = [];
      db.rooms.push(body);
      saveDB(db);
      return send(res, 201, db.rooms);
    }

    // DELETE /api/admin/rooms/:id
    if (pathname.startsWith("/api/admin/rooms/") && req.method === "DELETE") {
      const segments = pathname.split("/");
      const roomId = segments[segments.length - 1];
      if (!db.rooms) db.rooms = [];
      const index = db.rooms.findIndex(r => r.id === roomId);
      if (index === -1) return send(res, 404, { error: "Room not found." });
      db.rooms.splice(index, 1);
      saveDB(db);
      return send(res, 200, { success: true });
    }

    // ── Admin Protected Endpoints ──
    if (pathname.startsWith("/api/admin/")) {
      const auth = getAuth(req);
      if (!auth || auth.role !== "admin") return send(res, 403, { error: "Forbidden" });

      // GET /api/admin/subjects
      if (pathname === "/api/admin/subjects" && req.method === "GET") {
        return send(res, 200, db.schoolSubjects || []);
      }

      // POST /api/admin/subjects
      if (pathname === "/api/admin/subjects" && req.method === "POST") {
        const body = await parseBody(req);
        if (!body.subjectName) return send(res, 400, { error: "Subject title required" });
        if (!db.schoolSubjects.includes(body.subjectName)) {
          db.schoolSubjects.push(body.subjectName);
          saveDB(db);
        }
        return send(res, 201, db.schoolSubjects);
      }

      if (pathname.startsWith("/api/admin/subjects/") && req.method === "DELETE") {
        try {
          const segments = pathname.split("/");
          const subjectToDelete = decodeURIComponent(segments[segments.length - 1]);
          if (!db.schoolSubjects) return send(res, 404, { error: "Subject catalog array not found." });
          const index = db.schoolSubjects.indexOf(subjectToDelete);
          if (index === -1) return send(res, 404, { error: "Subject entry does not exist." });
          db.schoolSubjects.splice(index, 1);
          saveDB(db);
          return send(res, 200, { success: true });
        } catch (error) {
          return send(res, 500, { error: "Internal failure." });
        }
      }

      // GET /api/admin/teachers
      if (pathname === "/api/admin/teachers" && req.method === "GET") {
        return send(res, 200, db.teachers || []);
      }

      // POST /api/admin/teachers
      if (pathname === "/api/admin/teachers" && req.method === "POST") {
        const body = await parseBody(req);
        if (!body.firstName || !body.lastName) return send(res, 400, { error: "Names are mandatory." });

        const id = genId();
        const username = (body.firstName.toLowerCase().trim() + "." + body.lastName.toLowerCase().trim()).replace(/\s+/g, "");
        const password = "teacher" + Math.floor(1000 + Math.random() * 9000);

        const teacher = {
          id,
          firstName: body.firstName.trim(),
          lastName: body.lastName.trim(),
          email: body.email || "no-email@school.edu",
          subjects: body.subjects || [],
          targetGrade: body.targetGrade || "", 
          workDays: body.workDays || [],
          startTime: body.startTime || "08:00",
          endTime: body.endTime || "16:00",
          availability: body.availability || [],
          employeeId: "EMP-" + Math.floor(1000 + Math.random() * 9000),
          createdAt: new Date().toISOString(),
        };

        const userAccount = {
          id,
          username,
          password: hashPassword(password),
          role: "teacher",
          name: `${body.firstName} ${body.lastName}`,
          teacherId: id,
        };

        const schedule = {
          teacherId: id,
          slots: generateSchedule(teacher),
          generatedAt: new Date().toISOString(),
        };

        db.teachers.push(teacher);
        db.users.push(userAccount);
        db.schedules.push(schedule);
        saveDB(db);

        return send(res, 201, { teacher, credentials: { username, password }, schedule });
      }

      // PUT /api/admin/teachers/:id
      if (pathname.match(/^\/api\/admin\/teachers\/[^/]+$/) && req.method === "PUT") {
        const id = pathname.split("/").pop();
        const body = await parseBody(req);
        const idx = db.teachers.findIndex((t) => t.id === id);
        if (idx === -1) return send(res, 404, { error: "Not found" });

        db.teachers[idx] = { ...db.teachers[idx], ...body, id };
        const schedIdx = db.schedules.findIndex((s) => s.teacherId === id);
        const newSched = {
          teacherId: id,
          slots: generateSchedule(db.teachers[idx]),
          generatedAt: new Date().toISOString(),
        };
        if (schedIdx !== -1) db.schedules[schedIdx] = newSched;
        else db.schedules.push(newSched);

        saveDB(db);
        return send(res, 200, { teacher: db.teachers[idx], schedule: newSched });
      }

      // DELETE /api/admin/teachers/:id
      if (pathname.match(/^\/api\/admin\/teachers\/[^/]+$/) && req.method === "DELETE") {
        const id = pathname.split("/").pop();
        db.teachers = db.teachers.filter((t) => t.id !== id);
        db.users = db.users.filter((u) => u.id !== id);
        db.schedules = db.schedules.filter((s) => s.teacherId !== id);
        saveDB(db);
        return send(res, 200, { success: true });
      }

      // GET /api/admin/schedules
      if (pathname === "/api/admin/schedules" && req.method === "GET") {
        const full = db.schedules.map((s) => {
          const teacher = db.teachers.find((t) => t.id === s.teacherId);
          return { ...s, teacher };
        });
        return send(res, 200, full);
      }

      // POST /api/admin/schedules/save-bulk
      if (pathname === "/api/admin/schedules/save-bulk" && req.method === "POST") {
        const body = await parseBody(req);
        const compiledSchedules = body.schedules; // Expecting key-mapped matrix structures array

        if (!compiledSchedules || typeof compiledSchedules !== 'object') {
          return send(res, 400, { error: "Malformed schedule payload matrix." });
        }

        // Wipe previous volatile server structures and map incoming compiled sets cleanly
        db.schedules = [];

        // Re-map the teacher schedules directly into your database schema
        for (const [fullName, scheduleObj] of Object.entries(compiledSchedules)) {
          const foundTeacher = db.teachers.find(t => `${t.firstName} ${t.lastName}` === fullName);
          
          if (foundTeacher) {
            // Map the structural layout to match the inner backend schema constraints 
            const parsedSlots = scheduleObj.slots.map(slot => ({
              id: crypto.randomBytes(4).toString("hex"),
              day: slot.day,
              startTime: slot.time.split(" - ")[0] || "08:00 AM",
              endTime: slot.time.split(" - ")[1] || "09:00 AM",
              subject: slot.subject,
              room: slot.room,
              section: slot.section, // Preserve section link
              status: "scheduled"
            }));

            db.schedules.push({
              teacherId: foundTeacher.id,
              slots: parsedSlots,
              generatedAt: new Date().toISOString()
            });
          }
        }

        saveDB(db);
        return send(res, 200, { success: true, message: "Master timetable saved directly to system disk db.json!" });
      }

      // POST /api/admin/schedules/regenerate/:id
      if (pathname.match(/^\/api\/admin\/schedules\/regenerate\/[^/]+$/) && req.method === "POST") {
        const id = pathname.split("/").pop();
        const teacher = db.teachers.find((t) => t.id === id);
        if (!teacher) return send(res, 404, { error: "Teacher not found" });
        const idx = db.schedules.findIndex((s) => s.teacherId === id);
        const newSched = {
          teacherId: id,
          slots: generateSchedule(teacher),
          generatedAt: new Date().toISOString(),
        };
        if (idx !== -1) db.schedules[idx] = newSched;
        else db.schedules.push(newSched);
        saveDB(db);
        return send(res, 200, newSched);
      }
    }

    // ── Global Timetable Endpoint for Teacher Account Dashboards ──
    if (pathname === "/api/timetable" && req.method === "GET") {
      const auth = getAuth(req);
      if (!auth) return send(res, 401, { error: "Unauthorized access token." });

      const flattenedOutputMatrix = [];
      
      db.schedules.forEach(scheduleSet => {
        const structuralTeacher = db.teachers.find(t => t.id === scheduleSet.teacherId);
        const instructorName = structuralTeacher ? `${structuralTeacher.firstName} ${structuralTeacher.lastName}` : "Unknown Instructor";

        scheduleSet.slots.forEach(slot => {
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
      });

      return send(res, 200, flattenedOutputMatrix);
    }

    // ── Teacher-only routes ──
    if (pathname.startsWith("/api/teacher/")) {
      const auth = getAuth(req);
      if (!auth || auth.role !== "teacher") return send(res, 403, { error: "Forbidden" });

      if (pathname === "/api/teacher/schedule" && req.method === "GET") {
        const schedule = db.schedules.find((s) => s.teacherId === auth.id);
        const teacher = db.teachers.find((t) => t.id === auth.id);
        return send(res, 200, { schedule: schedule || null, teacher: teacher || null });
      }
    }

    return send(res, 404, { error: "API route not found" });
  }

  // ── Static Files Router Asset Delivery ──
  const frontendBase = path.join(__dirname, "../frontend");

  if (pathname === "/" || pathname === "/index.html") {
    res.writeHead(302, { "Location": "/admin/pages/Addteacher.html" });
    return res.end();
  }

  const filePath = path.join(frontendBase, pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return serveFile(res, filePath);
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`\n✅ Scheduler running at http://localhost:${PORT}`);
  console.log(`\n👤 Admin login: admin / admin123`);
});
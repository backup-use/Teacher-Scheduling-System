document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("userRole");
  const userName =
    localStorage.getItem("userName") ||
    localStorage.getItem("fullName") ||
    localStorage.getItem("teacherName") ||
    localStorage.getItem("name") ||
    "";

  if (!token || role !== "teacher") {
    alert("Unauthorized access! Redirecting to login.");
    window.location.href = "/index.html";
    return;
  }

  const subjectColorMap = {
    "ARALING PANLIPUNAN": "#fef08a", ENGLISH: "#dbeafe", FILIPINO: "#e0e7ff",
    MAPEH: "#f3e8ff", MATHEMATICS: "#ffe4e6", SCIENCE: "#dcfce7",
    TLE: "#ffedd5", "VALUES EDUCATION": "#fef9c3", ESP: "#fef9c3",
  };

  function getSubjectColor(subjectName) {
    if (!subjectName) return "#ffffff";
    return subjectColorMap[subjectName.trim().toUpperCase()] || "#e2e8f0";
  }

  function escapeHTML(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  const instructorTitleEl = document.getElementById("instructor-title");
  if (instructorTitleEl) instructorTitleEl.textContent = `INSTRUCTOR: ${userName.toUpperCase()}`;

  // ── Set instructor name for PRINT header ──
  const wrapper = document.querySelector(".timetable-wrapper");
  if (wrapper) {
    wrapper.setAttribute("data-instructor", userName.toUpperCase());
  }

  // ── FULL DAY SLOTS (internal 24-hour) ──
  const FULL_DAY_SLOTS = [
    "06:00-06:50", "06:50-07:40", "07:40-08:30",
    "08:30-09:00",
    "09:00-09:50", "09:50-10:40", "10:40-11:30",
    "11:30-12:30",
    "12:30-13:20", "13:20-14:10", "14:10-15:00",
    "15:00-15:30",
    "15:30-16:20", "16:20-17:10", "17:10-18:00",
    "18:00-19:00",
  ];
  const BREAK_SLOTS = new Set([
    "08:30-09:00",
    "11:30-12:30",
    "15:00-15:30",
    "18:00-19:00",
  ]);

  const targetDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  function normalizeDay(raw) {
    if (!raw) return "";
    const s = String(raw).trim();
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }

  function matchTeacherName(nameA, nameB) {
    if (!nameA || !nameB) return false;
    const cleanA = nameA.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const cleanB = nameB.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    if (cleanA === cleanB || cleanA.includes(cleanB) || cleanB.includes(cleanA)) return true;
    const ta = cleanA.split(/\s+/).filter(t => t.length > 2);
    const tb = cleanB.split(/\s+/).filter(t => t.length > 2);
    return ta.some(t => tb.includes(t));
  }

  function normalizeTimeSlot(str) {
    if (!str) return "";
    let clean = str.trim().replace(/\s+/g, "").replace(/to/g, "-");
    const parts = clean.split("-");
    if (parts.length === 2) {
      const padTime = (t) => {
        const m = t.match(/^(\d{1,2}):(\d{2})/);
        if (!m) return t;
        return `${m[1].padStart(2, "0")}:${m[2]}`;
      };
      return `${padTime(parts[0])}-${padTime(parts[1])}`;
    }
    return clean;
  }

  // ── 12-HOUR DISPLAY HELPERS ──
  function to12Hour(time24) {
    if (!time24) return "";
    const m = String(time24).match(/^(\d{1,2}):(\d{2})/);
    if (!m) return time24;
    let h = parseInt(m[1], 10);
    const min = m[2];
    const period = h >= 12 ? "PM" : "AM";
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return `${String(h).padStart(2, "0")}:${min} ${period}`;
  }

  function formatTimeSlotDisplay(slot24) {
    if (!slot24 || !slot24.includes("-")) return slot24;
    const [start, end] = slot24.split("-");
    return `${to12Hour(start)} - ${to12Hour(end)}`;
  }

  // ── Minimal CSS injection ──
  if (!document.getElementById("admin-tight-layout-rules")) {
    const adminStyles = document.createElement("style");
    adminStyles.id = "admin-tight-layout-rules";
    adminStyles.innerHTML = `
      #instructor-title { color: #0c2f6b !important; }
      .subtitle, p { color: #94a3b8 !important; }
      .break-row { background: #f8fafc !important; }
      .vacant-cell-fill {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        height: 100% !important;
        width: 100% !important;
        position: relative !important;
      }
    `;
    document.head.appendChild(adminStyles);
  }

  // Modal
  if (!document.getElementById("vacant-note-modal")) {
    document.body.insertAdjacentHTML("beforeend", `
      <div id="vacant-note-modal" class="vacant-modal-overlay">
        <div class="vacant-modal-content">
          <h3>Personal Task / Memo</h3>
          <p class="modal-subtitle">What are your plans during this vacant period?</p>
          <textarea id="modal-note-textarea" placeholder="Example: Checking papers, lesson preparation..."></textarea>
          <div class="modal-actions-row">
            <button id="modal-cancel-btn">Cancel</button>
            <button id="modal-save-btn">Save Note</button>
          </div>
        </div>
      </div>
    `);
  }

  let currentEditingDay = "";
  let currentEditingTime = "";

  window.openVacantNoteModal = function (day, timeSlot) {
    currentEditingDay = day;
    currentEditingTime = timeSlot;
    const storageKey = `note_${userName}_${day}_${timeSlot}`;
    const textarea = document.getElementById("modal-note-textarea");
    if (textarea) textarea.value = localStorage.getItem(storageKey) || "";
    document.getElementById("vacant-note-modal")?.classList.add("modal-active");
  };

  const closeModal = () => document.getElementById("vacant-note-modal")?.classList.remove("modal-active");

  document.getElementById("modal-cancel-btn")?.addEventListener("click", closeModal);
  document.getElementById("modal-save-btn")?.addEventListener("click", () => {
    const textarea = document.getElementById("modal-note-textarea");
    const noteValue = textarea ? textarea.value.trim() : "";
    const storageKey = `note_${userName}_${currentEditingDay}_${currentEditingTime}`;
    if (noteValue) localStorage.setItem(storageKey, noteValue);
    else localStorage.removeItem(storageKey);
    closeModal();
    loadTeacherTimetable();
  });

  async function loadTeacherTimetable() {
    const tbody = document.getElementById("timetable-rows");
    if (!tbody) return;

    tbody.innerHTML = "";
    let myClassesMap = {};
    let loadedFromApi = false;

    try {
      const response = await fetch(`/api/teacher/schedule?userName=${encodeURIComponent(userName)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        let slots = [];
        if (Array.isArray(data)) slots = data;
        else if (Array.isArray(data.slots)) slots = data.slots;
        else if (data.schedule && Array.isArray(data.schedule.slots)) slots = data.schedule.slots;
        else if (data.schedule && data.schedule.slots && typeof data.schedule.slots === "object") slots = Object.values(data.schedule.slots);

        if (Array.isArray(slots) && slots.length > 0) {
          loadedFromApi = true;

          slots.forEach((slot) => {
            const teacherInSlot = slot.instructor || slot.teacher || slot.teacherName || userName;
            if (matchTeacherName(teacherInSlot, userName)) {
              const day = normalizeDay(slot.day);
              const rawTime = slot.timeSlot || slot.time ||
                (slot.startTime && slot.endTime ? `${slot.startTime} - ${slot.endTime}` : "");
              const timeSlot = normalizeTimeSlot(rawTime);

              if (!myClassesMap[day]) myClassesMap[day] = {};
              myClassesMap[day][timeSlot] = {
                subject: slot.subject,
                section: slot.section || "",
                room: slot.room || "",
              };
            }
          });
        }
      }
    } catch (e) {
      console.warn("API failed, using cache:", e.message);
    }

    // LocalStorage fallback
    if (!loadedFromApi) {
      const cachedStr = localStorage.getItem("cached_teacher_schedules");
      if (cachedStr) {
        try {
          const teacherMap = JSON.parse(cachedStr);
          const matchedKey = Object.keys(teacherMap).find(k => matchTeacherName(k, userName));
          if (matchedKey && teacherMap[matchedKey]) {
            const teacherData = teacherMap[matchedKey];
            const rawDays = teacherData.days ? teacherData.days : teacherData;
            Object.entries(rawDays).forEach(([day, times]) => {
              const normDay = normalizeDay(day);
              if (!myClassesMap[normDay]) myClassesMap[normDay] = {};
              Object.entries(times).forEach(([tSlot, details]) => {
                myClassesMap[normDay][normalizeTimeSlot(tSlot)] = details;
              });
            });
          }
        } catch (err) { console.error(err); }
      }
    }

    // Render FULL DAY grid
    FULL_DAY_SLOTS.forEach((timeSlot) => {
      const tr = document.createElement("tr");
      const isBreak = BREAK_SLOTS.has(timeSlot);

      if (isBreak) {
        tr.className = "break-row-tr";
      }

      const timeCell = document.createElement("td");
      timeCell.className = "time-cell";
      timeCell.textContent = isBreak ? "" : formatTimeSlotDisplay(timeSlot);
      tr.appendChild(timeCell);

      if (isBreak) {
        const breakTd = document.createElement("td");
        breakTd.colSpan = targetDays.length;
        breakTd.className = "break-row";
        breakTd.textContent = "";
        breakTd.style.height = "8px";
        breakTd.style.maxHeight = "8px";
        breakTd.style.padding = "0";
        tr.appendChild(breakTd);
      } else {
        targetDays.forEach((day) => {
          const td = document.createElement("td");
          const normalizedCurrentSlot = normalizeTimeSlot(timeSlot);

          let resolvedDayKey = day;
          if (!myClassesMap[day]) {
            const found = Object.keys(myClassesMap).find(k => k.toLowerCase() === day.toLowerCase());
            if (found) resolvedDayKey = found;
          }

          const slotData = myClassesMap[resolvedDayKey]?.[normalizedCurrentSlot];

          if (slotData) {
            td.style.backgroundColor = getSubjectColor(slotData.subject);
            td.style.color = "#000000";
            td.innerHTML = `
              <div class="slot-subject">${escapeHTML(slotData.subject)}</div>
              <div class="slot-section">${escapeHTML(slotData.section || "")}</div>
              <div class="slot-room">(${escapeHTML(slotData.room || "")})</div>
            `;
          } else {
            const storageKey = `note_${userName}_${day}_${timeSlot}`;
            const savedNote = localStorage.getItem(storageKey) || "";
            const cellMarkup = savedNote ? `<div class="saved-cell-note">${escapeHTML(savedNote)}</div>` : `<span class="vacant-text">-- Vacant --</span>`;
            td.innerHTML = `<div class="vacant-cell-fill">${cellMarkup}<button class="add-note-btn" title="Add Memo">+</button></div>`;
            td.querySelector(".add-note-btn")?.addEventListener("click", () => window.openVacantNoteModal(day, timeSlot));
          }
          tr.appendChild(td);
        });
      }

      tbody.appendChild(tr);
    });
  }

  const printBtn = document.getElementById("print-schedule-btn");
  if (printBtn) printBtn.addEventListener("click", () => { printBtn.blur(); window.print(); });

  const pdfBtn = document.getElementById("download-pdf-btn");
  if (pdfBtn) pdfBtn.addEventListener("click", () => { pdfBtn.blur(); window.print(); });

  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) logoutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.clear();
    window.location.href = "/index.html?logout=success";
  });

  loadTeacherTimetable();
});
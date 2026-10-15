/* ═══════════════════════════════════════════════════════
   MAKILING INTEGRATED SCHOOL — TEACHER SCHEDULE VIEWER
   Displays teacher's own timetable from admin-generated schedule
   ═══════════════════════════════════════════════════════ */

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

  // ═══ SUBJECT COLORS — matches admin view ═══
  const subjectColorMap = {
    "ARALING PANLIPUNAN": "#dbeafe",   // light blue
    "ENGLISH": "#93c5fd",              // blue
    "FILIPINO": "#e9d5ff",             // purple
    "MAPEH": "#f5d0fe",                // pink
    "MATHEMATICS": "#fbcfe8",          // rose
    "SCIENCE": "#fde68a",              // orange/yellow
    "TLE": "#fef08a",                  // yellow
    "VALUES EDUCATION": "#fde047",     // amber
    "ESP": "#fde047",
  };

  function getSubjectColor(subjectName) {
    if (!subjectName) return "#ffffff";
    const key = subjectName.trim().toUpperCase();
    return subjectColorMap[key] || "#e2e8f0";
  }

  function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  const instructorTitleEl = document.getElementById("instructor-title");
  if (instructorTitleEl) {
    instructorTitleEl.textContent = `INSTRUCTOR: ${userName.toUpperCase()}`;
  }

  // ═══ FULL DAY SLOTS — matches admin JHS generator ═══
  const FULL_DAY_SLOTS = [
    "06:00-07:00",
    "07:00-08:00",
    "08:00-09:00",
    "09:00-09:15",   // RECESS
    "09:15-10:15",
    "10:15-11:15",
    "11:15-12:15",
    "12:15-13:45",   // LUNCH BREAK
    "13:45-14:45",
    "14:45-15:00",   // RECESS
    "15:00-16:00",
    "16:00-17:00",
    "17:00-18:00",
    "18:00-19:00",
  ];

  const BREAK_SLOT_LABELS = {
    "09:00-09:15": "RECESS",
    "12:15-13:45": "LUNCH BREAK",
    "14:45-15:00": "RECESS",
  };

  const FLAG_RAISING_SLOT = "06:00-07:00";

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

  // ═══ 12-HOUR DISPLAY HELPERS ═══
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

  // ═══ Minimal CSS injection (screen only) ═══
  if (!document.getElementById("admin-tight-layout-rules")) {
    const adminStyles = document.createElement("style");
    adminStyles.id = "admin-tight-layout-rules";
    adminStyles.innerHTML = `
      #instructor-title { color: #0c2f6b !important; }
      .subtitle, p { color: #94a3b8 !important; }
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

  // ═══ Print-only CSS ═══
  if (!document.getElementById("teacher-print-styles")) {
    const printStyles = document.createElement("style");
    printStyles.id = "teacher-print-styles";
    printStyles.media = "print";
    printStyles.innerHTML = `
      @page {
        size: letter landscape;
        margin: 0.35in 0.4in 0.4in 0.4in;
      }

      /* Hide everything except print area */
      body * { visibility: hidden !important; }
      #print-zone, #print-zone * { visibility: visible !important; }

      .sidebar,
      .sidebar-expand-btn,
      .timetable-controls,
      .main-content > header,
      #vacant-note-modal,
      .add-note-btn,
      .no-print {
        display: none !important;
      }

      body {
        background: #ffffff !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      #print-zone {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        padding: 0 !important;
      }

      /* Print header */
      .print-header {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding-bottom: 8px !important;
        margin-bottom: 10px !important;
        border-bottom: none !important;
      }

      .print-header-left {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
      }

      .print-header-logo {
        width: 60px !important;
        height: 60px !important;
        object-fit: contain !important;
      }

      .print-header-school-name {
        font-family: 'Cinzel', serif !important;
        font-size: 22pt !important;
        font-weight: 700 !important;
        color: #000 !important;
        line-height: 1.05 !important;
      }

      .print-header-school-address {
        font-size: 11pt !important;
        color: #333 !important;
        font-style: italic !important;
        margin-top: 3px !important;
      }

      .print-header-right {
        text-align: right !important;
      }

      .print-header-teacher-name {
        font-family: 'Cinzel', 'Inter', serif !important;
        font-size: 20pt !important;
        font-weight: 800 !important;
        color: #000 !important;
        text-transform: uppercase !important;
        line-height: 1.1 !important;
      }

      .print-header-dept {
        font-size: 11pt !important;
        color: #333 !important;
        margin-top: 3px !important;
        font-style: italic !important;
      }

      .print-header-sy {
        font-size: 11pt !important;
        font-weight: 600 !important;
        color: #333 !important;
        margin-top: 2px !important;
      }

      /* Print table */
      .timetable-wrapper {
        box-shadow: none !important;
        border: none !important;
        padding: 0 !important;
      }

      .timetable-table {
        width: 100% !important;
        border-collapse: collapse !important;
        table-layout: fixed !important;
        border: 1.5pt solid #000 !important;
      }

      .timetable-table thead {
        display: table-header-group !important;
      }

      .timetable-table th,
      .timetable-table td {
        border: 1pt solid #000 !important;
        padding: 4px 3px !important;
        font-size: 9pt !important;
        color: #000 !important;
        text-align: center !important;
        vertical-align: middle !important;
        word-wrap: break-word !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .timetable-table th {
        background: #e2e8f0 !important;
        font-weight: 900 !important;
        font-size: 10pt !important;
        text-transform: uppercase !important;
        height: 26px !important;
        padding: 6px 3px !important;
      }

      .timetable-table .time-cell {
        background: #f8fafc !important;
        font-weight: 900 !important;
        font-size: 9pt !important;
        white-space: nowrap !important;
        width: 20% !important;
        padding: 4px 3px !important;
      }

      .timetable-table .slot-subject {
        font-size: 9.5pt !important;
        font-weight: 800 !important;
        text-transform: uppercase !important;
        color: #000 !important;
      }

      .timetable-table .slot-section {
        font-size: 8pt !important;
        font-weight: 700 !important;
        color: #333 !important;
      }

      .timetable-table .slot-room {
        font-size: 7.5pt !important;
        color: #555 !important;
      }

      .timetable-table .break-cell {
        background: #f1f5f9 !important;
        font-weight: 800 !important;
        font-size: 9pt !important;
        letter-spacing: 2px !important;
        color: #475569 !important;
        padding: 6px !important;
      }

      .timetable-table .flag-raising-cell {
        background: #fef3c7 !important;
        color: #92400e !important;
      }

      .timetable-table .vacant-cell-fill {
        background: #ffffff !important;
        border: none !important;
      }

      .timetable-table .vacant-text {
        color: #000000 !important;
        font-style: italic !important;
        font-size: 8pt !important;
      }

      /* Print footer */
      .print-footer {
        display: flex !important;
        justify-content: space-between !important;
        align-items: flex-end !important;
        margin-top: 12px !important;
        font-size: 9pt !important;
        color: #555 !important;
        font-style: italic !important;
      }

      .print-footer-left {
        text-align: left !important;
      }

      .print-footer-right {
        text-align: right !important;
      }

      .print-footer-principal {
        font-family: 'Cinzel', serif !important;
        font-weight: 700 !important;
        font-size: 11pt !important;
        color: #000 !important;
        margin-bottom: 2px !important;
      }

      .print-footer-principal-title {
        font-size: 9pt !important;
        color: #333 !important;
      }
    `;
    document.head.appendChild(printStyles);
  }

  // ═══ Modal ═══
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

  // ═══════════════════════════════════════════════════════
  // ═══ MAIN: LOAD TEACHER TIMETABLE                  ═══
  // ═══════════════════════════════════════════════════════
  async function loadTeacherTimetable() {
    const tbody = document.getElementById("timetable-rows");
    if (!tbody) return;

    tbody.innerHTML = "";
    let myClassesMap = {};
    let loadedFromApi = false;

    try {
      const response = await fetch(
        `/api/teacher/schedule?userName=${encodeURIComponent(userName)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

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
            const teacherInSlot = slot.teacherName || slot.instructor || slot.teacher || userName;
            const slotTeacherId = slot.teacherId;
            const matchById = slotTeacherId != null && String(slotTeacherId) === String(data?.schedule?.teacher_id);
            const matchByName = matchTeacherName(teacherInSlot, userName);

            if (matchById || matchByName) {
              const day = normalizeDay(slot.day);
              let rawTime = "";
              if (slot.startTime && slot.endTime) rawTime = `${slot.startTime} - ${slot.endTime}`;
              else if (slot.timeSlot) rawTime = slot.timeSlot;
              else if (slot.time) rawTime = slot.time;
              else if (slot.timeRange) rawTime = slot.timeRange;

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

    // ═══════════════════════════════════════════════════════
    // ═══ RENDER FULL DAY GRID                          ═══
    // ═══════════════════════════════════════════════════════
    FULL_DAY_SLOTS.forEach((timeSlot) => {
      const tr = document.createElement("tr");
      const isBreak = Object.prototype.hasOwnProperty.call(BREAK_SLOT_LABELS, timeSlot);
      const breakLabel = BREAK_SLOT_LABELS[timeSlot];

      if (isBreak) tr.className = "break-row-tr";

      // Time cell — always show time
      const timeCell = document.createElement("td");
      timeCell.className = "time-cell";
      timeCell.textContent = formatTimeSlotDisplay(timeSlot);
      tr.appendChild(timeCell);

      if (isBreak) {
        const breakTd = document.createElement("td");
        breakTd.colSpan = targetDays.length;
        breakTd.className = "break-cell";
        breakTd.textContent = breakLabel;
        tr.appendChild(breakTd);
        tbody.appendChild(tr);
        return;
      }

      targetDays.forEach((day) => {
        const td = document.createElement("td");
        const normalizedCurrentSlot = normalizeTimeSlot(timeSlot);

        // Flag Raising on Monday 6AM
        if (day === "Monday" && timeSlot === FLAG_RAISING_SLOT) {
          td.className = "flag-raising-cell";
          td.innerHTML = `
            <div style="font-size:0.82rem;font-weight:800;line-height:1.2;">Flag Raising</div>
            <div style="font-size:0.68rem;font-weight:600;margin-top:2px;">Ceremony</div>
          `;
          tr.appendChild(td);
          return;
        }

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
          const cellMarkup = savedNote
            ? `<div class="saved-cell-note">${escapeHTML(savedNote)}</div>`
            : `<span class="vacant-text">-- Vacant --</span>`;

          td.innerHTML = `
            <div class="vacant-cell-fill">
              ${cellMarkup}
              <button class="add-note-btn" title="Add Memo">+</button>
            </div>
          `;
          td.querySelector(".add-note-btn")?.addEventListener("click", () =>
            window.openVacantNoteModal(day, timeSlot)
          );
        }

        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  }

  // ═══════════════════════════════════════════════════════
  // ═══ PRINT — builds a hidden print zone with header/footer ═══
  // ═══════════════════════════════════════════════════════
  function buildPrintZone() {
    // Remove old print zone
    const old = document.getElementById("print-zone");
    if (old) old.remove();

    // Grab the rendered table
    const table = document.querySelector(".timetable-table");
    if (!table) {
      alert("Timetable not loaded yet. Please wait and try again.");
      return null;
    }

    // Generated timestamp
    const now = new Date();
    const timestamp = now.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Build print zone
    const zone = document.createElement("div");
    zone.id = "print-zone";
    zone.innerHTML = `
      <div class="print-header">
        <div class="print-header-left">
          <img src="/auth/makiling_logo.png" alt="MIS Logo" class="print-header-logo">
          <div>
            <div class="print-header-school-name">Makiling Integrated School</div>
            <div class="print-header-school-address">Brgy. Makiling, Calamba City, Laguna</div>
          </div>
        </div>
        <div class="print-header-right">
          <div class="print-header-teacher-name">${escapeHTML(userName.toUpperCase())}</div>
          <div class="print-header-dept">Junior High School</div>
          <div class="print-header-sy">S.Y. 2026-2027</div>
        </div>
      </div>

      ${table.outerHTML}

      <div class="print-footer">
        <div class="print-footer-left">
          <div class="print-footer-principal">Ronaldo M. Canta, Ph.D.</div>
          <div class="print-footer-principal-title">Principal III</div>
        </div>
        <div class="print-footer-right">
          Generated on: ${timestamp}
        </div>
      </div>
    `;

    document.body.appendChild(zone);
    return zone;
  }

  function triggerPrint() {
    const zone = buildPrintZone();
    if (!zone) return;

    // Small delay to let browser paint the print zone
    setTimeout(() => {
      window.print();
      // Cleanup after print
      setTimeout(() => {
        const z = document.getElementById("print-zone");
        if (z) z.remove();
      }, 500);
    }, 100);
  }

  const printBtn = document.getElementById("print-schedule-btn");
  if (printBtn) {
    printBtn.addEventListener("click", (e) => {
      e.preventDefault();
      printBtn.blur();
      triggerPrint();
    });
  }

  const pdfBtn = document.getElementById("download-pdf-btn");
  if (pdfBtn) {
    pdfBtn.addEventListener("click", (e) => {
      e.preventDefault();
      pdfBtn.blur();
      triggerPrint();
    });
  }

  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      localStorage.clear();
      window.location.href = "/index.html?logout=success";
    });
  }

  loadTeacherTimetable();
});
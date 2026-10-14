/**
 * Advanced Master Schedule Generator - Makiling Integrated School (MIS) Edition
 * - JHS (Grade 7-10): FULL DAY (AM + PM), 60-min slots, 3x/week, breaks
 * - SHS (Grade 11-12): unchanged legacy hourly slots
 * - Includes per-section Print + PDF export with institutional header
 * - Flag Raising reserved on Monday 6:00-7:00
 * - Room displayed in section header (not in cells)
 * - Full Audit Dashboard (minimalist) + Teacher Load Counter
 * - Edit Mode Toggle + Tap-to-Select Swap & Move (desktop + mobile)
 * - Session Guard: auto-redirect on expired/invalid token
 * - 12-HOUR FORMAT: All times displayed as "6:00 AM - 7:00 AM"
 * - SKIPPED SECTIONS BANNER: with close/open toggle and Font Awesome icons
 * - SEARCH (with dropdown) + BATCH PRINT (Print by Grade) + Teacher Load Counter
 * - IFRAME PRINT: 100% identical layout on all pages (matches PDF export)
 * - BLACK BORDERS + WIDER TIME COLUMN + NO PAGE NUMBER + BALANCED HEADER
 * - GRADE HEADER GRID LOCK: Prevents buttons from wrapping during search
 */

// ═══════════════════════════════════════════════════════
// ═══ SESSION GUARD (built-in)                        ═══
// ═══════════════════════════════════════════════════════
(function initSessionGuard() {
  'use strict';

  window.__getAuthToken = function () {
    return localStorage.getItem('token') || localStorage.getItem('jwt') ||
           localStorage.getItem('authToken') || localStorage.getItem('accessToken') ||
           sessionStorage.getItem('token') || sessionStorage.getItem('jwt') ||
           sessionStorage.getItem('authToken') || sessionStorage.getItem('accessToken');
  };

  window.__decodeJWT = function (token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      return JSON.parse(atob(parts[1]));
    } catch { return null; }
  };

  window.__clearSession = function () {
    ['token', 'jwt', 'authToken', 'accessToken', 'user', 'currentUser'].forEach(k => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
  };

  window.__redirectToLogin = function (reason) {
    console.warn(`[SessionGuard] Redirecting to login. Reason: ${reason}`);
    window.__clearSession();
    const reasonParam = reason ? `?reason=${encodeURIComponent(reason)}` : '';
    window.location.href = `/auth/login.html${reasonParam}`;
  };

  window.requireAuth = function (requiredRole) {
    const token = window.__getAuthToken();

    if (!token || token === "null" || token === "undefined") {
      window.__redirectToLogin("no_token");
      return false;
    }

    const payload = window.__decodeJWT(token);
    if (!payload) {
      window.__redirectToLogin("invalid_token");
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      window.__redirectToLogin("expired");
      return false;
    }

    if (requiredRole && payload.role !== requiredRole) {
      if (payload.role === "teacher") {
        window.location.href = '/teacher/dashboard.html';
      } else {
        window.__redirectToLogin("forbidden");
      }
      return false;
    }

    console.log(`[SessionGuard] ✓ Authenticated: ${payload.username} (${payload.role})`);
    return true;
  };

  window.fetchWithAuth = async function (url, options = {}) {
    const token = window.__getAuthToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (token) {
      headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401 || res.status === 403) {
      console.warn(`[fetchWithAuth] ${res.status} from ${url} — redirecting to login`);
      window.__redirectToLogin("session_expired");
      throw new Error("Session expired. Please log in again.");
    }

    return res;
  };

  let __sessionWatchdogInterval = null;
  window.startSessionWatchdog = function () {
    if (__sessionWatchdogInterval) return;

    __sessionWatchdogInterval = setInterval(() => {
      const token = window.__getAuthToken();
      if (!token || token === "null" || token === "undefined") {
        window.__redirectToLogin("no_token");
        return;
      }
      const payload = window.__decodeJWT(token);
      if (!payload) {
        window.__redirectToLogin("invalid_token");
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        window.__redirectToLogin("expired");
        return;
      }
    }, 60_000);
  };

  console.log("[SessionGuard] Loaded (built-in)");
})();

// ═══════════════════════════════════════════════════════
// ═══ HELPERS                                         ═══
// ═══════════════════════════════════════════════════════

function safeParseArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { const p = JSON.parse(val); return Array.isArray(p) ? p : [p]; }
    catch (e) { return val.split(',').map(s => s.trim()).filter(Boolean); }
  }
  return [];
}

function extractGradeNumber(str) {
  if (!str) return "";
  const match = str.toString().match(/\d+/);
  return match ? match[0] : str.toString().toLowerCase().trim();
}

function sanitizeSubjectName(str) {
  if (!str) return "";
  let clean = str.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (clean.includes('values') || clean.includes('esp') || clean.includes('edukasyon')) return 'valueseducation';
  if (clean.includes('mapeh') || clean.includes('music') || clean.includes('arts') || clean.includes('pe') || clean.includes('health')) return 'mapeh';
  if (clean.includes('ap') || clean.includes('araling')) return 'aralingpanlipunan';
  if (clean.includes('tle') || clean.includes('epp')) return 'tle';
  return clean;
}

const subjectColorPalette = [
  '#7dd3fc', '#86efac', '#fcd34d', '#c4b5fd', '#f9a8d4',
  '#5eead4', '#fdba74', '#e879f9', '#a5b4fc', '#f0abfc',
];

function getSubjectColor(subjectName) {
  if (!subjectName) return '#ffffff';
  let hash = 0;
  for (let i = 0; i < subjectName.length; i++) hash = subjectName.charCodeAt(i) + ((hash << 5) - hash);
  return subjectColorPalette[Math.abs(hash) % subjectColorPalette.length];
}

function sanitizeTeacherKey(name) {
  if (!name) return "";
  return name.toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function jhsGradeNumFromString(s) {
  const m = String(s || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : NaN;
}

// ═══════════════════════════════════════════════════════
// ═══ TIME FORMAT CONVERTER (12-HOUR)                 ═══
// ═══════════════════════════════════════════════════════
function formatTime12Hour(time24) {
  if (!time24) return "";
  const [hStr, mStr] = time24.split(":");
  let h = parseInt(hStr, 10);
  const m = mStr || "00";
  const period = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h = h - 12;
  return `${h}:${m} ${period}`;
}

function formatTimeRange12Hour(range) {
  if (!range) return "";
  const [start, end] = range.split("-");
  return `${formatTime12Hour(start.trim())} - ${formatTime12Hour(end.trim())}`;
}

// ═══════════════════════════════════════════════════════
// ═══ TEACHER LOAD COUNTER                            ═══
// ═══════════════════════════════════════════════════════
function buildTeacherLoadMap(masterSectionSchedules) {
  const loadMap = {};

  Object.values(masterSectionSchedules).forEach(secObj => {
    const sectionName = secObj.details.name;

    Object.entries(secObj.timetable).forEach(([day, times]) => {
      Object.entries(times).forEach(([time, slotData]) => {
        if (!slotData || !slotData.teacherId) return;
        const tid = String(slotData.teacherId);

        if (!loadMap[tid]) {
          loadMap[tid] = {
            teacherId: tid,
            teacherName: slotData.teacher,
            totalSlots: 0,
            sections: new Set(),
          };
        }

        loadMap[tid].totalSlots++;
        loadMap[tid].sections.add(sectionName);
      });
    });
  });

  return loadMap;
}

// ═══════════════════════════════════════════════════════
// ═══ SKIPPED SECTIONS BANNER (MINIMALIST)             ═══
// ═══════════════════════════════════════════════════════
function renderSkippedSectionsBanner(skippedSections) {
  document.querySelectorAll('#skipped-sections-banner').forEach(el => el.remove());

  if (!skippedSections || skippedSections.length === 0) {
    return;
  }

  const container = document.getElementById("timetable-matrix-output-body") ||
                    document.querySelector('.main-content') ||
                    document.body;

  const banner = document.createElement('div');
  banner.id = 'skipped-sections-banner';
  banner.className = 'no-print';
  banner.style.cssText = `
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-left: 3px solid #dc2626;
    border-radius: 6px;
    margin: 12px 0 16px 0;
    font-family: 'Inter', sans-serif;
    overflow: hidden;
  `;

  const itemsHTML = skippedSections.map(s => `
    <div style="
      padding: 6px 12px;
      border-bottom: 1px solid #fecaca;
      font-size: 0.78rem;
      color: #7f1d1d;
      display: flex;
      align-items: center;
      gap: 8px;
    ">
      <i class="fa-solid fa-circle-xmark" style="color: #dc2626; flex-shrink: 0; font-size: 0.7rem;"></i>
      <span style="font-weight: 700; color: #991b1b; flex-shrink: 0;">${escapeHtml(s.section)}</span>
      <span style="color: #94a3b8; flex-shrink: 0;">(Grade ${s.grade || 'N/A'})</span>
      <span style="color: #6b7280; font-size: 0.72rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${escapeHtml(s.reason || 'Unknown reason')}
      </span>
    </div>
  `).join('');

  banner.innerHTML = `
    <div style="
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: #fee2e2;
      cursor: pointer;
      user-select: none;
    " onclick="
      const body = this.nextElementSibling;
      const chevron = this.querySelector('.chevron');
      if (body.style.display === 'none') {
        body.style.display = 'block';
        chevron.style.transform = 'rotate(0deg)';
      } else {
        body.style.display = 'none';
        chevron.style.transform = 'rotate(-90deg)';
      }
    ">
      <div style="display: flex; align-items: center; gap: 8px;">
        <i class="fa-solid fa-triangle-exclamation" style="color: #dc2626; font-size: 0.9rem;"></i>
        <span style="font-size: 0.82rem; font-weight: 700; color: #991b1b;">
          ${skippedSections.length} section${skippedSections.length !== 1 ? 's' : ''} skipped
        </span>
        <span style="font-size: 0.72rem; color: #7f1d1d; font-weight: 400;">
          — kulang sa teachers
        </span>
      </div>
      <i class="fa-solid fa-chevron-down chevron" style="color: #dc2626; font-size: 0.75rem; transition: transform 0.2s; transform: rotate(0deg);"></i>
    </div>
    <div style="max-height: 200px; overflow-y: auto;">
      ${itemsHTML}
    </div>
  `;

  const outputBody = document.getElementById("timetable-matrix-output-body");
  if (outputBody) {
    outputBody.insertBefore(banner, outputBody.firstChild);
  } else if (container) {
    container.insertBefore(banner, container.firstChild);
  }
}

// ═══ TOGGLE FUNCTION (global scope) ═══
window.toggleSkippedBanner = function(collapseId) {
  const body = document.getElementById(`${collapseId}-body`);
  const chevron = document.getElementById(`${collapseId}-chevron`);
  if (!body || !chevron) return;

  const isCurrentlyHidden = body.style.display === 'none';

  if (isCurrentlyHidden) {
    body.style.display = 'block';
    chevron.style.transform = 'rotate(0deg)';
    window.__skippedBannerCollapsed = false;
  } else {
    body.style.display = 'none';
    chevron.style.transform = 'rotate(-90deg)';
    window.__skippedBannerCollapsed = true;
  }
};

// ═══════════════════════════════════════════════════════
// ═══ CELL DATA REGISTRY                              ═══
// ═══════════════════════════════════════════════════════
window.__cellDataRegistry = {};

// ═══════════════════════════════════════════════════════
// ═══ EDIT MODE + SWAP/MOVE STATE                     ═══
// ═══════════════════════════════════════════════════════
let editMode = false;
let activeSectionId = null;
let swapState = {
  active: false,
  sourceCell: null,
  targetCell: null,
};

function toggleEditMode(sectionId) {
  if (activeSectionId && activeSectionId !== sectionId) {
    clearSwapState();
  }

  if (editMode && activeSectionId === sectionId) {
    editMode = false;
    activeSectionId = null;
    clearSwapState();
  } else {
    editMode = true;
    activeSectionId = sectionId;
    clearSwapState();
  }

  const cachedData = localStorage.getItem("cached_generated_schedule");
  if (cachedData) {
    try {
      const parsed = JSON.parse(cachedData);
      let container = document.getElementById("timetable-matrix-output-body") ||
                      document.querySelector('.dashboard-card-panel') ||
                      document.querySelector('.main-content') ||
                      document.body;

      renderMasterSectionScheduleDashboard(
        container,
        parsed.masterSectionSchedules,
        parsed.auditSummary,
        parsed.daySlots,
        parsed.timeSlots,
        parsed.normalizedTeachers
      );
    } catch (e) {
      console.error("Re-render error:", e);
    }
  }
}

function clearSwapState() {
  swapState.active = false;
  swapState.sourceCell = null;
  swapState.targetCell = null;
  document.querySelectorAll('.swappable-cell').forEach(el => {
    el.classList.remove('cell-source-selected', 'cell-target-selected');
  });
  const banner = document.getElementById('swap-banner');
  if (banner) banner.remove();
}

function showSwapBanner() {
  let banner = document.getElementById('swap-banner');
  if (banner) banner.remove();
  const src = swapState.sourceCell;
  banner = document.createElement('div');
  banner.id = 'swap-banner';
  banner.className = 'swap-banner';
  banner.innerHTML = `
    <div class="swap-banner-content">
      <span class="swap-banner-icon"><i class="fa-solid fa-arrows-rotate"></i></span>
      <div class="swap-banner-text">
        <strong>SOURCE SELECTED:</strong>
        <span>${escapeHtml(src.day)} ${escapeHtml(formatTimeRange12Hour(src.startTime + "-" + src.endTime))} · ${escapeHtml(src.subject)} · ${escapeHtml(src.teacherName)}</span>
      </div>
      <button class="swap-banner-cancel" onclick="clearSwapState()">Cancel</button>
    </div>
  `;
  document.body.appendChild(banner);
}

// ═══════════════════════════════════════════════════════
// ═══ SWAP/MOVE LOGIC                                  ═══
// ═══════════════════════════════════════════════════════
function handleCellClick(cellData, cellEl, cellKey) {
  if (!editMode) return;

  if (!swapState.active) {
    if (!cellData.teacherId) {
      showSwapToast('Select a class cell first (not a vacant slot).', 'error');
      return;
    }
    swapState.active = true;
    swapState.sourceCell = { ...cellData, cellKey: cellKey, cellEl: cellEl };
    cellEl.classList.add('cell-source-selected');
    showSwapBanner();
    return;
  }

  const src = swapState.sourceCell;

  if (src.cellKey === cellKey) {
    clearSwapState();
    return;
  }

  if (src.teacherId === cellData.teacherId &&
      src.day === cellData.day &&
      src.startTime === cellData.startTime &&
      src.endTime === cellData.endTime) {
    clearSwapState();
    return;
  }

  if (cellData.teacherId && cellData.teacherId === src.teacherId) {
    showSwapToast('Cannot move/swap a class with itself.', 'error');
    return;
  }

  swapState.targetCell = { ...cellData, cellKey: cellKey, cellEl: cellEl };
  cellEl.classList.add('cell-target-selected');

  if (cellData.teacherId) {
    showSwapConfirmation();
  } else {
    showMoveConfirmation();
  }
}

function handleCellClickByKey(cellKey, cellEl) {
  const cellData = window.__cellDataRegistry?.[cellKey];
  if (!cellData) {
    console.error("Cell data not found for key:", cellKey);
    return;
  }
  handleCellClick(cellData, cellEl, cellKey);
}

// ═══════════════════════════════════════════════════════
// ═══ CONFIRMATION MODALS                              ═══
// ═══════════════════════════════════════════════════════
function showSwapConfirmation() {
  const src = swapState.sourceCell;
  const tgt = swapState.targetCell;

  const existingModal = document.getElementById('swap-confirm-modal');
  if (existingModal) existingModal.remove();

  const srcTime = formatTimeRange12Hour(src.startTime + "-" + src.endTime);
  const tgtTime = formatTimeRange12Hour(tgt.startTime + "-" + tgt.endTime);

  const modal = document.createElement('div');
  modal.id = 'swap-confirm-modal';
  modal.className = 'swap-modal-overlay active';
  modal.innerHTML = `
    <div class="swap-modal-box">
      <div class="swap-modal-icon"><i class="fa-solid fa-arrows-rotate"></i></div>
      <h2 class="swap-modal-title">Confirm Swap</h2>
      <p class="swap-modal-subtitle">Are you sure you want to swap these two classes?</p>
      <div class="swap-preview">
        <div class="swap-preview-cell">
          <div class="swap-cell-label">From</div>
          <div class="swap-cell-time">${escapeHtml(src.day)} · ${escapeHtml(srcTime)}</div>
          <div class="swap-cell-subject">${escapeHtml(src.subject)}</div>
          <div class="swap-cell-teacher">${escapeHtml(src.teacherName)}</div>
          <div class="swap-cell-room">${escapeHtml(src.room || "N/A")} · ${escapeHtml(src.section || "")}</div>
        </div>
        <div class="swap-arrow"><i class="fa-solid fa-arrow-down-up-across-line"></i></div>
        <div class="swap-preview-cell">
          <div class="swap-cell-label">To</div>
          <div class="swap-cell-time">${escapeHtml(tgt.day)} · ${escapeHtml(tgtTime)}</div>
          <div class="swap-cell-subject">${escapeHtml(tgt.subject)}</div>
          <div class="swap-cell-teacher">${escapeHtml(tgt.teacherName)}</div>
          <div class="swap-cell-room">${escapeHtml(tgt.room || "N/A")} · ${escapeHtml(tgt.section || "")}</div>
        </div>
      </div>
      <div class="swap-modal-actions">
        <button class="swap-btn-cancel" onclick="cancelSwapConfirmation()">Cancel</button>
        <button class="swap-btn-confirm" onclick="executeSwap()">Yes, Swap</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function showMoveConfirmation() {
  const src = swapState.sourceCell;
  const tgt = swapState.targetCell;

  const existingModal = document.getElementById('swap-confirm-modal');
  if (existingModal) existingModal.remove();

  const srcTime = formatTimeRange12Hour(src.startTime + "-" + src.endTime);
  const tgtTime = formatTimeRange12Hour(tgt.startTime + "-" + tgt.endTime);

  const modal = document.createElement('div');
  modal.id = 'swap-confirm-modal';
  modal.className = 'swap-modal-overlay active';
  modal.innerHTML = `
    <div class="swap-modal-box">
      <div class="swap-modal-icon"><i class="fa-solid fa-arrow-right-arrow-left"></i></div>
      <h2 class="swap-modal-title">Confirm Move</h2>
      <p class="swap-modal-subtitle">Move this class to the vacant slot?</p>
      <div class="swap-preview">
        <div class="swap-preview-cell">
          <div class="swap-cell-label">From</div>
          <div class="swap-cell-time">${escapeHtml(src.day)} · ${escapeHtml(srcTime)}</div>
          <div class="swap-cell-subject">${escapeHtml(src.subject)}</div>
          <div class="swap-cell-teacher">${escapeHtml(src.teacherName)}</div>
          <div class="swap-cell-room">${escapeHtml(src.room || "N/A")} · ${escapeHtml(src.section || "")}</div>
        </div>
        <div class="swap-arrow"><i class="fa-solid fa-arrow-down"></i></div>
        <div class="swap-preview-cell" style="border-color: rgba(16, 185, 129, 0.5); background: rgba(16, 185, 129, 0.08);">
          <div class="swap-cell-label" style="color: #10b981;">To (Vacant)</div>
          <div class="swap-cell-time">${escapeHtml(tgt.day)} · ${escapeHtml(tgtTime)}</div>
          <div class="swap-cell-subject" style="color: #10b981; font-style: italic;">(vacant slot)</div>
        </div>
      </div>
      <p style="color: #94a3b8; font-size: 0.78rem; margin: 0 0 16px 0;">
        The original slot <strong>${escapeHtml(src.day)} ${escapeHtml(formatTime12Hour(src.startTime))}</strong> will become vacant.
      </p>
      <div class="swap-modal-actions">
        <button class="swap-btn-cancel" onclick="cancelSwapConfirmation()">Cancel</button>
        <button class="swap-btn-confirm" onclick="executeMove()">Yes, Move</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function cancelSwapConfirmation() {
  const modal = document.getElementById('swap-confirm-modal');
  if (modal) modal.remove();
  if (swapState.targetCell?.cellEl) {
    swapState.targetCell.cellEl.classList.remove('cell-target-selected');
  }
  swapState.targetCell = null;
}

// ═══════════════════════════════════════════════════════
// ═══ EXECUTE SWAP/MOVE                                ═══
// ═══════════════════════════════════════════════════════
async function executeSwap() {
  const src = swapState.sourceCell;
  const tgt = swapState.targetCell;
  if (!src || !tgt) return;

  const confirmBtn = document.querySelector('.swap-btn-confirm');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Swapping...';
  }

  const payload = {
    mode: "swap",
    cellA: {
      slotId: src.slotId,
      teacherId: src.teacherId,
      day: src.day,
      startTime: src.startTime,
      endTime: src.endTime,
      section: src.section,
    },
    cellB: {
      slotId: tgt.slotId,
      teacherId: tgt.teacherId,
      day: tgt.day,
      startTime: tgt.startTime,
      endTime: tgt.endTime,
      section: tgt.section,
    },
  };

  try {
    const res = await fetchWithAuth(`${window.location.origin}/api/admin/schedules/swap`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Swap failed");

    const modal = document.getElementById('swap-confirm-modal');
    if (modal) modal.remove();

    showSwapToast(`Swap successful: ${src.subject} and ${tgt.subject}`, 'success');

    swapState.active = false;
    swapState.sourceCell = null;
    swapState.targetCell = null;

    document.querySelectorAll('.swappable-cell').forEach(el => {
      el.classList.remove('cell-source-selected', 'cell-target-selected');
    });

    const banner = document.getElementById('swap-banner');
    if (banner) banner.remove();

    window.__cellDataRegistry = {};

    localStorage.removeItem("cached_generated_schedule");
    localStorage.removeItem("cached_teacher_schedules");

    await new Promise(resolve => setTimeout(resolve, 300));
    await loadExistingSchedule();

  } catch (err) {
    console.error("Swap error:", err);
    const confirmBtnReset = document.querySelector('.swap-btn-confirm');
    if (confirmBtnReset) {
      confirmBtnReset.disabled = false;
      confirmBtnReset.textContent = 'Yes, Swap';
    }
    showSwapToast(err.message, 'error');

    swapState.active = false;
    swapState.sourceCell = null;
    swapState.targetCell = null;
    document.querySelectorAll('.swappable-cell').forEach(el => {
      el.classList.remove('cell-source-selected', 'cell-target-selected');
    });
    const banner = document.getElementById('swap-banner');
    if (banner) banner.remove();
  }
}

async function executeMove() {
  const src = swapState.sourceCell;
  const tgt = swapState.targetCell;
  if (!src || !tgt) return;

  const confirmBtn = document.querySelector('.swap-btn-confirm');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Moving...';
  }

  const payload = {
    mode: "move",
    cellA: {
      slotId: src.slotId,
      teacherId: src.teacherId,
      day: src.day,
      startTime: src.startTime,
      endTime: src.endTime,
      section: src.section,
      targetDay: tgt.day,
      targetStartTime: tgt.startTime,
      targetEndTime: tgt.endTime,
    },
  };

  try {
    const res = await fetchWithAuth(`${window.location.origin}/api/admin/schedules/swap`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Move failed");

    const modal = document.getElementById('swap-confirm-modal');
    if (modal) modal.remove();

    showSwapToast(`Moved ${src.subject} to ${tgt.day} ${formatTime12Hour(tgt.startTime)}.`, 'success');

    swapState.active = false;
    swapState.sourceCell = null;
    swapState.targetCell = null;

    document.querySelectorAll('.swappable-cell').forEach(el => {
      el.classList.remove('cell-source-selected', 'cell-target-selected');
    });

    const banner = document.getElementById('swap-banner');
    if (banner) banner.remove();

    window.__cellDataRegistry = {};

    localStorage.removeItem("cached_generated_schedule");
    localStorage.removeItem("cached_teacher_schedules");

    await new Promise(resolve => setTimeout(resolve, 300));
    await loadExistingSchedule();

  } catch (err) {
    console.error("Move error:", err);
    const confirmBtnReset = document.querySelector('.swap-btn-confirm');
    if (confirmBtnReset) {
      confirmBtnReset.disabled = false;
      confirmBtnReset.textContent = 'Yes, Move';
    }
    showSwapToast(err.message, 'error');

    swapState.active = false;
    swapState.sourceCell = null;
    swapState.targetCell = null;
    document.querySelectorAll('.swappable-cell').forEach(el => {
      el.classList.remove('cell-source-selected', 'cell-target-selected');
    });
    const banner = document.getElementById('swap-banner');
    if (banner) banner.remove();
  }
}

function resetSwapAfterAction() {
  swapState.active = false;
  swapState.sourceCell = null;
  swapState.targetCell = null;
  document.querySelectorAll('.swappable-cell').forEach(el => {
    el.classList.remove('cell-source-selected', 'cell-target-selected');
  });
  const banner = document.getElementById('swap-banner');
  if (banner) banner.remove();
}

function showSwapToast(message, type = 'success') {
  let toast = document.getElementById('swap-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'swap-toast';
    toast.style.cssText = `
      position: fixed; bottom: 30px; right: 30px; padding: 12px 18px;
      border-radius: 8px; font-weight: 600; font-size: 0.85rem;
      z-index: 99999; box-shadow: 0 6px 20px rgba(0,0,0,0.25);
      transition: all 0.25s ease; max-width: 420px;
      font-family: 'Inter', sans-serif; display: flex; align-items: center; gap: 8px;
    `;
    document.body.appendChild(toast);
  }

  const icon = type === 'success'
    ? '<i class="fa-solid fa-circle-check"></i>'
    : '<i class="fa-solid fa-circle-exclamation"></i>';

  toast.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
  toast.style.background = type === 'success' ? '#166534' : '#dc2626';
  toast.style.color = '#ffffff';
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
  }, 3500);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (document.getElementById('swap-confirm-modal')) cancelSwapConfirmation();
    else clearSwapState();
  }
});

// ═══════════════════════════════════════════════════════
// ═══ EDIT + SWAP STYLES                              ═══
// ═══════════════════════════════════════════════════════
(function injectEditSwapStyles() {
  if (document.getElementById('edit-swap-styles')) return;
  const style = document.createElement('style');
  style.id = 'edit-swap-styles';
  style.textContent = `
    .btn-edit-mode {
      display: inline-flex; align-items: center; gap: 6px;
      background: #ffffff; color: #475569;
      border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 6px;
      font-weight: 600; cursor: pointer; font-size: 0.78rem;
      transition: all 0.15s ease; font-family: inherit;
    }
    .btn-edit-mode:hover { background: #f1f5f9; color: #0f172a; }
    .btn-edit-mode.active {
      background: #166534; color: #ffffff; border-color: #166534;
    }
    .btn-edit-mode.active:hover { background: #14532d; }

    .edit-mode-active-banner {
      background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 3px solid #16a34a;
      border-radius: 4px; padding: 10px 14px; margin-bottom: 10px;
      color: #166534; font-size: 0.8rem; line-height: 1.5;
    }

    .swappable-cell { cursor: pointer; transition: all 0.15s ease; }
    .swappable-cell.edit-active:hover {
      outline: 2px solid #16a34a; outline-offset: -2px;
    }
    .swappable-cell.blank-cell {
      background: repeating-linear-gradient(
        45deg, #f8fafc, #f8fafc 6px, #f1f5f9 6px, #f1f5f9 12px
      ) !important;
    }
    .swappable-cell.blank-cell:hover {
      background: repeating-linear-gradient(
        45deg, #ecfdf5, #ecfdf5 6px, #d1fae5 6px, #d1fae5 12px
      ) !important;
    }
    .swappable-cell.cell-source-selected {
      outline: 3px solid #0284c7 !important; outline-offset: -3px;
    }
    .swappable-cell.cell-target-selected {
      outline: 3px solid #16a34a !important; outline-offset: -3px;
    }

    .swap-banner {
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      background: #1e293b; color: #fff; padding: 10px 16px;
      border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.35);
      z-index: 99998; max-width: 90vw;
    }
    .swap-banner-content { display: flex; align-items: center; gap: 10px; }
    .swap-banner-icon { color: #38bdf8; }
    .swap-banner-text { display: flex; flex-direction: column; gap: 2px; font-size: 0.8rem; }
    .swap-banner-text strong { color: #38bdf8; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; }
    .swap-banner-cancel {
      background: transparent; color: #f87171; border: 1px solid #f87171;
      padding: 5px 10px; border-radius: 6px; cursor: pointer;
      font-size: 0.75rem; font-weight: 600; font-family: inherit;
    }
    .swap-banner-cancel:hover { background: rgba(248, 113, 113, 0.15); }

    .swap-modal-overlay {
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      z-index: 100000; opacity: 0; pointer-events: none; transition: opacity 0.2s ease;
    }
    .swap-modal-overlay.active { opacity: 1; pointer-events: auto; }
    .swap-modal-box {
      background: #ffffff; border-radius: 12px; padding: 24px;
      width: 90%; max-width: 460px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.4);
      text-align: center; color: #0f172a; font-family: 'Inter', sans-serif;
    }
    .swap-modal-icon {
      font-size: 1.6rem; color: #0284c7; margin-bottom: 8px;
    }
    .swap-modal-title { margin: 0 0 4px 0; color: #0c2f6b; font-size: 1.15rem; font-weight: 700; }
    .swap-modal-subtitle { margin: 0 0 16px 0; color: #64748b; font-size: 0.82rem; }
    .swap-preview { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
    .swap-preview-cell {
      background: #f8fafc; border: 1px solid #e2e8f0;
      border-radius: 8px; padding: 10px 14px; text-align: left;
    }
    .swap-cell-label { color: #0284c7; font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 4px; }
    .swap-cell-time { color: #334155; font-size: 0.82rem; font-weight: 600; margin-bottom: 3px; }
    .swap-cell-subject { color: #0f172a; font-size: 0.92rem; font-weight: 700; margin-bottom: 2px; }
    .swap-cell-teacher { color: #475569; font-size: 0.78rem; }
    .swap-cell-room { color: #64748b; font-size: 0.72rem; }
    .swap-arrow { font-size: 1rem; color: #0284c7; text-align: center; }
    .swap-modal-actions { display: flex; gap: 10px; justify-content: center; }
    .swap-btn-cancel, .swap-btn-confirm {
      padding: 10px 22px; border-radius: 8px; font-size: 0.85rem;
      font-weight: 600; cursor: pointer; border: none; font-family: inherit;
      transition: all 0.15s ease;
    }
    .swap-btn-cancel { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
    .swap-btn-cancel:hover { background: #e2e8f0; color: #0f172a; }
    .swap-btn-confirm { background: #166534; color: #ffffff; }
    .swap-btn-confirm:hover { background: #14532d; }
    .swap-btn-confirm:disabled { opacity: 0.6; cursor: not-allowed; }

    @media (max-width: 640px) {
      .swap-banner { top: 8px; padding: 8px 12px; font-size: 0.75rem; }
      .swap-banner-content { flex-direction: column; align-items: flex-start; gap: 6px; }
      .swap-modal-box { padding: 18px 16px; max-width: 95vw; }
      .swap-modal-actions { flex-direction: column-reverse; }
      .swap-btn-cancel, .swap-btn-confirm { width: 100%; }
    }
  `;
  document.head.appendChild(style);
})();

// ═══════════════════════════════════════════════════════
// ═══ AUDIT BUILDER                                    ═══
// ═══════════════════════════════════════════════════════
function buildAuditFromMaster(masterSectionSchedules, rawTeachers, rawRooms) {
  const gradeAuditMap = {};

  Object.values(masterSectionSchedules).forEach(secObj => {
    const gName = secObj.gradeLevel;
    const gNum = extractGradeNumber(gName);

    if (!gradeAuditMap[gName]) {
      const assignedTeachers = rawTeachers.filter(t => {
        const tGrade = extractGradeNumber(t.target_grade || t.targetGrade);
        return !tGrade || tGrade === gNum;
      });
      gradeAuditMap[gName] = {
        missingSubjects: [],
        teacherCount: assignedTeachers.length,
        scheduledSubjects: new Set(),
      };
    }

    Object.values(secObj.timetable).forEach(dayObj => {
      Object.values(dayObj).forEach(slot => {
        if (slot && slot.subject) {
          gradeAuditMap[gName].scheduledSubjects.add(sanitizeSubjectName(slot.subject));
        }
      });
    });
  });

  Object.values(masterSectionSchedules).forEach(secObj => {
    const gName = secObj.gradeLevel;
    const gNum = extractGradeNumber(gName);
    if (!gradeAuditMap[gName]) return;

    let required = safeParseArray(secObj.details.subjects);
    if (required.length === 0) {
      required = rawTeachers
        .filter(t => {
          const tGrade = extractGradeNumber(t.target_grade || t.targetGrade);
          return !tGrade || tGrade === gNum;
        })
        .flatMap(t => safeParseArray(t.subjects));
    }

    const uniqueRequired = [...new Set(required.map(r => typeof r === 'string' ? r.trim() : r.name?.trim()).filter(Boolean))];

    uniqueRequired.forEach(req => {
      const reqClean = sanitizeSubjectName(req);
      if (!gradeAuditMap[gName].scheduledSubjects.has(reqClean)) {
        if (!gradeAuditMap[gName].missingSubjects.includes(req)) {
          gradeAuditMap[gName].missingSubjects.push(req);
        }
      }
    });
  });

  return {
    totalSections: Object.keys(masterSectionSchedules).length,
    totalTeachers: rawTeachers.length,
    totalRooms: rawRooms.length,
    gradeAuditMap,
  };
}

// ═══════════════════════════════════════════════════════
// ═══ GENERATE NEW SCHEDULE                            ═══
// ═══════════════════════════════════════════════════════
async function generateNewSchedule() {
  console.log("Executing JHS Master Schedule Generation...");

  if (!requireAuth("admin")) return;

  let container = document.getElementById("timetable-matrix-output-body") ||
                  document.querySelector('.dashboard-card-panel') ||
                  document.querySelector('.main-content') ||
                  document.body;

  const startedAt = Date.now();

  container.innerHTML = `
    <style>
      @keyframes genSpin { to { transform: rotate(360deg); } }
      @keyframes genBounce {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
        40% { transform: scale(1); opacity: 1; }
      }
      .gen-loading-wrap { text-align: center; padding: 60px 20px; font-family: 'Inter', sans-serif; }
      .gen-spinner {
        width: 48px; height: 48px; margin: 0 auto 18px;
        border: 4px solid #d1fae5; border-top-color: #166534;
        border-radius: 50%; animation: genSpin 0.8s linear infinite;
      }
      .gen-loading-title { font-size: 1rem; font-weight: 700; color: #0c2f6b; margin-bottom: 8px; }
      .gen-loading-sub { font-size: 0.82rem; color: #94a3b8; margin-bottom: 16px; }
      .gen-loading-dots { display: inline-flex; gap: 6px; }
      .gen-loading-dots span {
        width: 8px; height: 8px; background: #16a34a; border-radius: 50%;
        animation: genBounce 1.4s ease-in-out infinite both;
      }
      .gen-loading-dots span:nth-child(1) { animation-delay: -0.32s; }
      .gen-loading-dots span:nth-child(2) { animation-delay: -0.16s; }
      .gen-loading-dots span:nth-child(3) { animation-delay: 0s; }
    </style>
    <div class="gen-loading-wrap">
      <div class="gen-spinner"></div>
      <div class="gen-loading-title">Generating schedule…</div>
      <div class="gen-loading-sub">Resolving conflicts and matching teachers to sections.</div>
      <div class="gen-loading-dots">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;

  try {
    const baseOrigin = window.location.origin;

    const res = await fetchWithAuth(`${baseOrigin}/api/admin/generate-jhs-master`, {
      method: "POST",
      body: JSON.stringify({ sectionOverrides: {} })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "JHS generation failed");

    console.log(`JHS master saved: ${data.sectionsProcessed} sections, ${data.teachersUpdated} teachers`);

    if (data.skippedSections && data.skippedSections.length > 0) {
      localStorage.setItem("cached_skipped_sections", JSON.stringify(data.skippedSections));
      console.warn(`[JHS] ${data.skippedSections.length} section(s) skipped:`, data.skippedSections);
    } else {
      localStorage.removeItem("cached_skipped_sections");
    }

    const elapsed = Date.now() - startedAt;
    const MIN_VISIBLE_MS = 800;
    if (elapsed < MIN_VISIBLE_MS) {
      await new Promise(resolve => setTimeout(resolve, MIN_VISIBLE_MS - elapsed));
    }

    await loadExistingSchedule();

    renderSkippedSectionsBanner(data.skippedSections || []);

  } catch (err) {
    console.error("JHS generation failed:", err);
    if (err.message.includes("Session expired")) return;
    
    container.innerHTML = `<div style="color:#dc2626;padding:24px;background:#fef2f2;border-left:3px solid #dc2626;border-radius:4px;font-size:0.85rem;">Error: ${escapeHtml(err.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════
// ═══ LOAD EXISTING SCHEDULE                           ═══
// ═══════════════════════════════════════════════════════
async function loadExistingSchedule() {
  console.log("Loading master schedules from DB...");

  if (!requireAuth("admin")) return;

  let container = document.getElementById("timetable-matrix-output-body") ||
                  document.querySelector('.dashboard-card-panel') ||
                  document.querySelector('.main-content') ||
                  document.body;

  try {
    const baseOrigin = window.location.origin;

    const [schedRes, teachersRes, roomsRes, sectionsRes] = await Promise.all([
      fetchWithAuth(`${baseOrigin}/api/admin/schedules?_t=${Date.now()}`),
      fetchWithAuth(`${baseOrigin}/api/admin/teachers`),
      fetchWithAuth(`${baseOrigin}/api/admin/rooms`),
      fetchWithAuth(`${baseOrigin}/api/admin/sections`)
    ]);

    const rawSchedules = schedRes.ok ? await schedRes.json() : [];
    const rawTeachers = teachersRes.ok ? await teachersRes.json() : [];
    const rawRooms = roomsRes.ok ? await roomsRes.json() : [];
    const rawSections = sectionsRes.ok ? await sectionsRes.json() : [];

    window.roomsCache = Array.isArray(rawRooms) ? rawRooms : [];

    const daySlots = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const timeSlots = [
      "06:00-07:00", "07:00-08:00", "08:00-09:00", "09:00-09:15",
      "09:15-10:15", "10:15-11:15", "11:15-12:15",
      "12:15-13:45", "13:45-14:45", "14:45-15:00",
      "15:00-16:00", "16:00-17:00", "17:00-18:00", "18:00-19:00"
    ];

    const masterSectionSchedules = {};

    rawSections.forEach(sec => {
      const gradeNum = jhsGradeNumFromString(sec.gradeLevel || sec.grade_level);
      if (gradeNum < 7 || gradeNum > 10) return;

      masterSectionSchedules[sec.name] = {
        details: sec,
        gradeLevel: `Junior High School - Grade ${gradeNum}`,
        shift: "FULL",
        slots: [],
        timetable: {}
      };
      daySlots.forEach(d => { masterSectionSchedules[sec.name].timetable[d] = {}; });
    });

    rawSchedules.forEach(sched => {
      const teacherId = sched.teacher_id;
      const teacherInfo = rawTeachers.find(t => String(t.id) === String(teacherId));
      if (!teacherInfo) return;
      const teacherFullName = `${teacherInfo.first_name || ''} ${teacherInfo.last_name || ''}`.trim();

      const slots = Array.isArray(sched.slots) ? sched.slots : safeParseArray(sched.slots);

      slots.forEach(slot => {
        const sectionName = slot.section;
        if (!masterSectionSchedules[sectionName]) return;

        const rawDay = slot.day || '';
        const normDay = rawDay.charAt(0).toUpperCase() + rawDay.slice(1).toLowerCase();
        const timeKey = `${slot.startTime}-${slot.endTime}`;

        const displayTeacherId = slot.teacherId != null ? slot.teacherId : teacherId;
        const displayTeacherName = slot.teacherName || teacherFullName;

        masterSectionSchedules[sectionName].timetable[normDay][timeKey] = {
          id: slot.id,
          subject: slot.subject,
          teacher: displayTeacherName,
          teacherId: displayTeacherId,
          room: slot.room || 'N/A',
          gradeLevel: slot.gradeLevel,
        };
      });
    });

    const auditSummary = buildAuditFromMaster(
      masterSectionSchedules,
      Array.isArray(rawTeachers) ? rawTeachers : [],
      Array.isArray(rawRooms) ? rawRooms : []
    );

    localStorage.setItem("cached_generated_schedule", JSON.stringify({
      masterSectionSchedules,
      auditSummary,
      daySlots, timeSlots, normalizedTeachers: []
    }));

    renderMasterSectionScheduleDashboard(
      container,
      masterSectionSchedules,
      auditSummary,
      daySlots, timeSlots, []
    );

  } catch (err) {
    console.error("Load failed:", err);
    if (err.message.includes("Session expired")) return;

    container.innerHTML = `<div style="color:#dc2626;padding:24px;background:#fef2f2;border-left:3px solid #dc2626;border-radius:4px;font-size:0.85rem;">Error: ${escapeHtml(err.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════
// ═══ PRINT CSS (shared for iframe)                    ═══
// ═══════════════════════════════════════════════════════
function getPrintCSS() {
  return `
    @page {
      size: letter landscape;
      margin: 0.2in 0.15in 0.1in 0.15in;
    }
    /* ═══ ALISIN ANG PAGE NUMBER ═══ */
    @page {
      @bottom-left { content: none !important; }
      @bottom-center { content: none !important; }
      @bottom-right { content: none !important; }
      @top-left { content: none !important; }
      @top-center { content: none !important; }
      @top-right { content: none !important; }
    }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box !important; }
    html, body { margin: 0; padding: 0; background: #fff; font-family: 'Times New Roman', Arial, sans-serif; }

    .print-page {
      width: 10.7in;
      height: 8.1in;
      padding: 0;
      margin: 0 auto;
      background: #fff;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      page-break-after: always;
    }
    .print-page:last-child { page-break-after: auto; }

    /* ═══ HEADER (BALANCED SIZE) ═══ */
    .print-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 6pt;
      margin-bottom: 6pt;
      flex-shrink: 0;
      border-bottom: none !important;
    }
    .print-header-left { display: flex; align-items: center; gap: 12pt; }
    .print-header-logo { width: 62pt; height: 62pt; object-fit: contain; }
    .print-header-school-name {
      font-family: 'UnifrakturMaguntia','Cinzel',serif;
      font-size: 22pt;
      font-weight: 700;
      color: #000;
      line-height: 1.05;
    }
    .print-header-school-address {
      font-size: 11pt;
      color: #333;
      font-style: italic;
      margin-top: 3pt;
    }
    .print-header-right { text-align: right; }
    .print-header-section-name {
      font-family: 'Cinzel','Inter',serif;
      font-size: 22pt;
      font-weight: 800;
      color: #000;
      text-transform: uppercase;
      line-height: 1.05;
    }
    .print-header-dept {
      font-size: 11pt;
      color: #333;
      margin-top: 2pt;
    }
    .print-header-sy {
      font-size: 11pt;
      font-weight: 600;
      color: #333;
      margin-top: 2pt;
    }

    /* ═══ GRADE HEADER — SCREEN ONLY, HIDDEN IN PRINT ═══ */
    .grade-header {
      display: none !important;
    }

    /* ═══ TABLE: BLACK BORDERS ═══ */
    table {
      width: 100%;
      flex: 1;
      border-collapse: collapse;
      table-layout: fixed;
      border: 1pt solid #000;
      margin: 0;
      padding: 0;
    }
    thead tr { height: 24pt; }
    tbody tr { height: 30pt; }
    th, td {
      border: 0.75pt solid #000 !important;
      padding: 3pt 2pt;
      text-align: center;
      vertical-align: middle;
      word-wrap: break-word;
      line-height: 1.1;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      box-sizing: border-box !important;
    }
    /* ═══ ALISIN ANG DOUBLE BORDER SA EDGE ═══ */
    table > thead > tr > th:first-child,
    table > tbody > tr > td:first-child {
      border-left: none !important;
    }
    table > thead > tr > th:last-child,
    table > tbody > tr > td:last-child {
      border-right: none !important;
    }
    table > thead > tr:first-child > th {
      border-top: none !important;
    }
    table > tbody > tr:last-child > td {
      border-bottom: none !important;
    }

    thead th {
      background: #e2e8f0;
      font-weight: 900;
      font-size: 11pt;
      text-transform: uppercase;
      height: 24pt;
      color: #000;
    }
    /* ═══ WIDER TIME COLUMN (22%) + BIGGER FONT ═══ */
    thead th:first-child {
      width: 22% !important;
      font-size: 11pt !important;
    }
    tbody td:first-child {
      background: #f8fafc;
      font-weight: 900;
      font-size: 10pt !important;
      width: 22% !important;
      white-space: nowrap;
      padding: 3pt 2pt !important;
    }
    tbody td { font-size: 9.5pt; }
    tbody td > div:first-child { font-size: 10pt; font-weight: 900; }
    tbody td > div:nth-child(2) { font-size: 8.5pt; font-weight: 700; }
    tbody tr td[colspan] {
      background: #f1f5f9;
      font-weight: 800;
      letter-spacing: 0.5px;
      height: 20pt;
    }

    .flag-raising-cell { background: #fef3c7 !important; color: #92400e !important; }
    .break-cell { background: #f1f5f9 !important; }

    /* ═══ FOOTER (MAY GENERATED TIMESTAMP) ═══ */
    .print-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 6pt;
      font-style: italic;
      color: #555;
      font-size: 9pt;
      flex-shrink: 0;
    }
    .print-footer-left { text-align: left; }
    .print-footer-right { text-align: right; }
    .print-footer-principal {
      font-family: 'Cinzel','Inter',serif;
      font-weight: 700;
      font-size: 11pt;
      color: #000;
      margin-bottom: 1pt;
    }
    .print-footer-principal-title { font-size: 9pt; color: #333; font-style: italic; }
  `;
}

// ═══════════════════════════════════════════════════════
// ═══ RENDERER (FULL DAY 6AM-7PM)                     ═══
// ═══════════════════════════════════════════════════════
function renderMasterSectionScheduleDashboard(container, masterSectionSchedules, auditSummary, daySlots, timeSlots, normalizedTeachers) {
  const existingBanner = document.getElementById('skipped-sections-banner');
  if (existingBanner) existingBanner.remove();

  container.innerHTML = "";
  window.__cellDataRegistry = {};

  const roomsCache = window.roomsCache || [];

  // ═══ TEACHER LOAD MAP ═══
  const teacherLoadMap = buildTeacherLoadMap(masterSectionSchedules);
  localStorage.setItem("cached_teacher_load", JSON.stringify(teacherLoadMap));

  const teacherSchedulesMap = {};
  Object.values(masterSectionSchedules).forEach(secObj => {
    const sectionName = secObj.details.name;
    const gradeLevel = secObj.gradeLevel;
    Object.entries(secObj.timetable).forEach(([day, times]) => {
      Object.entries(times).forEach(([time, slotData]) => {
        if (slotData && slotData.teacher) {
          const rawTeacher = slotData.teacher.trim();
          const normalizedKey = sanitizeTeacherKey(rawTeacher);
          if (!teacherSchedulesMap[normalizedKey]) teacherSchedulesMap[normalizedKey] = { teacherName: rawTeacher, days: {} };
          if (!teacherSchedulesMap[normalizedKey].days[day]) teacherSchedulesMap[normalizedKey].days[day] = {};
          teacherSchedulesMap[normalizedKey].days[day][time] = {
            subject: slotData.subject, section: sectionName, gradeLevel, room: slotData.room || "N/A"
          };
        }
      });
    });
  });

  localStorage.setItem("cached_teacher_schedules", JSON.stringify(teacherSchedulesMap));
  localStorage.setItem("global_master_schedule", JSON.stringify(masterSectionSchedules));

  if (!document.getElementById("printable-schedule-css")) {
    const styleEl = document.createElement("style");
    styleEl.id = "printable-schedule-css";
    styleEl.innerHTML = `
      /* ═══════════════════════════════════════════════════════ */
      /* ═══ GRADE HEADER — ULTRA LOCK (OVERRIDES generate.css) ═══ */
      /* ═══════════════════════════════════════════════════════ */
      html body .main-content .grade-header,
      html body div.grade-header,
      body .grade-header {
        display: grid !important;
        grid-template-columns: 1fr auto !important;
        grid-auto-flow: column !important;
        align-items: center !important;
        gap: 10px !important;
        overflow: visible !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      html body .main-content .grade-header > h2,
      html body div.grade-header > h2,
      body .grade-header > h2 {
        display: block !important;
        grid-column: 1 !important;
        min-width: 0 !important;
        max-width: 100% !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        margin: 0 !important;
        flex: none !important;
      }
      html body .main-content .grade-header > div,
      html body div.grade-header > div,
      body .grade-header > div {
        display: flex !important;
        grid-column: 2 !important;
        flex-direction: row !important;
        flex-wrap: nowrap !important;
        gap: 6px !important;
        align-items: center !important;
        white-space: nowrap !important;
        flex-shrink: 0 !important;
        width: auto !important;
      }

      /* ═══ GENERAL HEADER STYLES ═══ */
      .print-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding-bottom: 10px;
        border-bottom: none;
        margin-bottom: 12px;
      }
      .print-header-left { display: flex; align-items: center; gap: 14px; }
      .print-header-logo { width: 60px; height: 60px; object-fit: contain; flex-shrink: 0; }
      .print-header-school-name {
        font-family: 'UnifrakturMaguntia', 'Cinzel', serif;
        font-weight: 700;
        font-size: 1.5rem;
        color: #0c2f6b;
        line-height: 1.1;
      }
      .print-header-school-address { font-size: 0.85rem; color: #64748b; font-style: italic; margin-top: 3px; }
      .print-header-right { text-align: right; flex-shrink: 0; }
      .print-header-section-name {
        font-family: 'Cinzel', 'Inter', serif;
        font-weight: 800;
        font-size: 1.5rem;
        color: #0c2f6b;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        line-height: 1.1;
      }
      .print-header-subtitle { font-size: 0.95rem; font-style: italic; color: #334155; margin-top: 3px; }
      .print-header-dept { font-size: 0.85rem; color: #475569; margin-top: 4px; }
      .print-header-sy { font-size: 0.85rem; font-weight: 600; color: #475569; margin-top: 2px; }
      .print-footer {
        margin-top: 8px;
        font-size: 0.75rem;
        font-style: italic;
        color: #475569;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
      }
      .print-footer-left { text-align: left; }
      .print-footer-right { text-align: right; }
      .print-footer-principal {
        font-family: 'Cinzel', 'Inter', serif;
        font-weight: 700;
        font-size: 0.95rem;
        color: #0c2f6b;
        margin-bottom: 2px;
      }
      .print-footer-principal-title { font-size: 0.8rem; color: #475569; font-style: italic; }

      .flag-raising-cell { background: #fef3c7 !important; color: #92400e !important; }
      .break-cell {
        background: #f1f5f9 !important;
        font-weight: 700;
        letter-spacing: 1px;
        text-transform: uppercase;
        color: #475569;
      }

      /* ═══ BLACK BORDERS + WIDER TIME COLUMN ON SCREEN ═══ */
      .schedule-table {
        width: 100%;
        border-collapse: collapse;
        min-width: 900px;
        text-align: center;
        font-size: 0.78rem;
        border: 1.5px solid #000;
        font-family: 'Times New Roman', 'Merriweather', serif;
        table-layout: fixed;
      }
      .schedule-table th,
      .schedule-table td {
        border: 1px solid #000 !important;
      }
      .schedule-table th.time-col,
      .schedule-table td.time-col {
        width: 22% !important;
      }
      .schedule-table td.time-col {
        white-space: nowrap;
        font-size: 0.82rem;
      }

      .section-pdf-export { background: #fff !important; padding: 20px !important; border: none !important; }
      .section-pdf-export .no-print { display: none !important; }

      /* ═══ SEARCH HIGHLIGHT ═══ */
      .search-highlight {
        box-shadow: 0 0 0 3px #fbbf24, 0 0 20px rgba(251, 191, 36, 0.5) !important;
        animation: searchPulse 1.5s ease-in-out infinite;
      }
      @keyframes searchPulse {
        0%, 100% { box-shadow: 0 0 0 3px #fbbf24, 0 0 20px rgba(251, 191, 36, 0.5); }
        50% { box-shadow: 0 0 0 5px #f59e0b, 0 0 30px rgba(251, 191, 36, 0.8); }
      }

      /* ═══ PRINT STYLES (SCREEN FALLBACK ONLY) ═══ */
      @media print {
        .sidebar, .sidebar-expand-btn, .toolbar, .page-head, .section-heading,
        .audit-summary, .grade-header, .no-print, .btn-edit-mode,
        .edit-mode-active-banner, button, .swap-banner, .swap-modal-overlay,
        #skipped-sections-banner, #teacher-load-panel, #section-search-dropdown {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(styleEl);
  }

  const mainWrapper = document.createElement("div");
  mainWrapper.style.marginTop = "20px";
  container.appendChild(mainWrapper);

  let totalMissingSubjectsCount = 0;
  Object.values(auditSummary.gradeAuditMap || {}).forEach(g => {
    totalMissingSubjectsCount += (g.missingSubjects || []).length;
  });

  const summaryCard = document.createElement("div");
  summaryCard.className = "no-print audit-summary";

  const statusColor = totalMissingSubjectsCount === 0 ? "#16a34a" : "#dc2626";
  const statusText = totalMissingSubjectsCount === 0
    ? "All grade levels fully scheduled"
    : `${totalMissingSubjectsCount} unassigned subject class(es)`;
  const statusIcon = totalMissingSubjectsCount === 0
    ? '<i class="fa-solid fa-circle-check"></i>'
    : '<i class="fa-solid fa-triangle-exclamation"></i>';

  let auditHTML = `
    <div class="audit-header">
        <div class="audit-title-row">
            <h3>Resource &amp; Capacity Audit</h3>
            <span class="audit-status" style="color:${statusColor};">
                ${statusIcon}
                ${statusText}
            </span>
        </div>
        <div class="audit-stats">
            <div class="audit-stat">
                <span class="audit-stat-label">Sections</span>
                <span class="audit-stat-value">${auditSummary.totalSections}</span>
            </div>
            <div class="audit-stat">
                <span class="audit-stat-label">Teachers</span>
                <span class="audit-stat-value">${auditSummary.totalTeachers}</span>
            </div>
            <div class="audit-stat">
                <span class="audit-stat-label">Rooms</span>
                <span class="audit-stat-value">${auditSummary.totalRooms}</span>
            </div>
        </div>
        <div class="audit-tip">
            <strong>How to edit:</strong> Click <strong>Edit Mode</strong> on any section, then click two class cells to swap them, or click a class cell and then a vacant cell to move it.
        </div>
    </div>
  `;

  let activeShortageCardCount = 0;

  Object.keys(auditSummary.gradeAuditMap || {})
    .sort((a, b) => {
      const na = parseInt((a.match(/\d+/) || [0])[0], 10);
      const nb = parseInt((b.match(/\d+/) || [0])[0], 10);
      return na - nb;
    })
    .forEach(grade => {
      const item = auditSummary.gradeAuditMap[grade];
      if ((item.missingSubjects && item.missingSubjects.length > 0) || item.teacherCount === 0) {
        activeShortageCardCount++;
        auditHTML += `
          <div class="audit-warning">
              <div class="audit-warning-head">
                  <span class="audit-warning-grade">
                      <i class="fa-solid fa-triangle-exclamation"></i>
                      ${grade} — ${item.teacherCount} teacher(s) assigned
                  </span>
                  <a href="Addteacher.html" class="audit-warning-action">+ Assign Teacher</a>
              </div>
              <p class="audit-warning-msg">
                  ${item.teacherCount === 0
                      ? "Cannot generate timetable — no instructors assigned to this grade level."
                      : "The following required subjects could not be scheduled due to teacher shortage:"}
              </p>
              <div class="audit-warning-list">
                  ${(item.missingSubjects || []).map(subj => `<span class="audit-warning-chip">${escapeHtml(subj)}</span>`).join('')}
              </div>
          </div>
        `;
      }
    });

  if (activeShortageCardCount === 0) {
    auditHTML += `
      <div class="audit-ok">
          <i class="fa-solid fa-circle-check"></i>
          No schedule shortages detected. All sections fully scheduled.
      </div>
    `;
  }

  summaryCard.innerHTML = auditHTML;
  mainWrapper.appendChild(summaryCard);

  // ═══════════════════════════════════════════════════════
  // ═══ TEACHER LOAD PANEL                              ═══
  // ═══════════════════════════════════════════════════════
  const teacherLoadPanel = document.createElement("div");
  teacherLoadPanel.id = "teacher-load-panel";
  teacherLoadPanel.className = "no-print";
  teacherLoadPanel.style.cssText = `
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-left: 3px solid #16a34a;
    border-radius: 6px;
    margin: 12px 0 16px 0;
    font-family: 'Inter', sans-serif;
    overflow: hidden;
  `;

  const loadEntries = Object.values(teacherLoadMap).sort((a, b) => b.totalSlots - a.totalSlots);
  const teacherLoadItemsHTML = loadEntries.length > 0
    ? loadEntries.map(t => `
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 5px 12px;
          border-bottom: 1px solid #bbf7d0;
          font-size: 0.78rem;
        ">
          <div style="display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden;">
            <i class="fa-solid fa-chalkboard-user" style="color: #16a34a; font-size: 0.75rem; flex-shrink: 0;"></i>
            <span style="font-weight: 700; color: #166534; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHtml(t.teacherName)}
            </span>
            <span style="color: #64748b; font-size: 0.7rem; white-space: nowrap; flex-shrink: 0;">
              (${t.sections.size} section${t.sections.size !== 1 ? 's' : ''})
            </span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
            <span style="
              padding: 2px 8px;
              background: #16a34a;
              color: #fff;
              border-radius: 10px;
              font-size: 0.7rem;
              font-weight: 700;
            ">
              ${t.totalSlots} slot${t.totalSlots !== 1 ? 's' : ''}
            </span>
            <span style="color: #64748b; font-size: 0.7rem;">
              (${t.totalSlots}h/wk)
            </span>
          </div>
        </div>
      `).join('')
    : `<div style="padding: 12px; text-align: center; color: #64748b; font-size: 0.8rem;">Walang teachers na may naka-schedule.</div>`;

  teacherLoadPanel.innerHTML = `
    <div style="
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: #dcfce7;
      cursor: pointer;
      user-select: none;
    " onclick="
      const body = this.nextElementSibling;
      const chevron = this.querySelector('.chevron');
      if (body.style.display === 'none') {
        body.style.display = 'block';
        chevron.style.transform = 'rotate(0deg)';
      } else {
        body.style.display = 'none';
        chevron.style.transform = 'rotate(-90deg)';
      }
    ">
      <div style="display: flex; align-items: center; gap: 8px;">
        <i class="fa-solid fa-users-rectangle" style="color: #16a34a; font-size: 0.9rem;"></i>
        <span style="font-size: 0.82rem; font-weight: 700; color: #166534;">
          Teacher Load Summary
        </span>
        <span style="font-size: 0.72rem; color: #166534; font-weight: 400;">
          — ${loadEntries.length} teacher${loadEntries.length !== 1 ? 's' : ''} assigned
        </span>
      </div>
      <i class="fa-solid fa-chevron-down chevron" style="color: #16a34a; font-size: 0.75rem; transition: transform 0.2s; transform: rotate(0deg);"></i>
    </div>
    <div style="max-height: 200px; overflow-y: auto;">
      ${teacherLoadItemsHTML}
    </div>
  `;

  mainWrapper.appendChild(teacherLoadPanel);

  // ═══════════════════════════════════════════════════════
  // ═══ PRINT SECTION (IFRAME METHOD)                   ═══
  // ═══════════════════════════════════════════════════════
  window.printSectionSchedule = function(cardId) {
    const cardTarget = document.getElementById(cardId);
    if (!cardTarget) return;

    const clone = cardTarget.cloneNode(true);
    clone.querySelectorAll('.no-print, button, .btn-edit-mode, .edit-mode-active-banner, .swap-banner, .swap-modal-overlay, #skipped-sections-banner').forEach(el => el.remove());

    let printFrame = document.getElementById('mis-print-frame');
    if (printFrame) printFrame.remove();

    printFrame = document.createElement('iframe');
    printFrame.id = 'mis-print-frame';
    printFrame.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentWindow.document;

    frameDoc.open();
    frameDoc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Schedule</title>
        <style>${getPrintCSS()}</style>
      </head>
      <body>
        <div class="print-page">
          ${clone.innerHTML}
        </div>
      </body>
      </html>
    `);
    frameDoc.close();

    setTimeout(() => {
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
      
      setTimeout(() => {
        if (document.body.contains(printFrame)) printFrame.remove();
      }, 1000);
    }, 500);
  };

  window.printGradeLevel = function(gradeLevelKey) {
    const allCards = document.querySelectorAll('[id^="sched-"]');
    const gradeCards = [];

    allCards.forEach(card => {
      if (card.id.includes(gradeLevelKey)) {
        gradeCards.push(card);
      }
    });

    if (gradeCards.length === 0) {
      alert("Walang sections na naka-generate para sa grade level na ito.");
      return;
    }

    const clones = gradeCards.map(card => {
      const clone = card.cloneNode(true);
      clone.querySelectorAll('.no-print, button, .btn-edit-mode, .edit-mode-active-banner, .swap-banner, .swap-modal-overlay, #skipped-sections-banner').forEach(el => el.remove());
      return clone.innerHTML;
    });

    let printFrame = document.getElementById('mis-print-frame');
    if (printFrame) printFrame.remove();

    printFrame = document.createElement('iframe');
    printFrame.id = 'mis-print-frame';
    printFrame.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentWindow.document;

    const pagesHTML = clones.map(html => `<div class="print-page">${html}</div>`).join('');

    frameDoc.open();
    frameDoc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Schedule</title>
        <style>${getPrintCSS()}</style>
      </head>
      <body>
        ${pagesHTML}
      </body>
      </html>
    `);
    frameDoc.close();

    setTimeout(() => {
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
      
      setTimeout(() => {
        if (document.body.contains(printFrame)) printFrame.remove();
      }, 1000);
    }, 500);
  };

  window.downloadSectionPDF = async function(cardId, sectionName) {
    const originalCard = document.getElementById(cardId);
    if (!originalCard) return;

    if (typeof html2canvas === "undefined") {
      alert("html2canvas library not loaded. Please refresh the page (Ctrl+Shift+R).");
      return;
    }
    if (typeof window.jspdf === "undefined" || typeof window.jspdf.jsPDF === "undefined") {
      alert("jsPDF library not loaded. Please refresh the page (Ctrl+Shift+R).");
      return;
    }
    const { jsPDF } = window.jspdf;

    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'pdf-loading-overlay';
    loadingOverlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.9); z-index: 2147483647;
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 1rem; font-weight: 600; font-family: 'Inter', sans-serif;
    `;
    loadingOverlay.innerHTML = `
      <div style="text-align: center;">
        <div style="font-size: 2rem; margin-bottom: 10px;"><i class="fa-solid fa-file-pdf"></i></div>
        <div>Generating PDF...</div>
      </div>
    `;
    document.body.appendChild(loadingOverlay);

    const clone = originalCard.cloneNode(true);
    clone.querySelectorAll('.no-print, button, .btn-edit-mode, .edit-mode-active-banner, .swap-banner, .swap-modal-overlay, #skipped-sections-banner').forEach(el => el.remove());

    clone.style.cssText = `
      width: 1056px !important;
      height: 800px !important;
      padding: 15px 20px !important;
      margin: 0 !important;
      border: none !important;
      border-radius: 0 !important;
      overflow: hidden !important;
      background: #ffffff !important;
      box-sizing: border-box !important;
      font-family: 'Times New Roman', Arial, sans-serif !important;
      display: flex !important;
      flex-direction: column !important;
    `;

    const container = document.createElement('div');
    container.id = 'pdf-export-container';
    container.style.cssText = `
      position: fixed; top: 0; left: 0;
      width: 1056px; height: 800px;
      background: #ffffff; z-index: 2147483646;
      overflow: hidden;
    `;
    container.appendChild(clone);
    document.body.appendChild(container);

    const styleId = 'pdf-export-styles';
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) existingStyle.remove();

    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.innerHTML = `
      /* ═══ BALANCED HEADER SA PDF ═══ */
      #pdf-export-container .print-header {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding-bottom: 6px !important;
        margin-bottom: 6px !important;
        flex-shrink: 0 !important;
        border-bottom: none !important;
      }
      #pdf-export-container .print-header-left {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
      }
      #pdf-export-container .print-header-logo {
        width: 62px !important;
        height: 62px !important;
        object-fit: contain !important;
        flex-shrink: 0 !important;
      }
      #pdf-export-container .print-header-school-name {
        font-family: 'UnifrakturMaguntia', 'Cinzel', serif !important;
        font-size: 22pt !important;
        font-weight: 700 !important;
        color: #000 !important;
        line-height: 1.05 !important;
        white-space: nowrap !important;
      }
      #pdf-export-container .print-header-school-address {
        font-size: 11pt !important;
        color: #333 !important;
        font-style: italic !important;
        margin-top: 3px !important;
      }
      #pdf-export-container .print-header-right {
        text-align: right !important;
        flex-shrink: 0 !important;
      }
      #pdf-export-container .print-header-section-name {
        font-family: 'Cinzel', 'Inter', serif !important;
        font-size: 22pt !important;
        font-weight: 800 !important;
        color: #000 !important;
        text-transform: uppercase !important;
        line-height: 1.05 !important;
        white-space: nowrap !important;
      }
      #pdf-export-container .print-header-dept {
        font-size: 11pt !important;
        color: #333 !important;
        margin-top: 3px !important;
      }
      #pdf-export-container .print-header-sy {
        font-size: 11pt !important;
        font-weight: 600 !important;
        color: #333 !important;
        margin-top: 2px !important;
      }

      /* ═══ BLACK BORDERS SA PDF ═══ */
      #pdf-export-container table {
        width: 100% !important;
        height: 100% !important;
        flex: 1 !important;
        border-collapse: collapse !important;
        table-layout: fixed !important;
        border: 1pt solid #000 !important;
        margin: 0 !important;
        page-break-inside: avoid !important;
      }
      #pdf-export-container thead tr {
        height: 28px !important;
      }
      #pdf-export-container tbody tr {
        height: auto !important;
      }
      #pdf-export-container th,
      #pdf-export-container td {
        border: 0.75pt solid #000 !important;
        padding: 4px 3px !important;
        text-align: center !important;
        vertical-align: middle !important;
        word-wrap: break-word !important;
        overflow-wrap: break-word !important;
        line-height: 1.15 !important;
        font-size: 9.5pt !important;
        box-sizing: border-box !important;
      }
      #pdf-export-container thead th {
        background: #e2e8f0 !important;
        color: #000 !important;
        font-weight: 900 !important;
        font-size: 10.5pt !important;
        padding: 6px 3px !important;
        text-transform: uppercase !important;
        letter-spacing: 0.3px !important;
        height: 28px !important;
      }
      /* ═══ WIDER TIME COLUMN (22%) + BIGGER FONT SA PDF ═══ */
      #pdf-export-container thead th:first-child {
        width: 22% !important;
        font-size: 11pt !important;
      }
      #pdf-export-container tbody td:first-child {
        background: #f8fafc !important;
        font-weight: 900 !important;
        font-size: 10pt !important;
        width: 22% !important;
        padding: 4px 2px !important;
        white-space: nowrap !important;
      }
      #pdf-export-container tbody td {
        font-size: 9.5pt !important;
        padding: 4px 3px !important;
      }
      #pdf-export-container tbody td > div:first-child {
        font-size: 10pt !important;
        font-weight: 900 !important;
        color: #000 !important;
        line-height: 1.1 !important;
      }
      #pdf-export-container tbody td > div:nth-child(2) {
        font-size: 8.5pt !important;
        font-weight: 700 !important;
        color: #222 !important;
        margin-top: 1px !important;
      }
      #pdf-export-container tbody tr td[colspan] {
        background: #f1f5f9 !important;
        font-size: 10pt !important;
        font-weight: 800 !important;
        padding: 5px !important;
        letter-spacing: 0.5px !important;
      }
      #pdf-export-container .flag-raising-cell {
        background: #fef3c7 !important;
        color: #92400e !important;
      }
      #pdf-export-container .print-footer {
        display: flex !important;
        justify-content: space-between !important;
        align-items: flex-end !important;
        padding-top: 6px !important;
        margin-top: 6px !important;
        font-style: italic !important;
        color: #555 !important;
        font-size: 8.5pt !important;
        flex-shrink: 0 !important;
      }
      #pdf-export-container .print-footer-principal {
        font-family: 'Cinzel', 'Inter', serif !important;
        font-weight: 700 !important;
        font-size: 11pt !important;
        color: #000 !important;
        margin-bottom: 1px !important;
      }
      #pdf-export-container .print-footer-principal-title {
        font-size: 9pt !important;
        color: #333 !important;
        font-style: italic !important;
      }
      #pdf-export-container * {
        box-sizing: border-box !important;
      }
    `;
    document.head.appendChild(styleEl);

    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: 1056,
        height: 800,
        windowWidth: 1056,
        windowHeight: 800,
        allowTaint: true,
        removeContainer: false,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.98);

      const pdf = new jsPDF({
        unit: 'in',
        format: 'letter',
        orientation: 'landscape',
        compress: true,
      });

      const pageWidth = 11;
      const pageHeight = 8.5;
      const margin = 0.1;
      const usableWidth = pageWidth - (margin * 2);
      const usableHeight = pageHeight - (margin * 2);

      let imgWidth = usableWidth;
      let imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (imgHeight > usableHeight) {
        imgHeight = usableHeight;
        imgWidth = (canvas.width * imgHeight) / canvas.height;
      }

      const xOffset = margin + (usableWidth - imgWidth) / 2;
      const yOffset = margin + (usableHeight - imgHeight) / 2;

      pdf.addImage(imgData, 'JPEG', xOffset, yOffset, imgWidth, imgHeight);
      pdf.save(`MIS_Schedule_Section_${sectionName.replace(/\s+/g, '_')}.pdf`);

    } catch (err) {
      console.error("PDF error:", err);
      alert(`PDF generation failed: ${err.message}`);
    } finally {
      if (document.body.contains(container)) document.body.removeChild(container);
      if (document.body.contains(loadingOverlay)) document.body.removeChild(loadingOverlay);
      const s = document.getElementById('pdf-export-styles');
      if (s) s.remove();
    }
  };

  const gradeGrouped = {};
  Object.values(masterSectionSchedules).forEach(secObj => {
    const hasSlots = Object.values(secObj.timetable).some(dayObj => Object.values(dayObj).some(v => v !== null && v !== undefined));
    if (hasSlots) {
      const gName = secObj.gradeLevel;
      if (!gradeGrouped[gName]) gradeGrouped[gName] = [];
      gradeGrouped[gName].push(secObj);
    }
  });

  const sortedGrades = Object.keys(gradeGrouped).sort((a, b) => {
    const na = parseInt((a.match(/\d+/) || [0])[0], 10);
    const nb = parseInt((b.match(/\d+/) || [0])[0], 10);
    return na - nb;
  });

  if (sortedGrades.length === 0) {
    const el = document.createElement("div");
    el.style.cssText = "text-align:center;color:#dc2626;background:#fef2f2;padding:30px;border-radius:8px;border-left:3px solid #dc2626;font-size:0.85rem;";
    el.textContent = "No timetables could be rendered.";
    mainWrapper.appendChild(el);
    return;
  }

  sortedGrades.forEach(gradeName => {
    const sectionsList = gradeGrouped[gradeName];

    const gradeHeader = document.createElement("div");
    gradeHeader.className = "no-print grade-header";
    gradeHeader.setAttribute('data-grade-key', gradeName.replace(/[^a-zA-Z0-9]/g, ''));
    gradeHeader.style.cssText = "margin-top: 28px; margin-bottom: 12px; display: grid !important; grid-template-columns: 1fr auto !important; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; gap: 10px;";
    gradeHeader.innerHTML = `
      <h2 style="color: #0c2f6b; font-size: 1.05rem; font-weight: 700; margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block;">
        ${gradeName}
        <span style="color:#64748b;font-size:0.82rem;font-weight:500;">
          (${sectionsList.length} scheduled section${sectionsList.length !== 1 ? 's' : ''})
        </span>
      </h2>
      <div style="display: flex; gap: 6px; align-items: center; white-space: nowrap;">
        <button onclick="printGradeLevel('${gradeName.replace(/[^a-zA-Z0-9]/g, '')}')" style="background: #fff; color: #475569; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.75rem; font-family: inherit; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;">
          <i class="fa-solid fa-print"></i> Print All
        </button>
        <button onclick="downloadGradePDF('${gradeName.replace(/[^a-zA-Z0-9]/g, '')}', '${gradeName.replace(/'/g, "\\'")}')" style="background: #166534; color: #fff; border: 1px solid #166534; padding: 6px 12px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.75rem; font-family: inherit; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;">
          <i class="fa-solid fa-download"></i> PDF
        </button>
      </div>
    `;
    mainWrapper.appendChild(gradeHeader);

    sectionsList.forEach((secObj, idx) => {
      const secName = secObj.details.name;
      const uniqueCardId = `sched-${gradeName.replace(/[^a-zA-Z0-9]/g, '')}-${idx}`;
      const isJHS = /Grade (7|8|9|10)/.test(gradeName);
      const isThisSectionInEditMode = (editMode && activeSectionId === uniqueCardId);

      let sectionRoom = "";
      const details = secObj.details || {};
      if (details.roomName) sectionRoom = details.roomName;
      else if (details.room_name) sectionRoom = details.room_name;
      else if (details.roomId != null || details.room_id != null) {
        const rid = details.roomId ?? details.room_id;
        const match = roomsCache.find(r => String(r.id) === String(rid));
        if (match) sectionRoom = match.name;
      }
      if (!sectionRoom) {
        outer:
        for (const dayKey of Object.keys(secObj.timetable || {})) {
          for (const timeKey of Object.keys(secObj.timetable[dayKey] || {})) {
            const slot = secObj.timetable[dayKey][timeKey];
            if (slot && slot.room && slot.room !== "N/A") {
              sectionRoom = slot.room;
              break outer;
            }
          }
        }
      }

      const gradeMatch = (secObj.gradeLevel || "").match(/\d+/);
      const gradeNum = gradeMatch ? gradeMatch[0] : "";
      const sectionLabel = [gradeNum, secName.toUpperCase(), sectionRoom].filter(Boolean).join(" - ");

      const FULL_DAY_LAYOUT = [
        "06:00-07:00",
        "07:00-08:00",
        "08:00-09:00",
        "09:00-09:15",
        "09:15-10:15",
        "10:15-11:15",
        "11:15-12:15",
        "12:15-13:45",
        "13:45-14:45",
        "14:45-15:00",
        "15:00-16:00",
        "16:00-17:00",
        "17:00-18:00",
        "18:00-19:00",
      ];

      const layout = isJHS ? FULL_DAY_LAYOUT : timeSlots;

      const generatedTimestamp = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

      const sectionGrade = (secObj.gradeLevel || '').match(/\d+/)?.[0] || '';
      const isJHSsection = ['7','8','9','10'].includes(sectionGrade);
      const sectionDept = isJHSsection ? 'Junior High School' : 'Senior High School';

      const secCard = document.createElement("div");
      secCard.id = uniqueCardId;
      secCard.setAttribute('data-section-name', secName.toLowerCase());
      secCard.setAttribute('data-section-label', sectionLabel.toLowerCase());
      secCard.style.cssText = "background:#ffffff;border:1px solid #cbd5e1;border-radius:6px;padding:14px;margin-bottom:20px;overflow-x:auto;";

      let html = `
        <div class="print-header">
          <div class="print-header-left">
            <img src="/auth/makiling_logo.png" alt="MIS Logo" class="print-header-logo">
            <div class="print-header-school">
              <div class="print-header-school-name">Makiling Integrated School</div>
              <div class="print-header-school-address">Brgy. Makiling, Calamba City, Laguna</div>
            </div>
          </div>
          <div class="print-header-right">
            <div class="print-header-section-name">${escapeHtml(sectionLabel)}</div>
            <div class="print-header-dept">${sectionDept}</div>
            <div class="print-header-sy">S.Y. 2026-2027</div>
          </div>
        </div>

        <div class="no-print" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
          <div>
            <h3 style="color:#0c2f6b;margin:0;font-size:1rem;font-weight:700;">
              ${escapeHtml(sectionLabel)}
              <span style="font-size:0.78rem;color:#64748b;font-weight:500;">(FULL DAY)</span>
              ${isThisSectionInEditMode ? `<span style="font-size:0.68rem;background:#166534;color:#fff;padding:2px 8px;border-radius:10px;margin-left:6px;font-weight:600;">EDIT MODE</span>` : ''}
            </h3>
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            <button onclick="toggleEditMode('${uniqueCardId}')"
                    class="btn-edit-mode ${isThisSectionInEditMode ? 'active' : ''}"
                    title="${isThisSectionInEditMode ? 'Exit edit mode' : 'Enter edit mode to enable swapping'}">
              <i class="fa-solid fa-pen"></i>
              ${isThisSectionInEditMode ? 'Exit Edit' : 'Edit Mode'}
            </button>
            <button onclick="printSectionSchedule('${uniqueCardId}')" style="background:#fff;color:#475569;border:1px solid #cbd5e1;padding:6px 12px;border-radius:6px;font-weight:600;cursor:pointer;font-size:0.78rem;font-family:inherit;">
              <i class="fa-solid fa-print"></i> Print
            </button>
            <button onclick="downloadSectionPDF('${uniqueCardId}', '${secName}')" style="background:#166534;color:#fff;border:1px solid #166534;padding:6px 12px;border-radius:6px;font-weight:600;cursor:pointer;font-size:0.78rem;font-family:inherit;">
              <i class="fa-solid fa-download"></i> PDF
            </button>
          </div>
        </div>

        ${isThisSectionInEditMode ? `
          <div class="edit-mode-active-banner no-print">
            <strong>Edit Mode Active</strong> — Click <strong>two class cells</strong> to swap them, or click a <strong>class cell</strong> then a <strong>vacant cell</strong> to move it there.
          </div>
        ` : ''}
        <table class="schedule-table">
          <thead>
            <tr style="background:#f1f5f9;color:#0c2f6b;">
              <th class="time-col" style="padding:8px;font-weight:700;font-size:0.78rem;">TIME</th>
      `;

      daySlots.forEach(d => {
        html += `<th style="padding:8px;font-weight:700;font-size:0.78rem;text-transform:uppercase;">${d}</th>`;
      });
      html += `</tr></thead><tbody>`;

      layout.forEach(time => {
        const isBreak = isJHS && (
          time === "09:00-09:15" ||
          time === "12:15-13:45" ||
          time === "14:45-15:00"
        );

        const displayTime = formatTimeRange12Hour(time);

        html += `<tr><td class="time-col" style="padding:6px;background:#f8fafc;color:#0c2f6b;font-weight:700;font-size:0.72rem;">${displayTime}</td>`;

        if (isBreak) {
          let breakLabel = "";
          if (time === "09:00-09:15") breakLabel = "RECESS";
          else if (time === "12:15-13:45") breakLabel = "LUNCH BREAK";
          else if (time === "14:45-15:00") breakLabel = "RECESS";

          html += `<td colspan="${daySlots.length}" class="break-cell" style="background:#f1f5f9;font-weight:700;letter-spacing:1px;padding:8px;color:#475569;text-transform:uppercase;text-align:center;">
            ${breakLabel}
          </td>`;
        } else {
          daySlots.forEach(day => {
            if (day === "Monday" && time === "06:00-07:00") {
              html += `<td class="flag-raising-cell" style="padding:6px;background:#fef3c7;color:#92400e;vertical-align:middle;text-align:center;font-weight:700;">
                <div style="font-size:0.82rem;font-weight:800;line-height:1.2;">Flag Raising</div>
                <div style="font-size:0.68rem;font-weight:600;margin-top:2px;">Ceremony</div>
              </td>`;
              return;
            }

            const rawDay = day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
            const slotData = secObj.timetable[rawDay] ? secObj.timetable[rawDay][time] : (secObj.timetable[day] ? secObj.timetable[day][time] : null);

            if (slotData && slotData.teacher) {
              const bg = getSubjectColor(slotData.subject);
              const teacherIdSafe = slotData.teacherId || '';
              const isSwappable = !!teacherIdSafe && isThisSectionInEditMode;

              let cellKey = '';
              if (isSwappable) {
                cellKey = `cell_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
                window.__cellDataRegistry[cellKey] = {
                  slotId: slotData.id,
                  teacherId: teacherIdSafe,
                  teacherName: slotData.teacher,
                  day: rawDay,
                  startTime: time.split('-')[0],
                  endTime: time.split('-')[1],
                  subject: slotData.subject,
                  section: secName,
                  room: slotData.room || 'N/A'
                };
              }

              html += `<td
                class="swappable-cell ${isSwappable ? 'edit-active' : ''}"
                style="padding:6px;background:${bg};color:#000;vertical-align:middle;font-weight:700;"
                ${isSwappable ? `data-cell-key="${cellKey}"` : ''}
                ${isSwappable ? `onclick="handleCellClickByKey('${cellKey}', this)"` : ''}
                title="${isSwappable ? 'Click to select for swap/move' : 'Enable Edit Mode to edit'}">
                <div style="font-size:0.85rem;font-weight:800;line-height:1.2;">${escapeHtml(slotData.subject)}</div>
                <div style="font-size:0.72rem;font-weight:600;margin-top:2px;">${escapeHtml(slotData.teacher)}</div>
              </td>`;
            } else {
              if (isThisSectionInEditMode) {
                const blankKey = `blank_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
                window.__cellDataRegistry[blankKey] = {
                  teacherId: null,
                  teacherName: null,
                  day: rawDay,
                  startTime: time.split('-')[0],
                  endTime: time.split('-')[1],
                  subject: null,
                  section: secName,
                  room: null,
                  isBlank: true
                };
                html += `<td
                  class="swappable-cell edit-active blank-cell"
                  style="padding:6px;background:#f8fafc;"
                  data-cell-key="${blankKey}"
                  onclick="handleCellClickByKey('${blankKey}', this)"
                  title="Click to move the selected class here">
                  <div style="color:#94a3b8;font-size:0.68rem;font-weight:500;">(vacant)</div>
                </td>`;
              } else {
                html += `<td style="padding:6px;background:#fff;"></td>`;
              }
            }
          });
        }
        html += `</tr>`;
      });

      html += `</tbody></table>`;

      html += `
        <div class="print-footer">
          <div class="print-footer-left">
            <div class="print-footer-principal">Ronaldo M. Canta, Ph.D.</div>
            <div class="print-footer-principal-title">Principal III</div>
          </div>
          <div class="print-footer-right">
            Generated on: ${generatedTimestamp}
          </div>
        </div>
      `;

      secCard.innerHTML = html;
      mainWrapper.appendChild(secCard);
    });
  });
}

// ═══════════════════════════════════════════════════════
// ═══ DOWNLOAD GRADE PDF (BATCH)                       ═══
// ═══════════════════════════════════════════════════════
window.downloadGradePDF = async function(gradeLevelKey, gradeName) {
  const allCards = document.querySelectorAll('[id^="sched-"]');
  const gradeCards = [];

  allCards.forEach(card => {
    if (card.id.includes(gradeLevelKey)) {
      gradeCards.push(card);
    }
  });

  if (gradeCards.length === 0) {
    alert("Walang sections na naka-generate para sa grade level na ito.");
    return;
  }

  if (typeof html2canvas === "undefined") {
    alert("html2canvas library not loaded. Please refresh the page (Ctrl+Shift+R).");
    return;
  }
  if (typeof window.jspdf === "undefined" || typeof window.jspdf.jsPDF === "undefined") {
    alert("jsPDF library not loaded. Please refresh the page (Ctrl+Shift+R).");
    return;
  }
  const { jsPDF } = window.jspdf;

  const loadingOverlay = document.createElement('div');
  loadingOverlay.id = 'pdf-loading-overlay';
  loadingOverlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(15, 23, 42, 0.9); z-index: 2147483647;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 1rem; font-weight: 600; font-family: 'Inter', sans-serif;
  `;
  loadingOverlay.innerHTML = `
    <div style="text-align: center;">
      <div style="font-size: 2rem; margin-bottom: 10px;"><i class="fa-solid fa-file-pdf"></i></div>
      <div>Generating Grade PDF...</div>
      <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 6px;">${gradeCards.length} section${gradeCards.length !== 1 ? 's' : ''}</div>
    </div>
  `;
  document.body.appendChild(loadingOverlay);

  const pdf = new jsPDF({
    unit: 'in',
    format: 'letter',
    orientation: 'landscape',
    compress: true,
  });

  const pageWidth = 11;
  const pageHeight = 8.5;
  const margin = 0.1;
  const usableWidth = pageWidth - (margin * 2);
  const usableHeight = pageHeight - (margin * 2);

  const styleEl = document.createElement('style');
  styleEl.id = 'pdf-export-styles-grade';
  styleEl.innerHTML = `
    /* ═══ BALANCED HEADER SA BATCH PDF ═══ */
    #pdf-export-container-grade .print-header {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding-bottom: 6px !important;
      margin-bottom: 6px !important;
      flex-shrink: 0 !important;
      border-bottom: none !important;
    }
    #pdf-export-container-grade .print-header-left { display: flex !important; align-items: center !important; gap: 12px !important; }
    #pdf-export-container-grade .print-header-logo { width: 62px !important; height: 62px !important; object-fit: contain !important; }
    #pdf-export-container-grade .print-header-school-name {
      font-family: 'UnifrakturMaguntia', 'Cinzel', serif !important;
      font-size: 22pt !important;
      font-weight: 700 !important;
      color: #000 !important;
      line-height: 1.05 !important;
      white-space: nowrap !important;
    }
    #pdf-export-container-grade .print-header-school-address { font-size: 11pt !important; color: #333 !important; font-style: italic !important; }
    #pdf-export-container-grade .print-header-right { text-align: right !important; }
    #pdf-export-container-grade .print-header-section-name {
      font-family: 'Cinzel', 'Inter', serif !important;
      font-size: 22pt !important;
      font-weight: 800 !important;
      color: #000 !important;
      text-transform: uppercase !important;
      line-height: 1.05 !important;
      white-space: nowrap !important;
    }
    #pdf-export-container-grade .print-header-dept { font-size: 11pt !important; color: #333 !important; }
    #pdf-export-container-grade .print-header-sy { font-size: 11pt !important; font-weight: 600 !important; color: #333 !important; }

    /* ═══ BLACK BORDERS SA BATCH PDF ═══ */
    #pdf-export-container-grade table {
      width: 100% !important;
      height: 100% !important;
      flex: 1 !important;
      border-collapse: collapse !important;
      table-layout: fixed !important;
      border: 1pt solid #000 !important;
      margin: 0 !important;
    }
    #pdf-export-container-grade thead tr { height: 28px !important; }
    #pdf-export-container-grade th, #pdf-export-container-grade td {
      border: 0.75pt solid #000 !important;
      padding: 4px 3px !important;
      text-align: center !important;
      vertical-align: middle !important;
      word-wrap: break-word !important;
      line-height: 1.15 !important;
      font-size: 9.5pt !important;
      box-sizing: border-box !important;
    }
    #pdf-export-container-grade thead th {
      background: #e2e8f0 !important;
      color: #000 !important;
      font-weight: 900 !important;
      font-size: 10.5pt !important;
      padding: 6px 3px !important;
      text-transform: uppercase !important;
      height: 28px !important;
    }
    /* ═══ WIDER TIME COLUMN (22%) + BIGGER FONT SA BATCH PDF ═══ */
    #pdf-export-container-grade thead th:first-child { width: 22% !important; font-size: 11pt !important; }
    #pdf-export-container-grade tbody td:first-child { 
      background: #f8fafc !important; 
      font-weight: 900 !important; 
      font-size: 10pt !important;
      width: 22% !important; 
      white-space: nowrap !important; 
      padding: 4px 2px !important; 
    }
    #pdf-export-container-grade tbody td { font-size: 9.5pt !important; }
    #pdf-export-container-grade tbody td > div:first-child { font-size: 10pt !important; font-weight: 900 !important; color: #000 !important; }
    #pdf-export-container-grade tbody td > div:nth-child(2) { font-size: 8.5pt !important; font-weight: 700 !important; color: #222 !important; }
    #pdf-export-container-grade .flag-raising-cell { background: #fef3c7 !important; color: #92400e !important; }
    #pdf-export-container-grade .print-footer {
      display: flex !important;
      justify-content: space-between !important;
      align-items: flex-end !important;
      padding-top: 6px !important;
      margin-top: 6px !important;
      font-style: italic !important;
      color: #555 !important;
      font-size: 8.5pt !important;
      flex-shrink: 0 !important;
    }
    #pdf-export-container-grade .print-footer-principal {
      font-family: 'Cinzel', 'Inter', serif !important;
      font-weight: 700 !important;
      font-size: 11pt !important;
      color: #000 !important;
    }
    #pdf-export-container-grade .print-footer-principal-title { font-size: 9pt !important; color: #333 !important; font-style: italic !important; }
    #pdf-export-container-grade * { box-sizing: border-box !important; }
  `;
  document.head.appendChild(styleEl);

  try {
    for (let i = 0; i < gradeCards.length; i++) {
      const originalCard = gradeCards[i];

      const container = document.createElement('div');
      container.id = 'pdf-export-container-grade';
      container.style.cssText = `
        position: fixed; top: 0; left: 0;
        width: 1056px; height: 800px;
        background: #ffffff; z-index: 2147483646;
        overflow: hidden;
      `;

      const clone = originalCard.cloneNode(true);
      clone.querySelectorAll('.no-print, button, .btn-edit-mode, .edit-mode-active-banner, .swap-banner, .swap-modal-overlay, #skipped-sections-banner').forEach(el => el.remove());

      clone.style.cssText = `
        width: 1056px !important;
        height: 800px !important;
        padding: 15px 20px !important;
        margin: 0 !important;
        border: none !important;
        border-radius: 0 !important;
        overflow: hidden !important;
        background: #ffffff !important;
        box-sizing: border-box !important;
        font-family: 'Times New Roman', Arial, sans-serif !important;
        display: flex !important;
        flex-direction: column !important;
      `;

      container.appendChild(clone);
      document.body.appendChild(container);

      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: 1056,
        height: 800,
        windowWidth: 1056,
        windowHeight: 800,
        allowTaint: true,
        removeContainer: false,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.98);

      if (i > 0) pdf.addPage();

      let imgWidth = usableWidth;
      let imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (imgHeight > usableHeight) {
        imgHeight = usableHeight;
        imgWidth = (canvas.width * imgHeight) / canvas.height;
      }

      const xOffset = margin + (usableWidth - imgWidth) / 2;
      const yOffset = margin + (usableHeight - imgHeight) / 2;

      pdf.addImage(imgData, 'JPEG', xOffset, yOffset, imgWidth, imgHeight);

      if (document.body.contains(container)) document.body.removeChild(container);
    }

    pdf.save(`MIS_Schedule_${gradeName.replace(/\s+/g, '_')}.pdf`);

  } catch (err) {
    console.error("Grade PDF error:", err);
    alert(`Grade PDF generation failed: ${err.message}`);
  } finally {
    if (document.body.contains(loadingOverlay)) document.body.removeChild(loadingOverlay);
    const s = document.getElementById('pdf-export-styles-grade');
    if (s) s.remove();
  }
};

// ═══════════════════════════════════════════════════════
// ═══ SEARCH FUNCTION (WITH DROPDOWN)                 ═══
// ═══════════════════════════════════════════════════════
window.handleSectionSearch = function(query) {
  const searchTerm = (query || "").toLowerCase().trim();
  const allCards = document.querySelectorAll('[id^="sched-"]');
  const gradeHeaders = document.querySelectorAll('.grade-header');
  const skippedBanner = document.getElementById('skipped-sections-banner');

  allCards.forEach(card => card.classList.remove('search-highlight'));

  if (!searchTerm) {
    allCards.forEach(card => {
      card.style.display = '';
    });
    gradeHeaders.forEach(header => header.style.display = '');
    if (skippedBanner) skippedBanner.style.display = '';

    const noResultBanner = document.getElementById('search-no-result');
    if (noResultBanner) noResultBanner.remove();

    hideSectionSearchDropdown();
    return;
  }

  let matchCount = 0;
  let firstMatch = null;
  const matchedGradeKeys = new Set();

  allCards.forEach(card => {
    const sectionName = (card.getAttribute('data-section-name') || '').toLowerCase();
    const sectionLabel = (card.getAttribute('data-section-label') || '').toLowerCase();
    const cardId = card.id.toLowerCase();

    const isMatch = sectionName.includes(searchTerm) ||
                    sectionLabel.includes(searchTerm) ||
                    cardId.includes(searchTerm);

    if (isMatch) {
      card.style.display = '';
      card.classList.add('search-highlight');
      matchCount++;
      if (!firstMatch) firstMatch = card;

      const parentHeader = card.previousElementSibling;
      if (parentHeader && parentHeader.classList.contains('grade-header')) {
        const gradeKey = parentHeader.getAttribute('data-grade-key') || '';
        matchedGradeKeys.add(gradeKey);
      }
    } else {
      card.style.display = 'none';
    }
  });

  gradeHeaders.forEach(header => {
    const gradeKey = header.getAttribute('data-grade-key') || '';
    header.style.display = (matchedGradeKeys.size === 0 || matchedGradeKeys.has(gradeKey)) ? '' : 'none';
  });

  if (firstMatch) {
    setTimeout(() => {
      firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  let noResultBanner = document.getElementById('search-no-result');
  if (matchCount === 0) {
    if (!noResultBanner) {
      noResultBanner = document.createElement('div');
      noResultBanner.id = 'search-no-result';
      noResultBanner.style.cssText = `
        background: #fef3c7;
        border: 1px solid #fcd34d;
        border-left: 3px solid #f59e0b;
        border-radius: 6px;
        padding: 16px 20px;
        margin: 16px 0;
        font-family: 'Inter', sans-serif;
        color: #92400e;
        font-size: 0.85rem;
        display: flex;
        align-items: center;
        gap: 10px;
      `;
      const outputBody = document.getElementById("timetable-matrix-output-body");
      if (outputBody) outputBody.insertBefore(noResultBanner, outputBody.firstChild);
    }
    noResultBanner.innerHTML = `
      <i class="fa-solid fa-magnifying-glass" style="font-size: 1.2rem;"></i>
      <div>
        <strong>Walang resulta para sa "${escapeHtml(searchTerm)}".</strong>
        <div style="font-size: 0.78rem; color: #78350f; margin-top: 2px;">
          Subukan ang ibang keyword o i-check ang spelling.
        </div>
      </div>
    `;
    noResultBanner.style.display = 'flex';
    if (skippedBanner) skippedBanner.style.display = 'none';
  } else {
    if (noResultBanner) noResultBanner.remove();
    if (skippedBanner) skippedBanner.style.display = '';
  }

  showSectionSearchDropdown();
};

window.showSectionSearchDropdown = function() {
  const dropdown = document.getElementById('section-search-dropdown');
  const input = document.getElementById('section-search-input');
  if (!dropdown || !input) return;

  const query = (input.value || '').toLowerCase().trim();
  const allCards = document.querySelectorAll('[id^="sched-"]');

  if (allCards.length === 0) {
    dropdown.innerHTML = `
      <div style="padding: 12px; text-align: center; color: #94a3b8; font-size: 0.8rem;">
        <i class="fa-solid fa-inbox"></i> Walang sections.
      </div>
    `;
    dropdown.style.display = 'block';
    return;
  }

  const items = [];
  allCards.forEach(card => {
    const sectionName = card.getAttribute('data-section-name') || '';
    const sectionLabel = card.getAttribute('data-section-label') || '';
    const cardId = card.id;

    if (query && !sectionLabel.includes(query) && !sectionName.includes(query)) return;

    items.push({
      cardId: cardId,
      label: sectionLabel || sectionName,
    });
  });

  if (items.length === 0) {
    dropdown.innerHTML = `
      <div style="padding: 12px; text-align: center; color: #94a3b8; font-size: 0.8rem;">
        <i class="fa-solid fa-magnifying-glass"></i> Walang resulta.
      </div>
    `;
  } else {
    dropdown.innerHTML = items.slice(0, 20).map(item => `
      <div
        onclick="selectSectionFromDropdown('${item.cardId}')"
        style="
          padding: 8px 12px;
          font-size: 0.82rem;
          color: #0f172a;
          cursor: pointer;
          border-bottom: 1px solid #f1f5f9;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: background 0.1s ease;
        "
        onmouseover="this.style.background='#f0fdf4'"
        onmouseout="this.style.background='#ffffff'"
      >
        <i class="fa-solid fa-folder" style="color: #16a34a; font-size: 0.75rem;"></i>
        <span style="font-weight: 600; text-transform: uppercase;">${escapeHtml(item.label)}</span>
      </div>
    `).join('');
  }

  dropdown.style.display = 'block';
};

window.hideSectionSearchDropdown = function() {
  const dropdown = document.getElementById('section-search-dropdown');
  if (dropdown) dropdown.style.display = 'none';
};

window.selectSectionFromDropdown = function(cardId) {
  const input = document.getElementById('section-search-input');
  const card = document.getElementById(cardId);

  if (!card || !input) return;

  const label = card.getAttribute('data-section-label') || '';
  input.value = label;

  handleSectionSearch(label);

  setTimeout(() => {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);

  hideSectionSearchDropdown();
};

// ═══════════════════════════════════════════════════════
// ═══ BOOTSTRAP                                        ═══
// ═══════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  if (!requireAuth("admin")) return;
  startSessionWatchdog();

  const cachedData = localStorage.getItem("cached_generated_schedule");
  if (!cachedData) {
    return;
  }

  try {
    const parsed = JSON.parse(cachedData);
    const container = document.getElementById("timetable-matrix-output-body") ||
                      document.querySelector('.dashboard-card-panel') ||
                      document.querySelector('.main-content') ||
                      document.body;

    renderMasterSectionScheduleDashboard(
      container,
      parsed.masterSectionSchedules,
      parsed.auditSummary,
      parsed.daySlots,
      parsed.timeSlots,
      parsed.normalizedTeachers
    );

  } catch (e) {
    console.error("Cached render failed:", e);
    localStorage.removeItem("cached_generated_schedule");
  }
});
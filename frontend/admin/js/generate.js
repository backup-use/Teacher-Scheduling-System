/**
 * Advanced Master Schedule Generator - Makiling Integrated School (MIS) Edition
 * - JHS (Grade 7-10): AM/PM shift, 50-min slots, 3x/week, 30-min breaks
 * - SHS (Grade 11-12): unchanged legacy hourly slots
 * - Includes per-section Print + PDF export
 * - Full Audit Dashboard
 * - Edit Mode Toggle + Tap-to-Select Swap & Move (desktop + mobile)
 * 
 * FIXED: Unlimited swapping bug. State is now fully reset after each swap.
 */

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

function normalizeGradeLevelName(str) {
  if (!str) return "General";
  const cleanStr = str.toString().trim();
  const match = cleanStr.match(/\d+/);
  if (match) {
    const num = parseInt(match[0], 10);
    if (num >= 7 && num <= 10) return `Junior High School - Grade ${num}`;
    if (num >= 11 && num <= 12) return `Senior High School - Grade ${num}`;
    return `Grade ${num}`;
  }
  return cleanStr;
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
  '#7dd3fc', // Sky blue
  '#86efac', // Light green
  '#fcd34d', // Amber
  '#c4b5fd', // Lavender
  '#f9a8d4', // Pink
  '#5eead4', // Teal
  '#fdba74', // Peach
  '#e879f9', // Fuchsia
  '#a5b4fc', // Indigo
  '#f0abfc', // Light fuchsia
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

function getAuthToken() {
  return localStorage.getItem('token') || localStorage.getItem('jwt') ||
         localStorage.getItem('authToken') || localStorage.getItem('accessToken') ||
         sessionStorage.getItem('token') || sessionStorage.getItem('jwt') ||
         sessionStorage.getItem('authToken') || sessionStorage.getItem('accessToken');
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
      <span class="swap-banner-icon">🔄</span>
      <div class="swap-banner-text">
        <strong>SOURCE SELECTED:</strong>
        <span>${escapeHtml(src.day)} ${escapeHtml(src.startTime)}-${escapeHtml(src.endTime)} · ${escapeHtml(src.subject)} · ${escapeHtml(src.teacherName)}</span>
      </div>
      <button class="swap-banner-cancel" onclick="clearSwapState()">✕ Cancel</button>
    </div>
  `;
  document.body.appendChild(banner);
}

// ═══════════════════════════════════════════════════════
// ═══ SWAP/MOVE LOGIC (FIXED)                          ═══
// ═══════════════════════════════════════════════════════

/**
 * Main click handler. Receives the cellData object and the DOM element.
 * FIXED: Now accepts a cellKey to track state reliably across re-renders.
 */
function handleCellClick(cellData, cellEl, cellKey) {
  if (!editMode) return;

  // ── STEP 1: No source selected yet. Select this cell as the source. ──
  if (!swapState.active) {
    if (!cellData.teacherId) {
      showSwapToast('⚠️ Select a class cell first (not a vacant slot).', 'error');
      return;
    }
    swapState.active = true;
    // Store the key and data. We keep cellEl for immediate UI feedback but
    // the swap logic relies on the key.
    swapState.sourceCell = { ...cellData, cellKey: cellKey, cellEl: cellEl };
    cellEl.classList.add('cell-source-selected');
    showSwapBanner();
    return;
  }

  // ── STEP 2: A source is already selected. This is the target. ──
  const src = swapState.sourceCell;

  // If clicking the exact same cell again, deselect it.
  if (src.cellKey === cellKey) {
    clearSwapState();
    return;
  }

  // Prevent swapping a class with itself (same teacher, same time).
  if (src.teacherId === cellData.teacherId &&
      src.day === cellData.day &&
      src.startTime === cellData.startTime &&
      src.endTime === cellData.endTime) {
    clearSwapState();
    return;
  }

  if (cellData.teacherId && cellData.teacherId === src.teacherId) {
    showSwapToast('⚠️ Cannot move/swap a class with itself.', 'error');
    return;
  }

  // Store the target cell
  swapState.targetCell = { ...cellData, cellKey: cellKey, cellEl: cellEl };
  cellEl.classList.add('cell-target-selected');

  // Show confirmation modal (Swap vs Move)
  if (cellData.teacherId) {
    showSwapConfirmation();
  } else {
    showMoveConfirmation();
  }
}

/**
 * Wrapper called by onclick attributes in the generated HTML.
 * Looks up the cell data by its unique key and forwards to handleCellClick.
 */
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

  const modal = document.createElement('div');
  modal.id = 'swap-confirm-modal';
  modal.className = 'swap-modal-overlay active';
  modal.innerHTML = `
    <div class="swap-modal-box">
      <div class="swap-modal-icon">🔄</div>
      <h2 class="swap-modal-title">Confirm Swap</h2>
      <p class="swap-modal-subtitle">Are you sure you want to swap these two classes?</p>
      <div class="swap-preview">
        <div class="swap-preview-cell">
          <div class="swap-cell-label">From</div>
          <div class="swap-cell-time">${escapeHtml(src.day)} · ${escapeHtml(src.startTime)}-${escapeHtml(src.endTime)}</div>
          <div class="swap-cell-subject">${escapeHtml(src.subject)}</div>
          <div class="swap-cell-teacher">👤 ${escapeHtml(src.teacherName)}</div>
          <div class="swap-cell-room">🏫 ${escapeHtml(src.room || "N/A")} · ${escapeHtml(src.section || "")}</div>
        </div>
        <div class="swap-arrow">↕</div>
        <div class="swap-preview-cell">
          <div class="swap-cell-label">To</div>
          <div class="swap-cell-time">${escapeHtml(tgt.day)} · ${escapeHtml(tgt.startTime)}-${escapeHtml(tgt.endTime)}</div>
          <div class="swap-cell-subject">${escapeHtml(tgt.subject)}</div>
          <div class="swap-cell-teacher">👤 ${escapeHtml(tgt.teacherName)}</div>
          <div class="swap-cell-room">🏫 ${escapeHtml(tgt.room || "N/A")} · ${escapeHtml(tgt.section || "")}</div>
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

  const modal = document.createElement('div');
  modal.id = 'swap-confirm-modal';
  modal.className = 'swap-modal-overlay active';
  modal.innerHTML = `
    <div class="swap-modal-box">
      <div class="swap-modal-icon">↔️</div>
      <h2 class="swap-modal-title">Confirm Move</h2>
      <p class="swap-modal-subtitle">Move this class to the vacant slot?</p>
      <div class="swap-preview">
        <div class="swap-preview-cell">
          <div class="swap-cell-label">From</div>
          <div class="swap-cell-time">${escapeHtml(src.day)} · ${escapeHtml(src.startTime)}-${escapeHtml(src.endTime)}</div>
          <div class="swap-cell-subject">${escapeHtml(src.subject)}</div>
          <div class="swap-cell-teacher">👤 ${escapeHtml(src.teacherName)}</div>
          <div class="swap-cell-room">🏫 ${escapeHtml(src.room || "N/A")} · ${escapeHtml(src.section || "")}</div>
        </div>
        <div class="swap-arrow">↓</div>
        <div class="swap-preview-cell" style="border-color: rgba(16, 185, 129, 0.5); background: rgba(16, 185, 129, 0.08);">
          <div class="swap-cell-label" style="color: #10b981;">To (Vacant)</div>
          <div class="swap-cell-time">${escapeHtml(tgt.day)} · ${escapeHtml(tgt.startTime)}-${escapeHtml(tgt.endTime)}</div>
          <div class="swap-cell-subject" style="color: #10b981; font-style: italic;">(vacant slot)</div>
        </div>
      </div>
      <p style="color: #94a3b8; font-size: 0.78rem; margin: 0 0 16px 0;">
        ⚠️ The original slot <strong>${escapeHtml(src.day)} ${escapeHtml(src.startTime)}</strong> will become vacant.
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
// ═══ EXECUTE SWAP/MOVE (FIXED FOR UNLIMITED SWAPS)  ═══
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

  // ═══ CAPTURE the payload BEFORE any state mutation ═══
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

  console.log("📤 Sending swap payload:", JSON.stringify(payload, null, 2));

  try {
    const token = getAuthToken();
    const res = await fetch(`${window.location.origin}/api/admin/schedules/swap`, {
      method: 'POST',
      headers: {
        'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Swap failed");

    const modal = document.getElementById('swap-confirm-modal');
    if (modal) modal.remove();

    showSwapToast(`✅ Swap successful! ${src.subject} ↔ ${tgt.subject}`, 'success');

    // ═══ NUCLEAR RESET ═══
    // 1. Kill ALL state
    swapState.active = false;
    swapState.sourceCell = null;
    swapState.targetCell = null;
    
    // 2. Clear any DOM selections
    document.querySelectorAll('.swappable-cell').forEach(el => {
      el.classList.remove('cell-source-selected', 'cell-target-selected');
    });
    
    // 3. Remove the banner
    const banner = document.getElementById('swap-banner');
    if (banner) banner.remove();
    
    // 4. Wipe the cell registry completely
    window.__cellDataRegistry = {};
    
    // 5. ═══ CRITICAL: Clear the localStorage cache ═══
    // This forces a fresh fetch from the DB
    localStorage.removeItem("cached_generated_schedule");
    localStorage.removeItem("cached_teacher_schedules");
    
    // 6. Small delay, then reload fresh
    await new Promise(resolve => setTimeout(resolve, 300));
    await loadExistingSchedule();

    // 7. ═══ CRITICAL: Re-apply edit mode to the same section ═══
    // If editMode was on, we need to re-enable it after re-render
    // (Your render function preserves editMode as a global variable,
    //  so it should still be active. But to be safe, we re-render once.)

  } catch (err) {
    console.error("Swap error:", err);
    const confirmBtnReset = document.querySelector('.swap-btn-confirm');
    if (confirmBtnReset) {
      confirmBtnReset.disabled = false;
      confirmBtnReset.textContent = 'Yes, Swap';
    }
    showSwapToast(`❌ ${err.message}`, 'error');
    
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

/**
 * Hard resets the swap state. Called after every swap/move.
 * FIXED: Explicitly nulls out all references and removes CSS classes.
 */
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
      position: fixed; bottom: 30px; right: 30px; padding: 14px 22px;
      border-radius: 10px; font-weight: 600; font-size: 0.9rem;
      z-index: 99999; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      transition: all 0.3s cubic-bezier(0.68, -0.55, 0.27, 1.55); max-width: 420px;
    `;
    document.body.appendChild(toast);
  }
  toast.style.background = type === 'success' ? 'rgba(0, 210, 255, 0.95)' : 'rgba(255, 95, 95, 0.95)';
  toast.style.color = type === 'success' ? '#000' : '#fff';
  toast.style.border = type === 'success' ? '1px solid #00d2ff' : '1px solid #ff5f5f';
  toast.textContent = message;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(30px)';
  }, 4000);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (document.getElementById('swap-confirm-modal')) cancelSwapConfirmation();
    else clearSwapState();
  }
});

// ═══════════════════════════════════════════════════════
// ═══ CSS INJECTION (Edit Mode + Swap + Move)         ═══
// ═══════════════════════════════════════════════════════
(function injectEditSwapStyles() {
  if (document.getElementById('edit-swap-styles')) return;
  const style = document.createElement('style');
  style.id = 'edit-swap-styles';
  style.textContent = `
    .btn-edit-mode {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #fff; border: none; padding: 6px 14px; border-radius: 4px;
      font-weight: bold; cursor: pointer; font-size: 0.8rem;
      transition: all 0.2s ease; display: inline-flex;
      align-items: center; gap: 5px;
    }
    .btn-edit-mode:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
    }
    .btn-edit-mode.active {
      background: linear-gradient(135deg, #10b981, #059669);
      box-shadow: 0 0 15px rgba(16, 185, 129, 0.5);
    }

    .edit-mode-active-banner {
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.05));
      border: 1.5px dashed #10b981; border-radius: 6px;
      padding: 10px 14px; margin-bottom: 10px; color: #059669;
      font-size: 0.85rem; font-weight: 600; display: flex;
      align-items: center; gap: 8px;
      animation: pulseEditBanner 2s ease-in-out infinite;
    }
    @keyframes pulseEditBanner {
      0%, 100% { border-color: #10b981; }
      50% { border-color: #34d399; background: rgba(16, 185, 129, 0.15); }
    }

    .swappable-cell {
      cursor: pointer; transition: all 0.2s ease; position: relative;
    }
    .swappable-cell.edit-active {
      box-shadow: inset 0 0 0 2px rgba(16, 185, 129, 0.5);
    }
    .swappable-cell.edit-active:hover {
      transform: scale(1.03);
      box-shadow: inset 0 0 0 2px #10b981, 0 0 16px rgba(16, 185, 129, 0.6);
      z-index: 2;
    }
    .swappable-cell.blank-cell {
      background: repeating-linear-gradient(
        45deg,
        #f8fafc,
        #f8fafc 6px,
        #f1f5f9 6px,
        #f1f5f9 12px
      ) !important;
    }
    .swappable-cell.blank-cell:hover {
      background: repeating-linear-gradient(
        45deg,
        #ecfdf5,
        #ecfdf5 6px,
        #d1fae5 6px,
        #d1fae5 12px
      ) !important;
    }
    .swappable-cell.cell-source-selected {
      outline: 3px solid #00d2ff !important;
      outline-offset: -3px;
      background-image: linear-gradient(135deg, rgba(0,210,255,0.2), rgba(0,210,255,0.08)) !important;
      animation: pulseSource 1.5s ease-in-out infinite;
      z-index: 3;
    }
    .swappable-cell.cell-target-selected {
      outline: 3px solid #10b981 !important;
      outline-offset: -3px;
      animation: pulseTarget 1.5s ease-in-out infinite;
      z-index: 3;
    }
    @keyframes pulseSource {
      0%, 100% { box-shadow: 0 0 12px rgba(0, 210, 255, 0.6); }
      50% { box-shadow: 0 0 24px rgba(0, 210, 255, 1); }
    }
    @keyframes pulseTarget {
      0%, 100% { box-shadow: 0 0 12px rgba(16, 185, 129, 0.6); }
      50% { box-shadow: 0 0 24px rgba(16, 185, 129, 1); }
    }

    .swap-banner {
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      background: linear-gradient(135deg, #1e293b, #0f172a);
      border: 2px solid #00d2ff; color: #fff; padding: 12px 20px;
      border-radius: 12px; box-shadow: 0 10px 30px rgba(0, 210, 255, 0.3);
      z-index: 99998; max-width: 90vw; animation: slideDown 0.3s ease;
    }
    @keyframes slideDown { from { opacity: 0; transform: translate(-50%, -20px); } to { opacity: 1; transform: translate(-50%, 0); } }
    .swap-banner-content { display: flex; align-items: center; gap: 12px; }
    .swap-banner-icon { font-size: 1.4rem; animation: rotate 2s linear infinite; }
    @keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .swap-banner-text { display: flex; flex-direction: column; gap: 2px; font-size: 0.85rem; }
    .swap-banner-text strong { color: #00d2ff; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; }
    .swap-banner-cancel {
      background: rgba(255, 95, 95, 0.2); color: #ff5f5f;
      border: 1px solid rgba(255, 95, 95, 0.4); padding: 6px 12px;
      border-radius: 8px; cursor: pointer; font-size: 0.8rem;
      font-weight: 600; font-family: inherit; transition: all 0.2s ease;
    }
    .swap-banner-cancel:hover { background: rgba(255, 95, 95, 0.3); }

    .swap-modal-overlay {
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center;
      z-index: 100000; opacity: 0; pointer-events: none; transition: opacity 0.25s ease;
    }
    .swap-modal-overlay.active { opacity: 1; pointer-events: auto; }
    .swap-modal-box {
      background: linear-gradient(145deg, #1e293b, #0f1620);
      border: 2px solid rgba(0, 210, 255, 0.3); border-radius: 18px;
      padding: 28px 32px; width: 90%; max-width: 500px;
      box-shadow: 0 25px 60px rgba(0,0,0,0.8), 0 0 40px rgba(0, 210, 255, 0.15);
      text-align: center; color: #fff; font-family: 'Poppins', sans-serif;
    }
    .swap-modal-icon { font-size: 2.5rem; margin-bottom: 6px; }
    .swap-modal-title { margin: 0 0 4px 0; color: #fff; font-size: 1.3rem; font-weight: 700; }
    .swap-modal-subtitle { margin: 0 0 20px 0; color: #94a3b8; font-size: 0.85rem; }
    .swap-preview { display: flex; flex-direction: column; gap: 10px; margin-bottom: 22px; }
    .swap-preview-cell {
      background: rgba(0, 210, 255, 0.05);
      border: 1px solid rgba(0, 210, 255, 0.2);
      border-radius: 10px; padding: 12px 16px; text-align: left;
    }
    .swap-cell-label { color: #00d2ff; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px; }
    .swap-cell-time { color: #e2e8f0; font-size: 0.85rem; font-weight: 600; margin-bottom: 4px; }
    .swap-cell-subject { color: #fff; font-size: 1rem; font-weight: 800; margin-bottom: 2px; }
    .swap-cell-teacher { color: #cbd5e1; font-size: 0.8rem; margin-bottom: 2px; }
    .swap-cell-room { color: #94a3b8; font-size: 0.75rem; }
    .swap-arrow { font-size: 1.5rem; color: #00d2ff; animation: bounce 1s ease-in-out infinite; }
    @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
    .swap-modal-actions { display: flex; gap: 10px; justify-content: center; }
    .swap-btn-cancel, .swap-btn-confirm {
      padding: 11px 24px; border-radius: 10px; font-size: 0.9rem;
      font-weight: 600; cursor: pointer; border: none; font-family: inherit; transition: all 0.2s ease;
    }
    .swap-btn-cancel { background: rgba(255, 255, 255, 0.06); color: #94a3b8; border: 1px solid rgba(255, 255, 255, 0.1); }
    .swap-btn-cancel:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }
    .swap-btn-confirm {
      background: linear-gradient(135deg, #00d2ff, #0891b2);
      color: #000; font-weight: 700; box-shadow: 0 4px 15px rgba(0, 210, 255, 0.3);
    }
    .swap-btn-confirm:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0, 210, 255, 0.5); }
    .swap-btn-confirm:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

    @media (max-width: 640px) {
      .swap-banner { top: 10px; padding: 10px 14px; font-size: 0.8rem; }
      .swap-banner-content { flex-direction: column; align-items: flex-start; gap: 8px; }
      .swap-modal-box { padding: 20px 18px; max-width: 95vw; }
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
// ═══ GENERATE NEW SCHEDULE (server-side generation)  ═══
// ═══════════════════════════════════════════════════════
async function generateNewSchedule() {
  console.log("Executing JHS Master Schedule Generation...");

  let container = document.getElementById("timetable-matrix-output-body") ||
                  document.querySelector('.dashboard-card-panel') ||
                  document.querySelector('.main-content') ||
                  document.body;

  container.innerHTML = `
    <div style="text-align: center; color: #1e293b; font-weight: bold; padding: 40px; font-size: 1.1rem; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; margin-top: 20px;">
      Generating JHS Master Schedules...
    </div>
  `;

  const token = getAuthToken();
  if (!token || token === "null" || token === "undefined") {
    container.innerHTML = `<div style="color:#dc2626;padding:30px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-weight:bold;">Authentication failure.</div>`;
    return;
  }

  try {
    const baseOrigin = window.location.origin;

    const res = await fetch(`${baseOrigin}/api/admin/generate-jhs-master`, {
      method: "POST",
      headers: {
        "Authorization": token.startsWith("Bearer ") ? token : `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ sectionOverrides: {} })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "JHS generation failed");

    console.log(`✅ JHS master saved: ${data.sectionsProcessed} sections, ${data.teachersUpdated} teachers`);

    await loadExistingSchedule();

  } catch (err) {
    console.error("JHS generation failed:", err);
    container.innerHTML = `<div style="color:#dc2626;padding:40px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-weight:bold;">Error: ${err.message}</div>`;
  }
}

// ═══════════════════════════════════════════════════════
// ═══ LOAD EXISTING SCHEDULE (read from DB)           ═══
// ═══════════════════════════════════════════════════════
async function loadExistingSchedule() {
  console.log("Loading master schedules from DB...");

  let container = document.getElementById("timetable-matrix-output-body") ||
                  document.querySelector('.dashboard-card-panel') ||
                  document.querySelector('.main-content') ||
                  document.body;

  const token = getAuthToken();
  if (!token || token === "null" || token === "undefined") {
    container.innerHTML = `<div style="color:#dc2626;padding:30px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-weight:bold;">Authentication failure.</div>`;
    return;
  }

  try {
    const headers = {
      'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    const baseOrigin = window.location.origin;

    const [schedRes, teachersRes, roomsRes, sectionsRes] = await Promise.all([
      fetch(`${baseOrigin}/api/admin/schedules?_t=${Date.now()}`, { headers }),
      fetch(`${baseOrigin}/api/admin/teachers`, { headers }),
      fetch(`${baseOrigin}/api/admin/rooms`, { headers }),
      fetch(`${baseOrigin}/api/admin/sections`, { headers })
    ]);

    const rawSchedules = schedRes.ok ? await schedRes.json() : [];
    const rawTeachers = teachersRes.ok ? await teachersRes.json() : [];
    const rawRooms = roomsRes.ok ? await roomsRes.json() : [];
    const rawSections = sectionsRes.ok ? await sectionsRes.json() : [];

    const daySlots = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const timeSlots = [
      "06:00-06:50","06:50-07:40","07:40-08:30","08:30-09:00",
      "09:00-09:50","09:50-10:40","10:40-11:30",
      "12:30-13:20","13:20-14:10","14:10-15:00","15:00-15:30",
      "15:30-16:20","16:20-17:10","17:10-18:00"
    ];

    const masterSectionSchedules = {};

    rawSections.forEach(sec => {
      const gradeNum = jhsGradeNumFromString(sec.gradeLevel || sec.grade_level);
      if (gradeNum < 7 || gradeNum > 10) return;

      masterSectionSchedules[sec.name] = {
        details: sec,
        gradeLevel: `Junior High School - Grade ${gradeNum}`,
        shift: sec.shift || "AM",
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

        // ═══ KEY FIX: Use slot's OWN teacher info (after a swap), else fallback ═══
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
    container.innerHTML = `<div style="color:#dc2626;padding:40px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-weight:bold;">Error: ${err.message}</div>`;
  }
}

// ═══════════════════════════════════════════════════════
// ═══ RENDERER (Edit Mode + Swap + Move)              ═══
// ═══════════════════════════════════════════════════════
function renderMasterSectionScheduleDashboard(container, masterSectionSchedules, auditSummary, daySlots, timeSlots, normalizedTeachers) {
  container.innerHTML = "";
  window.__cellDataRegistry = {};

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
      /* ═══ PDF EXPORT STYLING ═══ */
      .section-pdf-export {
        background: #fff !important;
        padding: 20px !important;
        border: none !important;
      }
      .section-pdf-export .no-print {
        display: none !important;
      }

      /* ═══ PRINT STYLES — BIGGER FONTS ═══ */
      @media print {
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }

        @page {
          size: letter landscape;
          margin: 0.25in;
        }

        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          width: 100% !important;
          height: 100% !important;
        }

        body * {
          visibility: hidden;
        }

        .section-print-area,
        .section-print-area * {
          visibility: visible;
        }

        .section-print-area {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
          height: 100% !important;
          max-height: 100% !important;
          padding: 0 !important;
          margin: 0 !important;
          border: none !important;
          box-shadow: none !important;
          background: #ffffff !important;
          overflow: hidden !important;
          box-sizing: border-box !important;
          display: flex !important;
          flex-direction: column !important;
        }

        .no-print,
        .btn-edit-mode,
        .edit-mode-active-banner,
        button,
        .swap-banner,
        .swap-modal-overlay {
          display: none !important;
        }

        /* ═══ HEADER: Section title — BIGGER ═══ */
        .section-print-area h3 {
          font-size: 18pt !important;
          font-weight: 900 !important;
          margin: 0 0 3pt 0 !important;
          padding: 0 !important;
          color: #000 !important;
          text-transform: uppercase !important;
          letter-spacing: 1px !important;
          line-height: 1.1 !important;
        }

        .section-print-area > div:first-child {
          margin-bottom: 6pt !important;
          padding: 0 !important;
          flex-shrink: 0 !important;
        }

        .section-print-area > div:first-child > div:last-child {
          font-size: 10pt !important;
          color: #333 !important;
          font-weight: 500 !important;
        }

        /* ═══ TABLE ═══ */
        .section-print-area table {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 100% !important;
          height: auto !important;
          border-collapse: collapse !important;
          border-spacing: 0 !important;
          table-layout: fixed !important;
          font-family: 'Poppins', Arial, sans-serif !important;
          border: 2pt solid #000 !important;
          flex: 1 !important;
        }

        /* ═══ ALL CELLS ═══ */
        .section-print-area th,
        .section-print-area td {
          border: 1pt solid #000 !important;
          outline: 1pt solid #000 !important;
          outline-offset: -1pt !important;
          padding: 6pt 4pt !important;
          text-align: center !important;
          vertical-align: middle !important;
          word-wrap: break-word !important;
          overflow-wrap: break-word !important;
          background-clip: border-box !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          box-sizing: border-box !important;
          line-height: 1.2 !important;
        }

        /* ═══ HEADER ROW: Day names — BIGGER ═══ */
        .section-print-area thead th {
          background: #e2e8f0 !important;
          color: #000 !important;
          font-weight: 900 !important;
          font-size: 15pt !important;
          padding: 10pt 4pt !important;
          text-transform: uppercase !important;
          letter-spacing: 1px !important;
          border: 1pt solid #000 !important;
          outline: 1pt solid #000 !important;
          outline-offset: -1pt !important;
          height: 30pt !important;
        }

        /* ═══ TIME COLUMN: BIGGER ═══ */
        .section-print-area tbody td:first-child {
          background: #f8fafc !important;
          font-weight: 900 !important;
          font-size: 12pt !important;
          width: 13% !important;
          border: 1pt solid #000 !important;
          outline: 1pt solid #000 !important;
          outline-offset: -1pt !important;
          padding: 6pt 3pt !important;
        }

        /* ═══ SUBJECT CELLS: BIGGER ═══ */
        .section-print-area tbody td {
          font-size: 12pt !important;
          padding: 6pt 4pt !important;
          border: 1pt solid #000 !important;
          outline: 1pt solid #000 !important;
          outline-offset: -1pt !important;
          height: 55pt !important;
        }

        /* Subject name — LARGEST */
        .section-print-area tbody td > div:first-child {
          font-size: 13pt !important;
          font-weight: 900 !important;
          line-height: 1.15 !important;
          margin-bottom: 3pt !important;
          color: #000 !important;
        }

        /* Teacher name — BIGGER */
        .section-print-area tbody td > div:nth-child(2) {
          font-size: 10pt !important;
          font-weight: 700 !important;
          margin-top: 3pt !important;
          color: #222 !important;
        }

        /* Room — BIGGER */
        .section-print-area tbody td > div:nth-child(3) {
          font-size: 9pt !important;
          font-weight: 600 !important;
          opacity: 0.9 !important;
          margin-top: 2pt !important;
          color: #444 !important;
        }

        /* Preserve colors */
        .section-print-area tbody td[style*="background"] {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        /* Break row */
        .section-print-area tbody tr td[colspan] {
          height: 20pt !important;
          padding: 4pt !important;
          background: #f1f5f9 !important;
          border: 1pt solid #000 !important;
          outline: 1pt solid #000 !important;
          outline-offset: -1pt !important;
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
  summaryCard.className = "no-print";
  summaryCard.style.cssText = "background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px; margin-bottom: 25px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);";

  const statusColor = totalMissingSubjectsCount === 0 ? "#16a34a" : "#dc2626";

  let auditHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 14px; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
      <h3 style="color: #0f172a; margin: 0; font-size: 1.1rem; font-weight: 700;">
        Makiling Integrated School - Resource & Capacity Audit
      </h3>
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <span style="background: ${statusColor}15; color: ${statusColor}; font-size: 0.82rem; font-weight: bold; padding: 5px 14px; border-radius: 20px; border: 1px solid ${statusColor}44;">
          ${totalMissingSubjectsCount === 0 ? "All Grade Levels Fully Scheduled" : `${totalMissingSubjectsCount} Unassigned Subject Class(es)`}
        </span>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
      <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border-left: 4px solid #0284c7;">
        <div style="color: #64748b; font-size: 0.75rem; font-weight: 600;">Total Sections</div>
        <div style="color: #0f172a; font-size: 1.2rem; font-weight: 700;">${auditSummary.totalSections} Sections</div>
      </div>
      <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border-left: 4px solid #0284c7;">
        <div style="color: #64748b; font-size: 0.75rem; font-weight: 600;">Total Active Teachers</div>
        <div style="color: #0f172a; font-size: 1.2rem; font-weight: 700;">${auditSummary.totalTeachers} Teachers</div>
      </div>
      <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border-left: 4px solid #0284c7;">
        <div style="color: #64748b; font-size: 0.75rem; font-weight: 600;">Available Rooms</div>
        <div style="color: #0f172a; font-size: 1.2rem; font-weight: 700;">${auditSummary.totalRooms} Rooms</div>
      </div>
    </div>
    <div class="no-print" style="margin-top: 14px; padding: 10px 14px; background: rgba(245,158,11,0.06); border: 1px solid rgba(245,158,11,0.25); border-radius: 6px; font-size: 0.82rem; color: #92400e;">
      ✏️ <strong>How to edit:</strong> Click <strong>✏️ Edit Mode</strong> on any section. Then:
      <br>• Click <strong>two class cells</strong> to swap them.
      <br>• Click a <strong>class cell</strong>, then a <strong>vacant cell</strong> to move it there.
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
          <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 12px 16px; border-radius: 6px; margin-top: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
              <span style="color: #991b1b; font-weight: bold; font-size: 0.95rem;">
                ${grade} <span style="color: #dc2626; font-size: 0.8rem; font-weight: 600;">(${item.teacherCount} Teachers Assigned)</span>
              </span>
              <a href="Addteacher.html" style="background: #ef4444; color: #ffffff; text-decoration: none; padding: 4px 12px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">
                + Assign Teacher
              </a>
            </div>
            <div style="font-size: 0.82rem; color: #7f1d1d; margin-bottom: 6px;">
              ${item.teacherCount === 0
                ? "⚠️ Cannot generate timetable: No instructors assigned to teach this Grade Level."
                : "⚠️ The following required subjects could not be scheduled due to teacher shortage:"}
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
              ${(item.missingSubjects || []).map(subj => `
                <span style="background: #ffffff; color: #dc2626; border: 1px solid #fca5a5; padding: 3px 8px; border-radius: 4px; font-size: 0.78rem; font-weight: 600;">
                  ${subj}
                </span>
              `).join('')}
            </div>
          </div>
        `;
      }
    });

  if (activeShortageCardCount === 0) {
    auditHTML += `
      <div style="color: #16a34a; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 6px; font-weight: 600; font-size: 0.85rem; margin-top: 12px;">
        No schedule shortages detected. All sections have been fully scheduled.
      </div>
    `;
  }

  summaryCard.innerHTML = auditHTML;
  mainWrapper.appendChild(summaryCard);

  window.printSectionSchedule = function(cardId) {
    const cardTarget = document.getElementById(cardId);
    if (!cardTarget) return;
    document.querySelectorAll('.section-print-area').forEach(el => el.classList.remove('section-print-area'));
    cardTarget.classList.add('section-print-area');
    window.print();
  };

  window.downloadSectionPDF = async function(cardId, sectionName) {
    const originalCard = document.getElementById(cardId);
    if (!originalCard) return;

    // ═══ STEP 1: Verify libraries ═══
    if (typeof html2canvas === "undefined") {
      alert("html2canvas library not loaded. Please refresh the page (Ctrl+Shift+R).");
      return;
    }
    if (typeof window.jspdf === "undefined" || typeof window.jspdf.jsPDF === "undefined") {
      alert("jsPDF library not loaded. Please refresh the page (Ctrl+Shift+R).");
      return;
    }
    const { jsPDF } = window.jspdf;

    // ═══ STEP 2: Show loading indicator ═══
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'pdf-loading-overlay';
    loadingOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(15, 23, 42, 0.9);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 1.2rem;
      font-weight: 600;
      font-family: 'Poppins', sans-serif;
    `;
    loadingOverlay.innerHTML = `
      <div style="text-align: center;">
        <div style="font-size: 2.5rem; margin-bottom: 12px;">📄</div>
        <div>Generating PDF...</div>
        <div style="font-size: 0.85rem; color: #94a3b8; margin-top: 8px;">Please wait</div>
      </div>
    `;
    document.body.appendChild(loadingOverlay);

    // ═══ STEP 3: Clone and clean ═══
    const clone = originalCard.cloneNode(true);
    clone.querySelectorAll('.no-print, button, .btn-edit-mode, .edit-mode-active-banner, .swap-banner, .swap-modal-overlay').forEach(el => el.remove());
    
    clone.style.cssText = `
      width: 1056px !important;
      max-width: 1056px !important;
      min-width: 0 !important;
      padding: 20px !important;
      margin: 0 !important;
      border: none !important;
      border-radius: 0 !important;
      overflow: visible !important;
      background: #ffffff !important;
      box-sizing: border-box !important;
      font-family: 'Poppins', Arial, sans-serif !important;
    `;

    // ═══ STEP 4: Container — on-screen, behind loading overlay ═══
    const container = document.createElement('div');
    container.id = 'pdf-export-container';
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 1056px;
      background: #ffffff;
      z-index: 2147483646;
      overflow: visible;
    `;
    container.appendChild(clone);
    document.body.appendChild(container);

    // ═══ STEP 5: Inject PDF CSS ═══
    const styleId = 'pdf-export-styles';
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) existingStyle.remove();
    
    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.innerHTML = `
      #pdf-export-container { background: #ffffff !important; color: #000 !important; }
      #pdf-export-container * { box-sizing: border-box !important; font-family: 'Poppins', Arial, sans-serif !important; }
      #pdf-export-container h3 {
        font-size: 18pt !important; font-weight: 900 !important;
        margin: 0 0 4pt 0 !important; padding: 0 !important;
        color: #000 !important; text-transform: uppercase !important;
        letter-spacing: 1px !important; line-height: 1.1 !important;
      }
      #pdf-export-container > div > div:first-child { margin-bottom: 10pt !important; padding: 0 !important; }
      #pdf-export-container > div > div:first-child > div:last-child {
        font-size: 10pt !important; color: #333 !important; font-weight: 500 !important;
      }
      #pdf-export-container table {
        width: 100% !important; max-width: 100% !important; min-width: 0 !important;
        border-collapse: collapse !important; border-spacing: 0 !important;
        table-layout: fixed !important; border: 2pt solid #000 !important; margin: 0 !important;
      }
      #pdf-export-container th,
      #pdf-export-container td {
        border: 1pt solid #000 !important; padding: 6pt 4pt !important;
        text-align: center !important; vertical-align: middle !important;
        word-wrap: break-word !important; overflow-wrap: break-word !important;
        background-clip: border-box !important; line-height: 1.2 !important;
      }
      #pdf-export-container thead th {
        background: #e2e8f0 !important; color: #000 !important;
        font-weight: 900 !important; font-size: 14pt !important;
        padding: 10pt 4pt !important; text-transform: uppercase !important;
        letter-spacing: 1px !important; height: 28pt !important;
      }
      #pdf-export-container tbody td:first-child {
        background: #f8fafc !important; font-weight: 900 !important;
        font-size: 11pt !important; width: 13% !important; padding: 6pt 3pt !important;
      }
      #pdf-export-container tbody td {
        font-size: 11pt !important; padding: 6pt 4pt !important; height: 50pt !important;
      }
      #pdf-export-container tbody td > div:first-child {
        font-size: 12pt !important; font-weight: 900 !important;
        line-height: 1.15 !important; margin-bottom: 2pt !important; color: #000 !important;
      }
      #pdf-export-container tbody td > div:nth-child(2) {
        font-size: 9pt !important; font-weight: 700 !important;
        margin-top: 2pt !important; color: #222 !important;
      }
      #pdf-export-container tbody td > div:nth-child(3) {
        font-size: 8pt !important; font-weight: 600 !important;
        opacity: 0.9 !important; margin-top: 1pt !important; color: #444 !important;
      }
      #pdf-export-container tbody tr td[colspan] {
        height: 18pt !important; padding: 4pt !important;
        background: #f1f5f9 !important; font-size: 10pt !important;
      }
    `;
    document.head.appendChild(styleEl);

    // ═══ STEP 6: Wait for layout ═══
    await new Promise(resolve => setTimeout(resolve, 800));

    try {
      console.log("📐 Container:", container.offsetWidth, "x", container.offsetHeight);

      // ═══ STEP 7: Capture with html2canvas ═══
      console.log("📸 Capturing...");
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: 1056,
        windowWidth: 1056,
        allowTaint: true,
        removeContainer: false,
      });

      console.log("✅ Canvas:", canvas.width, "x", canvas.height);

      // ═══ STEP 8: Check if blank ═══
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, Math.min(canvas.width, 200), Math.min(canvas.height, 200));
      const pixels = imageData.data;
      let hasContent = false;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] < 240 || pixels[i+1] < 240 || pixels[i+2] < 240) {
          hasContent = true;
          break;
        }
      }
      console.log("🔍 Has content:", hasContent);
      if (!hasContent) {
        throw new Error("Canvas is blank. html2canvas failed to capture content.");
      }

      // ═══ STEP 9: Create PDF ═══
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({
        unit: 'in',
        format: 'letter',
        orientation: 'landscape',
        compress: true,
      });

      const pageWidth = 11;
      const pageHeight = 8.5;
      const margin = 0.2;
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
      console.log("✅ PDF saved!");

    } catch (err) {
      console.error("❌ PDF error:", err);
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
    el.style.cssText = "text-align:center;color:#dc2626;background:#fef2f2;padding:30px;border-radius:8px;border:1px solid #fecaca;font-weight:bold;";
    el.textContent = "No timetables could be rendered.";
    mainWrapper.appendChild(el);
    return;
  }

  sortedGrades.forEach(gradeName => {
    const sectionsList = gradeGrouped[gradeName];

    const gradeHeader = document.createElement("div");
    gradeHeader.className = "no-print";
    gradeHeader.style.cssText = "margin-top: 30px; margin-bottom: 15px;";
    gradeHeader.innerHTML = `<h2 style="color: #0369a1; font-size: 1.35rem; font-weight: 800; border-bottom: 2px solid #0284c7; padding-bottom: 8px;">${gradeName} <span style="color:#0284c7;font-size:0.95rem;font-weight:600;">(${sectionsList.length} Scheduled Sections)</span></h2>`;
    mainWrapper.appendChild(gradeHeader);

    sectionsList.forEach((secObj, idx) => {
      const secName = secObj.details.name;
      const shift = secObj.shift || "AM";
      const uniqueCardId = `sched-${gradeName.replace(/[^a-zA-Z0-9]/g, '')}-${idx}`;
      const isJHS = /Grade (7|8|9|10)/.test(gradeName);
      const isThisSectionInEditMode = (editMode && activeSectionId === uniqueCardId);

      const layout = isJHS
        ? (shift === "PM"
            ? ["12:30-13:20","13:20-14:10","14:10-15:00","15:00-15:30","15:30-16:20","16:20-17:10","17:10-18:00"]
            : ["06:00-06:50","06:50-07:40","07:40-08:30","08:30-09:00","09:00-09:50","09:50-10:40","10:40-11:30"])
        : timeSlots;

      const generatedTimestamp = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

      const secCard = document.createElement("div");
      secCard.id = uniqueCardId;
      secCard.style.cssText = "background:#ffffff;border:2px solid #000000;border-radius:4px;padding:15px;margin-bottom:30px;overflow-x:auto;";

      let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
          <div>
            <h3 style="color:#000;margin:0;font-size:1.15rem;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;">
              SECTION: <span style="color:#000;">${secName}</span>
              <span style="font-size:0.85rem;color:#0284c7;font-weight:600;">[${isJHS ? shift : "SHS"}]</span>
              ${isThisSectionInEditMode ? `<span style="font-size:0.75rem;background:#10b981;color:#fff;padding:3px 10px;border-radius:10px;margin-left:8px;font-weight:700;">✏️ EDIT MODE</span>` : ''}
            </h3>
            <div style="color:#475569;font-size:0.75rem;font-weight:600;margin-top:2px;">
              Generated on: ${generatedTimestamp}
            </div>
          </div>
          <div class="no-print" style="display:flex;gap:8px;align-items:center;">
            <button onclick="toggleEditMode('${uniqueCardId}')" 
                    class="btn-edit-mode ${isThisSectionInEditMode ? 'active' : ''}"
                    title="${isThisSectionInEditMode ? 'Exit edit mode' : 'Enter edit mode to enable swapping'}">
              ${isThisSectionInEditMode ? '🟢 Exit Edit Mode' : '✏️ Edit Mode'}
            </button>
            <button onclick="printSectionSchedule('${uniqueCardId}')" style="background:#000;color:#fff;border:none;padding:6px 14px;border-radius:4px;font-weight:bold;cursor:pointer;font-size:0.8rem;">Print</button>
            <button onclick="downloadSectionPDF('${uniqueCardId}', '${secName}')" style="background:#0284c7;color:#fff;border:none;padding:6px 14px;border-radius:4px;font-weight:bold;cursor:pointer;font-size:0.8rem;">Download PDF</button>
          </div>
        </div>
        ${isThisSectionInEditMode ? `
          <div class="edit-mode-active-banner">
            ✏️ <strong>Edit Mode Active</strong> — Click <strong>two class cells</strong> to swap them, or click a <strong>class cell</strong> then a <strong>vacant cell</strong> to move it there.
          </div>
        ` : ''}
        <table style="width:100%;border-collapse:collapse;min-width:750px;text-align:center;font-size:0.85rem;border:2px solid #000;">
          <thead>
            <tr style="background:#ffffff;color:#000;border-bottom:2px solid #000;">
              <th style="padding:10px;border:2px solid #000;width:120px;font-weight:800;font-size:0.9rem;">TIME</th>
      `;

      daySlots.forEach(d => {
        html += `<th style="padding:10px;border:2px solid #000;font-weight:800;font-size:0.9rem;text-transform:uppercase;">${d}</th>`;
      });
      html += `</tr></thead><tbody>`;

      layout.forEach(time => {
        const isBreak = isJHS && (time === "08:30-09:00" || time === "15:00-15:30");

        html += `<tr><td style="padding:8px;background:#fff;color:#000;font-weight:800;border:2px solid #000;font-size:0.85rem;">${time}</td>`;

        if (isBreak) {
          html += `<td colspan="${daySlots.length}" style="background:#f8fafc;border:2px solid #000;height:40px;"></td>`;
        } else if (!isJHS && (time === "09:00-10:00" || time === "12:00-01:00")) {
          html += `<td colspan="${daySlots.length}" style="background:${time === "09:00-10:00" ? "#fef08a" : "#fed7aa"};border:2px solid #000;font-weight:800;letter-spacing:2px;padding:8px;">
            ${time === "09:00-10:00" ? "RECESS / MORNING BREAK" : "LUNCH BREAK / SHIFT TRANSITION"}
          </td>`;
        } else {
          daySlots.forEach(day => {
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
                style="padding:6px;border:2px solid #000;background:${bg};color:#000;vertical-align:middle;font-weight:700;"
                ${isSwappable ? `data-cell-key="${cellKey}"` : ''}
                ${isSwappable ? `onclick="handleCellClickByKey('${cellKey}', this)"` : ''}
                title="${isSwappable ? 'Click to select for swap/move' : 'Enable Edit Mode to edit'}">
                <div style="font-size:0.9rem;font-weight:800;line-height:1.2;">${escapeHtml(slotData.subject)}</div>
                <div style="font-size:0.78rem;font-weight:600;margin-top:3px;">${escapeHtml(slotData.teacher)}</div>
                ${slotData.room ? `<div style="font-size:0.72rem;font-weight:500;opacity:0.9;">(${escapeHtml(slotData.room)})</div>` : ""}
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
                  style="padding:6px;border:2px solid #000;background:#f8fafc;"
                  data-cell-key="${blankKey}"
                  onclick="handleCellClickByKey('${blankKey}', this)"
                  title="Click to move the selected class here">
                  <div style="color:#94a3b8;font-size:0.7rem;font-weight:600;opacity:0.6;">(vacant)</div>
                </td>`;
              } else {
                html += `<td style="padding:6px;border:2px solid #000;background:#fff;"></td>`;
              }
            }
          });
        }
        html += `</tr>`;
      });

      html += `</tbody></table>`;
      secCard.innerHTML = html;
      mainWrapper.appendChild(secCard);
    });
  });
}

// ═══════════════════════════════════════════════════════
// ═══ BOOTSTRAP                                       ═══
// ═══════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  // ═══ NOTE: The "Initialize Scheduling Generator" button has an inline
  // onclick="generateNewSchedule()" in the HTML. No need for a separate
  // event listener here — and it prevents conflict with sidebar toggle. ═══

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
      console.error("Cached render failed, loading fresh:", e);
      loadExistingSchedule();
    }
  } else {
    loadExistingSchedule();
  }
});
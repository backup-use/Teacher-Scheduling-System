// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
let currentTab = 'active';
let activeTeachersCache = [];
let hiddenTeachersCache = [];
let currentSearchQuery = '';
let pendingHideId = null;
let pendingHideName = '';
let pendingDeleteId = null;
let pendingDeleteName = '';
let isFetching = false;

document.addEventListener('DOMContentLoaded', () => {
    loadTeacherData();
    loadHiddenCount();
    injectHideModal();
    injectDeleteModal();
});

window.addEventListener('pageshow', (event) => {
    if (event.persisted || performance.getEntriesByType("navigation")[0]?.type === "back_forward") {
        loadTeacherData();
        loadHiddenCount();
    }
});

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function convertTo12Hour(timeStr) {
    if (!timeStr) return '';
    if (/AM|PM/i.test(timeStr)) return timeStr.trim();
    let [hours, minutes] = timeStr.toString().split(':').map(Number);
    if (isNaN(hours)) return timeStr;
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours.toString().padStart(2, '0')}:${(minutes || 0).toString().padStart(2, '0')} ${period}`;
}

function parseTimeValue(val) {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val.map(item => parseTimeValue(item)).filter(Boolean).join(', ');
    if (typeof val === 'object') {
        if (val.display) return val.display;
        if (val.shift) return val.shift;
        if (val.start || val.startTime || val.from || val.end || val.endTime || val.to) {
            const start = convertTo12Hour(val.start || val.startTime || val.from || '');
            const end = convertTo12Hour(val.end || val.endTime || val.to || '');
            return `${start} - ${end}`.trim();
        }
    }
    return String(val);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ═══════════════════════════════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════════════════════════════
async function switchTab(tab) {
    currentTab = tab;
    currentSearchQuery = '';

    const searchInput = document.getElementById('teacher-search');
    if (searchInput) searchInput.value = '';

    document.getElementById('tab-active').classList.toggle('active', tab === 'active');
    document.getElementById('tab-hidden').classList.toggle('active', tab === 'hidden');

    await loadTeacherData();
}

// ═══════════════════════════════════════════════════════════════
// SEARCH FILTERING
// ═══════════════════════════════════════════════════════════════
function filterTeachers() {
    const searchInput = document.getElementById('teacher-search');
    currentSearchQuery = (searchInput?.value || '').toLowerCase().trim();

    const source = currentTab === 'active' ? activeTeachersCache : hiddenTeachersCache;

    if (!currentSearchQuery) {
        renderTeacherRows(source, currentTab === 'hidden');
        return;
    }

    const filtered = source.filter(t => {
        const firstName = (t.first_name || t.firstName || '').toLowerCase();
        const lastName = (t.last_name || t.lastName || '').toLowerCase();
        const fullName = `${firstName} ${lastName}`.trim();
        const email = (t.email || '').toLowerCase();
        const subjects = (Array.isArray(t.subjects) ? t.subjects.join(' ') : String(t.subjects || '')).toLowerCase();
        return fullName.includes(currentSearchQuery) || email.includes(currentSearchQuery) || subjects.includes(currentSearchQuery);
    });

    renderTeacherRows(filtered, currentTab === 'hidden');
}

// ═══════════════════════════════════════════════════════════════
// LOAD TEACHERS
// ═══════════════════════════════════════════════════════════════
async function loadTeacherData() {
    if (isFetching) return;
    isFetching = true;

    const tbody = document.getElementById('teacher-table-body');
    if (!tbody) { isFetching = false; return; }

    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:50px; color:#166534;">
        <i class="fa-solid fa-spinner fa-spin"></i> Loading teachers...
    </td></tr>`;

    try {
        const cacheBuster = `?_t=${Date.now()}`;
        const queryParam = currentTab === 'hidden' ? '&onlyHidden=true' : '&includeHidden=false';
        const endpoint = `/api/admin/teachers${cacheBuster}${queryParam}`;

        const res = await fetch(endpoint, {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
            cache: 'no-store'
        });

        if (res.status === 401 || res.status === 403) {
            window.location.href = '/auth/login.html';
            isFetching = false;
            return;
        }

        if (!res.ok) throw new Error(`Server returned ${res.status}`);

        const rawData = await res.json();
        const teachers = Array.isArray(rawData) ? rawData : (rawData.teachers || rawData.data || []);

        if (currentTab === 'active') {
            activeTeachersCache = teachers;
            updateActiveBadge();
        } else {
            hiddenTeachersCache = teachers;
            updateHiddenBadge();
        }

        filterTeachers();

    } catch (error) {
        console.error("Fetch error:", error);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:40px; color:#dc2626;">
                    <div style="font-size: 2.5rem; margin-bottom: 10px;">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                    </div>
                    <div>Failed to load teachers.</div>
                    <div style="font-size: 0.8rem; margin-top: 8px; color: #64748b;">${escapeHtml(error.message)}</div>
                </td>
            </tr>
        `;
    } finally {
        isFetching = false;
    }
}

// ═══════════════════════════════════════════════════════════════
// HIDDEN COUNT
// ═══════════════════════════════════════════════════════════════
async function loadHiddenCount() {
    try {
        const res = await fetch(`/api/admin/teachers/hidden-count?_t=${Date.now()}`, {
            credentials: 'include'
        });
        if (res.ok) {
            const data = await res.json();
            const badge = document.getElementById('hidden-count-badge');
            if (badge) badge.textContent = data.count || 0;
        }
    } catch (e) {
        console.warn('Could not load hidden count:', e);
    }
}

function updateActiveBadge() {
    const badge = document.getElementById('active-count-badge');
    if (badge) badge.textContent = activeTeachersCache.length;
}

function updateHiddenBadge() {
    const badge = document.getElementById('hidden-count-badge');
    if (badge) badge.textContent = hiddenTeachersCache.length;
}

// ═══════════════════════════════════════════════════════════════
// RENDER ROWS
// ═══════════════════════════════════════════════════════════════
function renderTeacherRows(teachers, isHiddenTab) {
    const tbody = document.getElementById('teacher-table-body');
    if (!tbody) return;

    if (!teachers || teachers.length === 0) {
        const emptyMsg = isHiddenTab
            ? `<div style="font-size: 2.5rem; margin-bottom: 10px; color: #ca8a04;"><i class="fa-solid fa-eye-slash"></i></div>
               <div>No hidden teachers.</div>
               <div style="font-size: 0.85rem; margin-top: 8px; color: #64748b;">Teachers you hide will appear here.</div>`
            : `<div style="font-size: 2.5rem; margin-bottom: 10px; color: #166534;"><i class="fa-solid fa-user-graduate"></i></div>
               <div>No teachers found. Click "Teachers" to add one.</div>`;
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:40px; color:#64748b;">${emptyMsg}</td></tr>`;
        return;
    }

    let tableHTML = '';
    teachers.forEach(teacher => {
        const teacherId = teacher.id || teacher.teacher_id || teacher._id || '';
        const firstName = teacher.first_name || teacher.firstName || '';
        const lastName = teacher.last_name || teacher.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim() || teacher.name || teacher.fullName || 'Unknown Teacher';
        const email = teacher.email || 'No email';

        let subjectsList = [];
        const rawSubjects = teacher.subjects || teacher.subject_list || teacher.subject;
        if (rawSubjects) {
            if (Array.isArray(rawSubjects)) subjectsList = rawSubjects;
            else if (typeof rawSubjects === 'string') {
                try { subjectsList = JSON.parse(rawSubjects); }
                catch { subjectsList = rawSubjects.split(',').map(s => s.trim()).filter(Boolean); }
            }
        }

        const targetGrade = teacher.target_grade || teacher.targetGrade || teacher.gradeLevel || teacher.grade || '';
        const gradeDisplay = targetGrade
            ? `<span class="grade-badge"><i class="fa-solid fa-graduation-cap"></i> ${escapeHtml(targetGrade)}</span>`
            : `<span class="grade-empty">Unassigned</span>`;

        let workDays = [];
        const daysData = teacher.work_days || teacher.workDays;
        if (daysData) {
            if (Array.isArray(daysData)) workDays = daysData;
            else if (typeof daysData === 'string') {
                try { workDays = JSON.parse(daysData); }
                catch { workDays = daysData.split(',').map(d => d.trim()).filter(Boolean); }
            }
        }
        const daysDisplay = workDays.length > 0 ? workDays.join(', ') : '--';

        const startTime = teacher.start_time || teacher.startTime;
        const endTime = teacher.end_time || teacher.endTime;
        let timeShiftDisplay = '';
        if (startTime && endTime) {
            timeShiftDisplay = `${convertTo12Hour(startTime)} - ${convertTo12Hour(endTime)}`;
        } else if (startTime) {
            timeShiftDisplay = convertTo12Hour(startTime);
        } else {
            const parsedShift = parseTimeValue(teacher.shift || teacher.time || teacher.availability);
            timeShiftDisplay = (parsedShift && !parsedShift.includes('[object Object]')) ? parsedShift : 'N/A';
        }

        const subjectsHTML = subjectsList.length > 0
            ? subjectsList.map(sub => `<span class="subject-badge">${escapeHtml(sub)}</span>`).join('')
            : `<span class="subjects-empty">No subjects</span>`;

        const rowClass = isHiddenTab ? 'teacher-row hidden-teacher' : 'teacher-row';
        const safeNameForJs = escapeHtml(fullName).replace(/'/g, "\\'");

        const actionsHTML = isHiddenTab
            ? `<button onclick="unhideTeacher('${teacherId}', '${safeNameForJs}')"
                       class="btn-icon btn-unhide" title="Restore teacher">
                   <i class="fa-solid fa-eye"></i>
               </button>
               <button onclick="openDeleteModal('${teacherId}', '${safeNameForJs}')"
                       class="btn-icon btn-delete" title="Delete permanently">
                   <i class="fa-solid fa-trash"></i>
               </button>`
            : `<button onclick="editTeacher('${teacherId}')" class="btn-icon btn-edit" title="Edit Teacher">
                   <i class="fa-solid fa-pen"></i>
               </button>
               <button onclick="openHideModal('${teacherId}', '${safeNameForJs}')"
                       class="btn-icon btn-hide" title="Hide Teacher">
                   <i class="fa-solid fa-eye-slash"></i>
               </button>`;

        tableHTML += `
            <tr class="${rowClass}">
                <td title="${escapeHtml(fullName)}"><div>${escapeHtml(fullName)}</div></td>
                <td class="cell-email" title="${escapeHtml(email)}"><div>${escapeHtml(email)}</div></td>
                <td><div class="subjects-cell">${subjectsHTML}</div></td>
                <td>${gradeDisplay}</td>
                <td class="cell-days" title="${escapeHtml(daysDisplay)}"><div>${escapeHtml(daysDisplay)}</div></td>
                <td style="text-align: center;">
                    <span class="shift-badge">${escapeHtml(timeShiftDisplay)}</span>
                </td>
                <td style="text-align: center; white-space: nowrap;">${actionsHTML}</td>
            </tr>
        `;
    });

    tbody.innerHTML = tableHTML;
}

// ═══════════════════════════════════════════════════════════════
// EDIT
// ═══════════════════════════════════════════════════════════════
async function editTeacher(id) {
    if (!id || id === 'undefined') { alert('Invalid teacher ID'); return; }
    window.location.href = `edit-teacher.html?id=${id}`;
}

// ═══════════════════════════════════════════════════════════════
// HIDE MODAL
// ═══════════════════════════════════════════════════════════════
function injectHideModal() {
    if (document.getElementById('hide-confirm-modal')) return;

    const modalHTML = `
        <div id="hide-confirm-modal" class="hide-modal-overlay">
            <div class="hide-modal-box">
                <div class="hide-modal-icon"><i class="fa-solid fa-eye-slash"></i></div>
                <h2 class="hide-modal-title">Hide this teacher?</h2>
                <p class="hide-modal-text">
                    <strong id="hide-modal-name"></strong> will be moved to the <em>Hidden Teachers</em> tab.
                    Their data and historical records will be preserved.
                </p>
                <ul class="hide-modal-notes">
                    <li><i class="fa-solid fa-check"></i> They will <strong>NOT</strong> appear in schedule generation.</li>
                    <li><i class="fa-solid fa-check"></i> You can restore them anytime from the Hidden tab.</li>
                    <li><i class="fa-solid fa-check"></i> All records are kept safe.</li>
                </ul>
                <div class="hide-modal-actions">
                    <button class="hide-modal-cancel" onclick="closeHideModal()">Cancel</button>
                    <button class="hide-modal-confirm" onclick="confirmHide()">Yes, Hide Teacher</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function openHideModal(id, name) {
    pendingHideId = id;
    pendingHideName = name;
    const nameEl = document.getElementById('hide-modal-name');
    if (nameEl) nameEl.textContent = name;
    document.getElementById('hide-confirm-modal')?.classList.add('active');
}

function closeHideModal() {
    pendingHideId = null;
    pendingHideName = '';
    document.getElementById('hide-confirm-modal')?.classList.remove('active');
}

async function confirmHide() {
    if (!pendingHideId) return;
    const teacherId = pendingHideId;
    const teacherName = pendingHideName;
    closeHideModal();

    try {
        const response = await fetch(`/api/admin/teachers/${teacherId}/hide`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json().catch(() => ({}));

        if (response.ok && result.success) {
            showToast(`${teacherName} hidden successfully.`, 'success');
            activeTeachersCache = activeTeachersCache.filter(t => String(t.id) !== String(teacherId));
            updateActiveBadge();
            await loadHiddenCount();
            filterTeachers();
        } else {
            showToast(result.error || 'Failed to hide teacher.', 'error');
        }
    } catch (err) {
        console.error("Hide Error:", err);
        showToast(`System error: ${err.message}`, 'error');
    }
}

// ═══════════════════════════════════════════════════════════════
// UNHIDE
// ═══════════════════════════════════════════════════════════════
async function unhideTeacher(id, name) {
    if (!id || id === 'undefined') { alert('Invalid teacher ID'); return; }

    const confirmed = confirm(`Restore "${name}" to the active teacher list?\n\nThey will be included in future schedule generations.`);
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/admin/teachers/${id}/unhide`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json().catch(() => ({}));

        if (response.ok && result.success) {
            showToast(`${name} restored to active list.`, 'success');
            hiddenTeachersCache = hiddenTeachersCache.filter(t => String(t.id) !== String(id));
            updateHiddenBadge();
            await loadHiddenCount();
            filterTeachers();
        } else {
            showToast(result.error || 'Failed to unhide teacher.', 'error');
        }
    } catch (err) {
        console.error("Unhide Error:", err);
        showToast(`System error: ${err.message}`, 'error');
    }
}

// ═══════════════════════════════════════════════════════════════
// DELETE MODAL
// ═══════════════════════════════════════════════════════════════
function injectDeleteModal() {
    if (document.getElementById('delete-confirm-modal')) return;

    const modalHTML = `
        <div id="delete-confirm-modal" class="hide-modal-overlay">
            <div class="hide-modal-box">
                <div class="hide-modal-icon danger"><i class="fa-solid fa-trash"></i></div>
                <h2 class="hide-modal-title danger">Permanently delete this teacher?</h2>
                <p class="hide-modal-text">
                    <strong id="delete-modal-name"></strong> will be <em>removed from the database</em>.
                    This action <strong>cannot be undone</strong>.
                </p>
                <ul class="hide-modal-notes danger">
                    <li><i class="fa-solid fa-xmark"></i> Their teacher record will be deleted.</li>
                    <li><i class="fa-solid fa-xmark"></i> Their login account will be removed.</li>
                    <li><i class="fa-solid fa-xmark"></i> Their schedule data will be deleted.</li>
                </ul>
                <p class="hide-modal-text" style="font-size:0.85rem;">
                    Prefer <strong>Hide</strong> instead if you just want them inactive.
                </p>
                <div class="hide-modal-actions">
                    <button class="hide-modal-cancel" onclick="closeDeleteModal()">Cancel</button>
                    <button class="hide-modal-confirm danger" onclick="confirmDelete()">Yes, Delete Permanently</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function openDeleteModal(id, name) {
    pendingDeleteId = id;
    pendingDeleteName = name;
    const nameEl = document.getElementById('delete-modal-name');
    if (nameEl) nameEl.textContent = name;
    document.getElementById('delete-confirm-modal')?.classList.add('active');
}

function closeDeleteModal() {
    pendingDeleteId = null;
    pendingDeleteName = '';
    document.getElementById('delete-confirm-modal')?.classList.remove('active');
}

async function confirmDelete() {
    if (!pendingDeleteId) return;
    const teacherId = pendingDeleteId;
    const teacherName = pendingDeleteName;
    closeDeleteModal();

    try {
        const response = await fetch(`/api/admin/teachers/${teacherId}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json().catch(() => ({}));

        if (response.ok && result.success) {
            showToast(`${teacherName} deleted permanently.`, 'success');
            hiddenTeachersCache = hiddenTeachersCache.filter(t => String(t.id) !== String(teacherId));
            updateHiddenBadge();
            await loadHiddenCount();
            filterTeachers();
        } else {
            showToast(result.error || 'Failed to delete teacher.', 'error');
        }
    } catch (err) {
        console.error("Delete Error:", err);
        showToast(`System error: ${err.message}`, 'error');
    }
}

// ═══════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════
function showToast(message, type = 'success') {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.style.cssText = `
            position: fixed; bottom: 30px; right: 30px; padding: 12px 20px;
            border-radius: 10px; font-weight: 600; font-size: 0.9rem;
            z-index: 99999; box-shadow: 0 6px 24px rgba(0,0,0,0.2);
            transition: all 0.3s cubic-bezier(0.68, -0.55, 0.27, 1.55);
            font-family: 'Inter', sans-serif;
            display: flex; align-items: center; gap: 10px;
        `;
        document.body.appendChild(toast);
    }
    const iconHTML = type === 'success'
        ? '<i class="fa-solid fa-circle-check"></i>'
        : '<i class="fa-solid fa-circle-exclamation"></i>';
    toast.innerHTML = `${iconHTML}<span>${escapeHtml(message)}</span>`;
    toast.style.background = type === 'success' ? '#166534' : '#dc2626';
    toast.style.color = '#ffffff';
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(30px)';
    }, 3000);
}

// ═══════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════════
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        loadTeacherData();
        loadHiddenCount();
    }
    if (e.key === 'Escape') {
        closeHideModal();
        closeDeleteModal();
    }
});
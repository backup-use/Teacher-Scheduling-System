// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
let currentTab = 'active';            // 'active' | 'hidden'
let activeTeachersCache = [];
let hiddenTeachersCache = [];
let currentSearchQuery = '';
let pendingHideId = null;
let pendingHideName = '';
let isFetching = false;               // prevent double-fetch

document.addEventListener('DOMContentLoaded', () => {
    loadTeacherData();
    loadHiddenCount();
    injectHideModal();
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
// TAB SWITCHING — now fetches fresh data
// ═══════════════════════════════════════════════════════════════
async function switchTab(tab) {
    currentTab = tab;
    currentSearchQuery = '';
    
    const searchInput = document.getElementById('teacher-search');
    if (searchInput) searchInput.value = '';

    document.getElementById('tab-active').classList.toggle('active', tab === 'active');
    document.getElementById('tab-hidden').classList.toggle('active', tab === 'hidden');

    // ALWAYS fetch fresh data on tab switch
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
// LOAD TEACHERS — with correct tab-aware fetching
// ═══════════════════════════════════════════════════════════════
async function loadTeacherData() {
    if (isFetching) return;
    isFetching = true;

    const tbody = document.getElementById('teacher-table-body');
    if (!tbody) { isFetching = false; return; }

    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:50px; color:#00d2ff;">📚 LOADING TEACHERS...</td></tr>';

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = '/shared/login.html';
            isFetching = false;
            return;
        }

        const cacheBuster = `?_t=${Date.now()}`;
        const queryParam = currentTab === 'hidden' ? '&onlyHidden=true' : '&includeHidden=false';
        const endpoint = `/api/admin/teachers${cacheBuster}${queryParam}`;

        const res = await fetch(endpoint, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
            cache: 'no-store'
        });

        if (!res.ok) {
            throw new Error(`Server returned ${res.status}`);
        }

        const rawData = await res.json();
        const teachers = Array.isArray(rawData) ? rawData : (rawData.teachers || rawData.data || []);

        // Save to correct cache based on currentTab
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
                <td colspan="7" style="text-align:center; padding:40px; color:#ff5f5f;">
                    <div style="font-size: 3rem; margin-bottom: 10px;">⚠️</div>
                    <div>Failed to load teachers.</div>
                    <div style="font-size: 0.8rem; margin-top: 8px; color: #a0a0c0;">${escapeHtml(error.message)}</div>
                </td>
            </tr>
        `;
    } finally {
        isFetching = false;
    }
}

// ═══════════════════════════════════════════════════════════════
// HIDDEN COUNT (for badge)
// ═══════════════════════════════════════════════════════════════
async function loadHiddenCount() {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await fetch(`/api/admin/teachers/hidden-count?_t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
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
            ? `<div style="font-size: 3rem; margin-bottom: 10px;">🙈</div><div>No hidden teachers.</div><div style="font-size: 0.85rem; margin-top: 8px; color: #a0a0c0;">Teachers you hide will appear here.</div>`
            : `<div style="font-size: 3rem; margin-bottom: 10px;">👨‍🏫</div><div>No teachers found. Click "Teachers" to add one.</div>`;
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:40px; color:#a0a0c0;">${emptyMsg}</td></tr>`;
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
            ? `<span style="background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 500;">📌 ${escapeHtml(targetGrade)}</span>` 
            : `<span style="color: rgba(255,255,255,0.3); font-style: italic; font-size: 0.85rem;">-- Unassigned --</span>`;

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
            : `<span style="color: rgba(255,255,255,0.3); font-style: italic; font-size: 0.85rem;">No subjects</span>`;

        const rowClass = isHiddenTab ? 'teacher-row hidden-teacher' : 'teacher-row';

        const actionsHTML = isHiddenTab
            ? `<button onclick="unhideTeacher('${teacherId}', '${escapeHtml(fullName).replace(/'/g, "\\'")}', this)" 
                    class="btn-unhide" title="Restore teacher">
                    👁️ Unhide
                </button>`
            : `<button onclick="editTeacher('${teacherId}')" class="btn-icon" title="Edit Teacher">✏️</button>
                <button onclick="openHideModal('${teacherId}', '${escapeHtml(fullName).replace(/'/g, "\\'")}')" 
                        class="btn-icon" title="Hide Teacher">🙈</button>`;

        tableHTML += `
            <tr class="${rowClass}" 
                onmouseover="this.style.background='rgba(255,255,255,0.03)'" 
                onmouseout="this.style.background='transparent'">
                <td style="padding: 14px 12px; font-weight: 600; color: #fff;">${escapeHtml(fullName)}</td>
                <td style="padding: 14px 12px; color: #a0a0c0; font-size: 0.9rem;">${escapeHtml(email)}</td>
                <td style="padding: 14px 12px;"><div style="display: flex; gap: 6px; flex-wrap: wrap;">${subjectsHTML}</div></td>
                <td style="padding: 14px 12px;">${gradeDisplay}</td>
                <td style="padding: 14px 12px; font-size: 0.85rem; color: #a0a0c0;">${escapeHtml(daysDisplay)}</td>
                <td style="padding: 14px 12px; text-align: center;">
                    <span class="shift-badge">${escapeHtml(timeShiftDisplay)}</span>
                </td>
                <td style="padding: 14px 12px; text-align: center;">${actionsHTML}</td>
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
// HIDE / UNHIDE MODALS
// ═══════════════════════════════════════════════════════════════
function injectHideModal() {
    if (document.getElementById('hide-confirm-modal')) return;

    const modalHTML = `
        <div id="hide-confirm-modal" class="hide-modal-overlay">
            <div class="hide-modal-box">
                <div class="hide-modal-icon">🙈</div>
                <h2 class="hide-modal-title">Hide this teacher?</h2>
                <p class="hide-modal-text">
                    <strong id="hide-modal-name"></strong> will be moved to the <em>Hidden Teachers</em> tab.
                    Their data and historical records will be preserved.
                </p>
                <ul class="hide-modal-notes">
                    <li>✅ They will <strong>NOT</strong> appear in schedule generation.</li>
                    <li>✅ You can restore them anytime from the Hidden tab.</li>
                    <li>✅ All records are kept safe.</li>
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
        const token = localStorage.getItem('token');
        if (!token) { alert('Please login first'); return; }

        const response = await fetch(`/api/admin/teachers/${teacherId}/hide`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json().catch(() => ({}));

        if (response.ok && result.success) {
            showToast(`🙈 ${teacherName} hidden successfully!`, 'success');

            // Remove from active cache
            activeTeachersCache = activeTeachersCache.filter(t => String(t.id) !== String(teacherId));
            updateActiveBadge();

            // Refresh hidden count from server
            await loadHiddenCount();

            // Re-render active tab
            filterTeachers();
        } else {
            showToast(`❌ ${result.error || 'Failed to hide teacher.'}`, 'error');
        }
    } catch (err) {
        console.error("Hide Error:", err);
        showToast(`❌ System error: ${err.message}`, 'error');
    }
}

async function unhideTeacher(id, name, button) {
    if (!id || id === 'undefined') { alert('Invalid teacher ID'); return; }

    const confirmed = confirm(`Restore "${name}" to the active teacher list?\n\nThey will be included in future schedule generations.`);
    if (!confirmed) return;

    try {
        const token = localStorage.getItem('token');
        if (!token) { alert('Please login first'); return; }

        const response = await fetch(`/api/admin/teachers/${id}/unhide`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json().catch(() => ({}));

        if (response.ok && result.success) {
            showToast(`👁️ ${name} restored to active list!`, 'success');

            // Remove from hidden cache
            hiddenTeachersCache = hiddenTeachersCache.filter(t => String(t.id) !== String(id));
            updateHiddenBadge();

            // Refresh active count from server
            await loadHiddenCount();

            // Re-render hidden tab
            filterTeachers();
        } else {
            showToast(`❌ ${result.error || 'Failed to unhide teacher.'}`, 'error');
        }
    } catch (err) {
        console.error("Unhide Error:", err);
        showToast(`❌ System error: ${err.message}`, 'error');
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
        toast.style.position = 'fixed';
        toast.style.bottom = '30px';
        toast.style.right = '30px';
        toast.style.padding = '12px 24px';
        toast.style.borderRadius = '8px';
        toast.style.fontWeight = '500';
        toast.style.fontSize = '0.9rem';
        toast.style.zIndex = '9999';
        toast.style.boxShadow = '0 6px 24px rgba(0,0,0,0.5)';
        toast.style.transition = 'all 0.3s cubic-bezier(0.68, -0.55, 0.27, 1.55)';
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
    }, 3000);
}

// ═══════════════════════════════════════════════════════════════
// LOGOUT / KEYS
// ═══════════════════════════════════════════════════════════════
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/shared/login.html';
}

document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        loadTeacherData();
        loadHiddenCount();
    }
    if (e.key === 'Escape') closeHideModal();
});
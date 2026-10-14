// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
let sectionsCache = [];
let roomsCache = [];
let pendingDeleteSectionId = null;
let pendingDeleteSectionName = '';

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showToastMessage(message, type = 'success') {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.className = 'toast-popup';
        document.body.appendChild(toast);
    }

    const icon = type === 'success'
        ? '<i class="fa-solid fa-circle-check"></i>'
        : '<i class="fa-solid fa-circle-exclamation"></i>';

    toast.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
    toast.classList.toggle('error', type === 'error');
    toast.classList.add('show');

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

// ═══════════════════════════════════════════════════════════════
// ROOM CONFLICT CHECK (CLIENT-SIDE)
// ═══════════════════════════════════════════════════════════════
/**
 * Chine-check kung ang room ay naka-assign na sa ibang section
 * sa parehong grade level.
 * 
 * @param {string|number} roomId - Ang room ID na gustong i-assign
 * @param {string} gradeLevel - Ang grade level ng bagong section
 * @param {string|null} excludeSectionId - Kung nag-e-edit, i-exclude ang sarili
 * @returns {object|null} - Ang conflict object kung meron, o null kung wala
 */
function findRoomConflict(roomId, gradeLevel, excludeSectionId = null) {
    if (!roomId || !gradeLevel) return null;

    const normalizedGrade = String(gradeLevel).toLowerCase().trim();

    return sectionsCache.find(section => {
        const sectionRoomId = section.roomId || section.room_id;
        const sectionGrade = String(section.gradeLevel || section.grade_level || section.grade || '')
            .toLowerCase()
            .trim();
        const sectionId = String(section.id || section._id || section.name);

        // Skip kung ito ang sariling section (for edit mode)
        if (excludeSectionId && sectionId === String(excludeSectionId)) return false;

        return String(sectionRoomId) === String(roomId) && sectionGrade === normalizedGrade;
    }) || null;
}

/**
 * Kumuha ng listahan ng room IDs na naka-assign na sa isang grade level.
 */
function getTakenRoomIdsForGrade(gradeLevel, excludeSectionId = null) {
    if (!gradeLevel) return new Set();

    const normalizedGrade = String(gradeLevel).toLowerCase().trim();
    const takenIds = new Set();

    sectionsCache.forEach(section => {
        const sectionRoomId = section.roomId || section.room_id;
        const sectionGrade = String(section.gradeLevel || section.grade_level || section.grade || '')
            .toLowerCase()
            .trim();
        const sectionId = String(section.id || section._id || section.name);

        if (excludeSectionId && sectionId === String(excludeSectionId)) return;

        if (sectionGrade === normalizedGrade && sectionRoomId) {
            takenIds.add(String(sectionRoomId));
        }
    });

    return takenIds;
}

// ═══════════════════════════════════════════════════════════════
// ROOMS DROPDOWN (WITH FILTERING)
// ═══════════════════════════════════════════════════════════════
async function fetchAndPopulateRooms() {
    const roomSelect = document.getElementById('assignedRoom');
    if (!roomSelect) return;

    try {
        const response = await fetch('/api/admin/rooms', {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store'
        });

        if (response.status === 401 || response.status === 403) {
            window.location.href = '/auth/login.html';
            return;
        }

        if (!response.ok) throw new Error('Failed to fetch rooms.');

        const roomsData = await response.json();
        const rooms = Array.isArray(roomsData) ? roomsData : (roomsData.rooms || []);
        roomsCache = rooms;

        // I-render ang rooms base sa kasalukuyang grade level
        const gradeField = document.getElementById('sectionGrade');
        const currentGrade = gradeField ? gradeField.value : '';
        renderRoomDropdown(currentGrade);

    } catch (error) {
        console.error('Error fetching rooms:', error);
        roomSelect.innerHTML = '<option value="">Failed to load rooms</option>';
    }
}

/**
 * I-render ang room dropdown, kasama ang pag-disable ng taken rooms.
 */
function renderRoomDropdown(gradeLevel) {
    const roomSelect = document.getElementById('assignedRoom');
    if (!roomSelect) return;

    const previousValue = roomSelect.value;

    roomSelect.innerHTML = '<option value="">Select Room...</option>';

    if (roomsCache.length === 0) {
        roomSelect.innerHTML += '<option value="" disabled>No rooms yet — add one first.</option>';
        return;
    }

    // Kunin ang mga taken room IDs sa grade level na ito
    const takenRoomIds = getTakenRoomIdsForGrade(gradeLevel);

    roomsCache.forEach(room => {
        const roomName = room.name || room.roomName || 'Unnamed Room';
        const roomId = room.id || room._id || roomName;
        const isTaken = takenRoomIds.has(String(roomId));

        const option = document.createElement('option');
        option.value = roomId;

        if (isTaken) {
            option.textContent = `${roomName} — ❌ Taken in ${gradeLevel}`;
            option.disabled = true;
            option.style.color = '#94a3b8';
            option.style.fontStyle = 'italic';
        } else {
            option.textContent = roomName;
        }

        roomSelect.appendChild(option);
    });

    // Ibalik ang dating value kung valid pa
    if (previousValue && !takenRoomIds.has(String(previousValue))) {
        roomSelect.value = previousValue;
    }
}

function getRoomNameById(roomId) {
    if (!roomId) return null;
    const match = roomsCache.find(r => String(r.id || r._id) === String(roomId));
    if (!match) return null;
    return match.name || match.roomName || 'Unnamed Room';
}

// ═══════════════════════════════════════════════════════════════
// RENDER SECTIONS LIST
// ═══════════════════════════════════════════════════════════════
async function renderSectionsUIList() {
    const listContainer = document.getElementById('sections-list-container');
    if (!listContainer) return;

    listContainer.innerHTML = `
        <div class="rooms-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading sections...
        </div>
    `;

    try {
        const response = await fetch('/api/admin/sections', {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store'
        });

        if (response.status === 401 || response.status === 403) {
            window.location.href = '/auth/login.html';
            return;
        }

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const sections = Array.isArray(data) ? data : (data.sections || []);
        sectionsCache = sections;

        // I-refresh ang room dropdown pagkatapos mag-load ng sections
        const gradeField = document.getElementById('sectionGrade');
        const currentGrade = gradeField ? gradeField.value : '';
        renderRoomDropdown(currentGrade);

        if (sections.length === 0) {
            listContainer.innerHTML = `
                <div class="rooms-empty">
                    <i class="fa-solid fa-folder-open"></i>
                    <p>No academic sections configured yet.</p>
                    <small>Add your first section on the left.</small>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = sections.map((section) => {
            const name = section.name || section.sectionName || 'Unnamed Section';
            const grade = section.gradeLevel || section.grade_level || section.grade || 'No Grade';
            const roomId = section.roomId || section.room_id;
            const roomNameFromApi = section.roomName || section.room_name;
            const roomName = roomNameFromApi || getRoomNameById(roomId) || 'No Room Assigned';
            const secId = section.id || section._id || name;

            return `
                <div class="section-card-item">
                    <div class="section-details-meta">
                        <div class="section-title-text">
                            <i class="fa-solid fa-folder"></i>
                            ${escapeHtml(name)}
                        </div>
                        <span class="section-grade-badge">
                            <i class="fa-solid fa-tag"></i>
                            ${escapeHtml(grade)}
                        </span>
                        <span class="section-room-badge">
                            <i class="fa-solid fa-door-open"></i>
                            ${escapeHtml(roomName)}
                        </span>
                    </div>
                    <button type="button"
                            class="btn-delete-row-action"
                            title="Remove section"
                            onclick="openDeleteSectionModal('${encodeURIComponent(secId)}', '${encodeURIComponent(name)}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error rendering sections:', error);
        listContainer.innerHTML = `
            <div class="rooms-error">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>Failed to load sections.</p>
                <small>${escapeHtml(error.message)}</small>
            </div>
        `;
    }
}

// ═══════════════════════════════════════════════════════════════
// ADD SECTION (WITH ROOM CONFLICT VALIDATION)
// ═══════════════════════════════════════════════════════════════
async function addNewSection(event) {
    if (event) event.preventDefault();

    const nameField = document.getElementById('sectionName');
    const gradeField = document.getElementById('sectionGrade');
    const roomField = document.getElementById('assignedRoom');

    const nameValue = nameField ? nameField.value.trim() : '';
    const gradeValue = gradeField ? gradeField.value : '';
    const roomValue = roomField ? roomField.value : '';

    // ═══ Basic validation ═══
    if (!nameValue) {
        showToastMessage('Please provide a Section Name.', 'error');
        nameField?.focus();
        return;
    }

    if (!gradeValue) {
        showToastMessage('Please select a Grade Level.', 'error');
        gradeField?.focus();
        return;
    }

    // ═══ Client-side room conflict check ═══
    if (roomValue) {
        const conflict = findRoomConflict(roomValue, gradeValue);

        if (conflict) {
            const conflictRoomName = conflict.roomName 
                || conflict.room_name 
                || getRoomNameById(conflict.roomId || conflict.room_id) 
                || 'Selected room';
            const conflictSectionName = conflict.name 
                || conflict.sectionName 
                || 'another section';
            const conflictGrade = conflict.gradeLevel 
                || conflict.grade_level 
                || conflict.grade 
                || gradeValue;

            showToastMessage(
                `❌ Room Conflict! "${conflictRoomName}" is already assigned to "${conflictSectionName}" in ${conflictGrade}.`,
                'error'
            );
            roomField?.focus();
            return;
        }
    }

    const addBtn = document.getElementById('add-section-btn');
    if (addBtn) addBtn.disabled = true;

    try {
        const response = await fetch('/api/admin/sections', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sectionName: nameValue,
                gradeLevel: gradeValue,
                assignedRoom: roomValue || null
            })
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            // ═══ Server-side room conflict ═══
            if (result.code === 'ROOM_CONFLICT') {
                showToastMessage(`❌ Room Conflict! ${result.error}`, 'error');
                return;
            }
            throw new Error(result.error || 'Failed to save section.');
        }

        if (nameField) nameField.value = '';
        if (roomField) roomField.value = '';
        nameField?.focus();

        showToastMessage('Section registered successfully.', 'success');

        // ═══ I-refresh ang sections list at rooms dropdown ═══
        await renderSectionsUIList();

    } catch (error) {
        console.error('Error adding section:', error);
        showToastMessage(error.message || 'Could not save the section.', 'error');
    } finally {
        if (addBtn) addBtn.disabled = false;
    }
}

// ═══════════════════════════════════════════════════════════════
// DELETE MODAL
// ═══════════════════════════════════════════════════════════════
function injectDeleteSectionModal() {
    if (document.getElementById('delete-section-modal')) return;

    const modalHTML = `
        <div id="delete-section-modal" class="section-modal-overlay">
            <div class="section-modal-box">
                <div class="section-modal-icon">
                    <i class="fa-solid fa-trash"></i>
                </div>
                <h2 class="section-modal-title">Remove this section?</h2>
                <p class="section-modal-text">
                    <strong id="delete-section-name"></strong> will be permanently removed from the sections list.
                </p>
                <ul class="section-modal-notes">
                    <li><i class="fa-solid fa-triangle-exclamation"></i> Any schedule slots linked to this section will become unassigned.</li>
                    <li><i class="fa-solid fa-triangle-exclamation"></i> This action cannot be undone.</li>
                </ul>
                <div class="section-modal-actions">
                    <button type="button" class="section-modal-cancel" onclick="closeDeleteSectionModal()">Cancel</button>
                    <button type="button" class="section-modal-confirm" onclick="confirmDeleteSection()">Yes, Remove Section</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function openDeleteSectionModal(encodedId, encodedName) {
    pendingDeleteSectionId = decodeURIComponent(encodedId);
    pendingDeleteSectionName = decodeURIComponent(encodedName);

    const nameEl = document.getElementById('delete-section-name');
    if (nameEl) nameEl.textContent = pendingDeleteSectionName;

    document.getElementById('delete-section-modal')?.classList.add('active');
}

function closeDeleteSectionModal() {
    pendingDeleteSectionId = null;
    pendingDeleteSectionName = '';
    document.getElementById('delete-section-modal')?.classList.remove('active');
}

async function confirmDeleteSection() {
    if (!pendingDeleteSectionId) return;
    const sectionId = pendingDeleteSectionId;
    const sectionName = pendingDeleteSectionName;
    closeDeleteSectionModal();

    try {
        const response = await fetch(`/api/admin/sections/${encodeURIComponent(sectionId)}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(result.error || 'Failed to delete section.');
        }

        showToastMessage(`"${sectionName}" removed.`, 'success');
        await renderSectionsUIList();

    } catch (error) {
        console.error('Error deleting section:', error);
        showToastMessage(error.message || 'Could not remove the section.', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    injectDeleteSectionModal();

    // ═══ I-load muna ang rooms at sections bago i-render ang dropdown ═══
    await fetchAndPopulateRooms();
    await renderSectionsUIList();

    // ═══ I-set up ang add button ═══
    const addBtn = document.getElementById('add-section-btn');
    if (addBtn) {
        addBtn.addEventListener('click', addNewSection);
    }

    // ═══ I-set up ang grade level change listener ═══
    const gradeField = document.getElementById('sectionGrade');
    if (gradeField) {
        gradeField.addEventListener('change', (e) => {
            // I-refresh ang room dropdown base sa bagong grade level
            renderRoomDropdown(e.target.value);
        });
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDeleteSectionModal();
});
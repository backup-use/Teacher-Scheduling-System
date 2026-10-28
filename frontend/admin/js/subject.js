// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
let selectedSubjects = new Map();
let openFolders = new Set();  // all folders closed by default
let pendingDeleteSubjectName = null;
let subjectsCache = [];

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
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 2800);
}

// Helper para gawing Title Case, pero papanatilihin ang acronyms (TLE, MAPEH, ESP)
function toTitleCase(str) {
    if (!str) return '';
    return str
        .split(' ')
        .map(word => {
            if (word.length === 0) return word;
            
            // Kung puro MALAKING letra ang input (tulad ng MAPEH, TLE, SCIENCE)
            if (word === word.toUpperCase()) {
                return word; // Panatilihin as is
            }
            
            // Kung normal na salita, i-capitalize lang ang unang letra
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');
}

// ═══════════════════════════════════════════════════════════════
// FETCH
// ═══════════════════════════════════════════════════════════════
async function fetchActiveSubjects() {
    const container = document.getElementById('subjects-list-container');
    if (!container) return;

    container.innerHTML = `
        <div class="subjects-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading subjects...
        </div>
    `;

    try {
        const response = await fetch('/api/admin/subjects', {
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

        let rawList = [];
        if (Array.isArray(data)) rawList = data;
        else if (data.subjects && Array.isArray(data.subjects)) rawList = data.subjects;
        else rawList = [
            ...(data.junior || []),
            ...(data.grade11 || []),
            ...(data.grade12 || []),
            ...(data.other || [])
        ];

        subjectsCache = rawList;
        renderGradeFolders(container, rawList);

    } catch (err) {
        console.error('Fetch error:', err);
        container.innerHTML = `
            <div class="subjects-error">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>Failed to load subjects.</p>
                <small>${escapeHtml(err.message)}</small>
            </div>
        `;
    }
}

// ═══════════════════════════════════════════════════════════════
// RENDER FOLDERS
// ═══════════════════════════════════════════════════════════════
function renderGradeFolders(container, rawList) {
    if (!container) return;

    const gradeLevels = [
        "Junior High School - Grade 7",
        "Junior High School - Grade 8",
        "Junior High School - Grade 9",
        "Junior High School - Grade 10",
        "Senior High School - Grade 11",
        "Senior High School - Grade 12"
    ];

    const groupedData = {};
    gradeLevels.forEach(gl => groupedData[gl] = []);

    rawList.forEach(sub => {
        const subGrade = String(
            typeof sub === 'object' ? (sub.gradeLevel || sub.grade_level || '') : ''
        ).toLowerCase();

        if (subGrade.includes('12')) groupedData["Senior High School - Grade 12"].push(sub);
        else if (subGrade.includes('11')) groupedData["Senior High School - Grade 11"].push(sub);
        else if (subGrade.includes('10')) groupedData["Junior High School - Grade 10"].push(sub);
        else if (subGrade.includes('9')) groupedData["Junior High School - Grade 9"].push(sub);
        else if (subGrade.includes('8')) groupedData["Junior High School - Grade 8"].push(sub);
        else if (subGrade.includes('7')) groupedData["Junior High School - Grade 7"].push(sub);
        else groupedData["Junior High School - Grade 7"].push(sub);
    });

    container.innerHTML = gradeLevels.map((gradeTitle, idx) => {
        const items = groupedData[gradeTitle] || [];
        const folderId = `folder-grade-${idx + 7}`;
        const isOpen = openFolders.has(folderId);

        const itemsHTML = items.length === 0
            ? `<div class="folder-empty">No subjects registered.</div>`
            : items.map(sub => {
                const subName = typeof sub === 'object'
                    ? (sub.name || sub.subjectName || sub.title || 'Unknown Subject')
                    : sub;
                const gradeLevel = typeof sub === 'object'
                    ? (sub.gradeLevel || sub.grade_level || gradeTitle)
                    : gradeTitle;

                const key = `${subName}::${gradeLevel}`;
                const isChecked = selectedSubjects.has(key);

                return `
                    <div class="subject-row">
                        <label class="subject-row-label">
                            <input type="checkbox"
                                   class="subject-checkbox"
                                   ${isChecked ? 'checked' : ''}
                                   onchange="handleCheckboxChange(event, '${encodeURIComponent(subName)}', '${encodeURIComponent(gradeLevel)}')">
                            <span class="subject-row-name">
                                <i class="fa-solid fa-book"></i>
                                ${escapeHtml(subName)}
                            </span>
                        </label>
                        <button type="button"
                                class="subject-row-delete"
                                title="Delete Subject"
                                onclick="openDeleteSubjectModal('${encodeURIComponent(subName)}', '${encodeURIComponent(gradeLevel)}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                `;
            }).join('');

        return `
            <div class="grade-folder-card">
                <div class="folder-header" onclick="toggleGradeFolder('${folderId}')">
                    <div class="folder-header-left">
                        <span id="${folderId}-icon" class="folder-icon">
                            <i class="fa-solid ${isOpen ? 'fa-folder-open' : 'fa-folder'}"></i>
                        </span>
                        <h4>${escapeHtml(gradeTitle)}</h4>
                    </div>
                    <div class="folder-header-right">
                        <span class="folder-count">
                            ${items.length} Subject${items.length !== 1 ? 's' : ''}
                        </span>
                        <span id="${folderId}-arrow" class="folder-arrow ${isOpen ? 'open' : ''}">
                            <i class="fa-solid fa-chevron-down"></i>
                        </span>
                    </div>
                </div>
                <div id="${folderId}" class="folder-body" style="display: ${isOpen ? 'block' : 'none'};">
                    ${itemsHTML}
                </div>
            </div>
        `;
    }).join('');
}

// ═══════════════════════════════════════════════════════════════
// FOLDER TOGGLE
// ═══════════════════════════════════════════════════════════════
function toggleGradeFolder(folderId) {
    const body = document.getElementById(folderId);
    const arrow = document.getElementById(`${folderId}-arrow`);
    const icon = document.getElementById(`${folderId}-icon`);
    if (!body) return;

    const isOpening = body.style.display === 'none';

    if (isOpening) {
        body.style.display = 'block';
        openFolders.add(folderId);
        if (arrow) arrow.classList.add('open');
        if (icon) icon.innerHTML = '<i class="fa-solid fa-folder-open"></i>';
    } else {
        body.style.display = 'none';
        openFolders.delete(folderId);
        if (arrow) arrow.classList.remove('open');
        if (icon) icon.innerHTML = '<i class="fa-solid fa-folder"></i>';
    }
}

// ═══════════════════════════════════════════════════════════════
// CHECKBOX HANDLING
// ═══════════════════════════════════════════════════════════════
function handleCheckboxChange(e, encodedName, encodedGrade) {
    const subName = decodeURIComponent(encodedName);
    const gradeLevel = decodeURIComponent(encodedGrade);
    const key = `${subName}::${gradeLevel}`;

    if (e.target.checked) {
        selectedSubjects.set(key, { name: subName, gradeLevel });
    } else {
        selectedSubjects.delete(key);
    }
    updateCount();
}

function toggleSelectAll(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.subject-checkbox');
    checkboxes.forEach(cb => {
        if (cb.checked !== masterCheckbox.checked) {
            cb.checked = masterCheckbox.checked;
            cb.dispatchEvent(new Event('change'));
        }
    });
}

function updateCount() {
    const countSpan = document.getElementById('selected-count');
    const deleteBtn = document.getElementById('btn-delete-checked');

    if (countSpan) countSpan.textContent = selectedSubjects.size;
    if (!deleteBtn) return;

    deleteBtn.disabled = selectedSubjects.size === 0;
}

// ═══════════════════════════════════════════════════════════════
// BATCH DELETE
// ═══════════════════════════════════════════════════════════════
async function executeBatchDelete() {
    if (selectedSubjects.size === 0) return;

    const count = selectedSubjects.size;
    if (!confirm(`Delete ${count} selected subject(s)?\n\nThis cannot be undone.`)) return;

    const itemsToDelete = Array.from(selectedSubjects.values());

    try {
        const response = await fetch('/api/admin/subjects/batch-delete', {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: itemsToDelete,
                subjectNames: itemsToDelete.map(i => i.name)
            })
        });

        if (response.ok) {
            showToastMessage(`Deleted ${count} subject(s).`, 'success');
            resetSelection();
            await fetchActiveSubjects();
            return;
        }

        await fallbackDeleteItems(itemsToDelete);

    } catch (err) {
        console.error('Batch delete error, running fallback:', err);
        await fallbackDeleteItems(itemsToDelete);
    }
}

async function fallbackDeleteItems(items) {
    let deletedCount = 0;

    for (const item of items) {
        try {
            const res = await fetch(
                `/api/admin/subjects/${encodeURIComponent(item.name)}`,
                { method: 'DELETE', credentials: 'include' }
            );
            if (res.ok) deletedCount++;
        } catch (err) {
            console.error('Item delete failed:', err);
        }
    }

    resetSelection();
    showToastMessage(`Deleted ${deletedCount} of ${items.length} subject(s).`, deletedCount === items.length ? 'success' : 'error');
    await fetchActiveSubjects();
}

function resetSelection() {
    selectedSubjects.clear();
    const selectAllCb = document.getElementById('select-all-checkbox');
    if (selectAllCb) selectAllCb.checked = false;
    updateCount();
}

// ═══════════════════════════════════════════════════════════════
// SINGLE DELETE MODAL
// ═══════════════════════════════════════════════════════════════
function injectDeleteSubjectModal() {
    if (document.getElementById('delete-subject-modal')) return;

    const modalHTML = `
        <div id="delete-subject-modal" class="subject-modal-overlay">
            <div class="subject-modal-box">
                <div class="subject-modal-icon">
                    <i class="fa-solid fa-trash"></i>
                </div>
                <h2 class="subject-modal-title">Delete this subject?</h2>
                <p class="subject-modal-text">
                    <strong id="delete-subject-name"></strong> will be removed from the master catalog.
                </p>
                <ul class="subject-modal-notes">
                    <li><i class="fa-solid fa-triangle-exclamation"></i> Existing schedule slots that use this subject will keep their data.</li>
                    <li><i class="fa-solid fa-triangle-exclamation"></i> You won't be able to auto-generate new slots for it.</li>
                </ul>
                <div class="subject-modal-actions">
                    <button type="button" class="subject-modal-cancel" onclick="closeDeleteSubjectModal()">Cancel</button>
                    <button type="button" class="subject-modal-confirm" onclick="confirmDeleteSubject()">Yes, Delete</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function openDeleteSubjectModal(encodedName, encodedGrade) {
    pendingDeleteSubjectName = {
        name: decodeURIComponent(encodedName),
        gradeLevel: decodeURIComponent(encodedGrade)
    };

    const nameEl = document.getElementById('delete-subject-name');
    if (nameEl) nameEl.textContent = pendingDeleteSubjectName.name;

    document.getElementById('delete-subject-modal')?.classList.add('active');
}

function closeDeleteSubjectModal() {
    pendingDeleteSubjectName = null;
    document.getElementById('delete-subject-modal')?.classList.remove('active');
}

async function confirmDeleteSubject() {
    // ✅ FIX: I-save muna sa local variable bago i-close ang modal
    if (!pendingDeleteSubjectName) return;
    
    const subName = pendingDeleteSubjectName.name;
    const gradeLevel = pendingDeleteSubjectName.gradeLevel;
    
    closeDeleteSubjectModal();

    try {
        const response = await fetch(
            `/api/admin/subjects/${encodeURIComponent(subName)}`,
            { method: 'DELETE', credentials: 'include' }
        );

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(result.error || 'Failed to delete subject.');
        }

        showToastMessage(`"${subName}" deleted.`, 'success');
        
        // ✅ FIX: Gamitin ang naka-save na gradeLevel variable
        if (gradeLevel) {
            selectedSubjects.delete(`${subName}::${gradeLevel}`);
        }
        
        updateCount();
        await fetchActiveSubjects();

    } catch (err) {
        console.error('Delete error:', err);
        showToastMessage(err.message || 'Could not delete subject.', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════
// ADD SUBJECTS
// ═══════════════════════════════════════════════════════════════
async function addNewSubject(event) {
    if (event) event.preventDefault();

    const titleInput = document.getElementById('subjectTitle');
    const gradeSelect = document.getElementById('gradeLevel');

    const rawTitle = titleInput ? titleInput.value.trim() : '';
    const gradeLevel = gradeSelect ? gradeSelect.value : 'Junior High School - Grade 7';

    if (!rawTitle) {
        showToastMessage('Please enter at least one subject title.', 'error');
        titleInput?.focus();
        return;
    }

    // ✅ HATIIN ANG INPUT SA PAMAMAGITAN NG KUWIT AT GAWING TITLE CASE
    const subjectsArray = rawTitle
        .split(',')
        .map(sub => toTitleCase(sub.trim())) 
        .filter(sub => sub.length > 0);

    if (subjectsArray.length === 0) {
        showToastMessage('Please enter a valid subject title.', 'error');
        return;
    }

    const addBtn = document.getElementById('add-subject-btn');
    if (addBtn) addBtn.disabled = true;

    let successCount = 0;
    let failCount = 0;
    let errorMessages = [];

    try {
        // ✅ I-LOOP ANG BAWAT SUBJECT AT I-SAVE SA DATABASE
        for (const subjectName of subjectsArray) {
            try {
                const response = await fetch('/api/admin/subjects', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        name: subjectName, 
                        subjectName: subjectName, 
                        gradeLevel 
                    })
                });

                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    console.warn(`Failed to add "${subjectName}":`, data.error);
                    failCount++;
                    if (data.error) errorMessages.push(`${subjectName}: ${data.error}`);
                } else {
                    successCount++;
                }
            } catch (err) {
                console.error(`Error adding "${subjectName}":`, err);
                failCount++;
            }
        }

        if (titleInput) titleInput.value = '';

        if (successCount > 0 && failCount === 0) {
            showToastMessage(`${successCount} subject(s) added successfully.`, 'success');
        } else if (successCount > 0 && failCount > 0) {
            showToastMessage(`${successCount} added, ${failCount} failed.`, 'error');
            console.warn('Some subjects failed:', errorMessages);
        } else {
            showToastMessage(`Failed to add subjects. ${errorMessages.join(', ')}`, 'error');
        }

        await fetchActiveSubjects();

    } catch (error) {
        console.error('Add error:', error);
        showToastMessage(error.message || 'Failed to add subjects.', 'error');
    } finally {
        if (addBtn) addBtn.disabled = false;
    }
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    injectDeleteSubjectModal();
    fetchActiveSubjects();

    const addBtn = document.getElementById('add-subject-btn');
    if (addBtn) {
        addBtn.addEventListener('click', addNewSubject);
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDeleteSubjectModal();
});
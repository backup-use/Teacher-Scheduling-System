// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
let sectionsCache = [];
let openFolders = new Set();  // all folders closed by default
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
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ═══════════════════════════════════════════════════════════════
// RENDER SECTIONS LIST (GROUPED BY GRADE)
// ═══════════════════════════════════════════════════════════════
async function renderSectionsUIList() {
    const listContainer = document.getElementById('sections-folders-container');
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

        // UPDATE COUNT
        const countEl = document.getElementById('sections-count');
        if (countEl) {
            countEl.textContent = `${sections.length} Section${sections.length !== 1 ? 's' : ''}`;
        }

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

        // I-GROUP BY GRADE LEVEL
        const gradeOrder = ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];
        const groupedData = {};
        gradeOrder.forEach(gl => groupedData[gl] = []);

        sections.forEach(section => {
            const gradeRaw = String(section.gradeLevel || section.grade_level || section.grade || '');
            let matchedGrade = gradeOrder.find(g => gradeRaw.toLowerCase().includes(g.toLowerCase().replace('grade ', '')));
            if (!matchedGrade) matchedGrade = 'Grade 7';
            groupedData[matchedGrade].push(section);
        });

        // I-SORT ALPHABETICALLY DENTRO NG BAWAT GRADE
        gradeOrder.forEach(gl => {
            groupedData[gl].sort((a, b) => {
                const nameA = (a.name || a.sectionName || '').toLowerCase();
                const nameB = (b.name || b.sectionName || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });
        });

        // RENDER FOLDERS (Gamit ang tamang classes)
        listContainer.innerHTML = gradeOrder.map((gradeTitle, idx) => {
            const items = groupedData[gradeTitle] || [];
            const folderId = `folder-${idx}`;
            const isOpen = openFolders.has(folderId);

            const itemsHTML = items.length === 0
                ? `<div style="padding: 15px; text-align: center; color: #94a3b8; font-size: 0.85rem;">No sections in this grade.</div>`
                : items.map(section => {
                    const name = section.name || section.sectionName || 'Unnamed Section';
                    const secId = section.id || section._id || name;

                    return `
                        <div class="subject-row">
                            <div class="subject-row-label">
                                <span class="subject-row-name">
                                    <i class="fa-solid fa-folder"></i>
                                    ${escapeHtml(name)}
                                </span>
                            </div>
                            <button type="button"
                                    class="subject-row-delete"
                                    title="Remove section"
                                    onclick="openDeleteSectionModal('${encodeURIComponent(secId)}', '${encodeURIComponent(name)}')">
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
                                ${items.length} Section${items.length !== 1 ? 's' : ''}
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
// ADD SECTION (BATCH SUPPORT)
// ═══════════════════════════════════════════════════════════════
async function addNewSection(event) {
    if (event) event.preventDefault();

    const nameField = document.getElementById('sectionName');
    const gradeField = document.getElementById('sectionGrade');

    const rawInput = nameField ? nameField.value.trim() : '';
    const gradeValue = gradeField ? gradeField.value : '';

    if (!rawInput) {
        showToastMessage('Please provide a Section Name.', 'error');
        nameField?.focus();
        return;
    }

    if (!gradeValue) {
        showToastMessage('Please select a Grade Level.', 'error');
        gradeField?.focus();
        return;
    }

    // ✅ Hatiin ang input base sa kuwit
    const sectionNamesArray = rawInput
        .split(',')
        .map(name => name.trim())
        .filter(name => name.length > 0);

    if (sectionNamesArray.length === 0) {
        showToastMessage('Please provide a valid Section Name.', 'error');
        return;
    }

    const addBtn = document.getElementById('add-section-btn');
    if (addBtn) addBtn.disabled = true;

    let successCount = 0;
    let failCount = 0;

    try {
        for (const sectionName of sectionNamesArray) {
            try {
                const response = await fetch('/api/admin/sections', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sectionName: sectionName,
                        gradeLevel: gradeValue,
                        assignedRoom: null
                    })
                });

                const result = await response.json().catch(() => ({}));

                if (!response.ok) {
                    console.warn(`Failed to save "${sectionName}":`, result.error);
                    failCount++;
                } else {
                    successCount++;
                }
            } catch (err) {
                console.error(`Error saving "${sectionName}":`, err);
                failCount++;
            }
        }

        if (nameField) nameField.value = '';
        nameField?.focus();

        if (successCount > 0 && failCount === 0) {
            showToastMessage(`${successCount} section(s) added successfully!`, 'success');
        } else if (successCount > 0 && failCount > 0) {
            showToastMessage(`${successCount} added, ${failCount} failed.`, 'error');
        } else {
            showToastMessage(`Failed to add section(s).`, 'error');
        }

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
document.addEventListener('DOMContentLoaded', () => {
    injectDeleteSectionModal();
    renderSectionsUIList();

    const addBtn = document.getElementById('add-section-btn');
    if (addBtn) {
        addBtn.addEventListener('click', addNewSection);
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDeleteSectionModal();
});
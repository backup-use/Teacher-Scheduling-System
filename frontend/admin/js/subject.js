let selectedSubjects = new Map();

document.addEventListener('DOMContentLoaded', () => {
    ensureDOMContainersExist();
    fetchActiveSubjects();

    const addBtn = document.getElementById('add-subject-btn') || document.querySelector('.btn-add-subject') || document.querySelector('.btn-submit');
    if (addBtn) {
        addBtn.addEventListener('click', addNewSubject);
    }
});

/**
 * Autonomously inject controls and containers into the right panel if missing in HTML
 */
function ensureDOMContainersExist() {
    let listJunior = document.getElementById('list-junior');
    
    // Hanapin ang Right Panel Header under "Active Institution Offerings"
    const headings = Array.from(document.querySelectorAll('*'));
    const offeringLabel = headings.find(el => el.textContent && el.textContent.trim() === 'Active Institution Offerings');
    
    let targetBox = null;
    let headerParent = null;

    if (offeringLabel) {
        headerParent = offeringLabel.parentElement;
        let parent = offeringLabel.parentElement;
        while (parent && !targetBox) {
            targetBox = parent.querySelector('.subject-display-box') || parent.querySelector('div[style*="background"]');
            if (!targetBox) parent = parent.parentElement;
        }
    }

    // Inject Toolbar Control (Delete All Checked Button & Select All Checkbox)
    if (headerParent && !document.getElementById('batch-delete-bar')) {
        const toolbarHtml = `
            <div id="batch-delete-bar" style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; margin-bottom: 10px; background: rgba(255, 255, 255, 0.04); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.08);">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="select-all-checkbox" onchange="toggleSelectAll(this)" style="width: 16px; height: 16px; cursor: pointer; accent-color: #ff5f5f;">
                    <label for="select-all-checkbox" style="color: #cbd5e1; font-size: 0.8rem; cursor: pointer; font-weight: 600; user-select: none;">Select All Subjects</label>
                </div>
                <button id="btn-delete-checked" onclick="executeBatchDelete()" style="background: #ff5f5f; color: #ffffff; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; font-size: 0.78rem; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: 0.2s;">
                    🗑️ DELETE CHECKED (<span id="selected-count">0</span>)
                </button>
            </div>
        `;
        offeringLabel.insertAdjacentHTML('afterend', toolbarHtml);
    }

    if (listJunior) return; // Containers exist

    if (!targetBox) {
        targetBox = document.querySelector('.subject-panel-col:nth-child(2)') || document.querySelector('.subject-workspace-grid > div:last-child');
    }

    if (targetBox) {
        targetBox.style.minHeight = "200px";
        targetBox.style.maxHeight = "450px";
        targetBox.style.overflowY = "auto";
        targetBox.style.padding = "12px";
        targetBox.innerHTML = `
            <div style="margin-bottom: 15px;">
                <h4 style="color: #00d2ff; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; margin-bottom: 6px;">Junior High School (Grades 7-10)</h4>
                <div id="list-junior"></div>
            </div>
            <div style="margin-bottom: 15px;">
                <h4 style="color: #00d2ff; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; margin-bottom: 6px;">Senior High - Grade 11</h4>
                <div id="list-grade11"></div>
            </div>
            <div>
                <h4 style="color: #00d2ff; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; margin-bottom: 6px;">Senior High - Grade 12</h4>
                <div id="list-grade12"></div>
            </div>
        `;
    }
}

/**
 * Fetch and display active subjects partitioned by Grade Level
 */
async function fetchActiveSubjects() {
    const listJunior = document.getElementById('list-junior');
    const listGrade11 = document.getElementById('list-grade11');
    const listGrade12 = document.getElementById('list-grade12');

    try {
        const token = localStorage.getItem('token') || localStorage.getItem('jwt') || '';
        const response = await fetch('/api/admin/subjects', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error(`Status ${response.status}`);

        const data = await response.json();

        let rawList = [];
        if (Array.isArray(data)) {
            rawList = data;
        } else if (data.subjects && Array.isArray(data.subjects)) {
            rawList = data.subjects;
        } else {
            rawList = [
                ...(data.junior || []),
                ...(data.grade11 || []),
                ...(data.grade12 || []),
                ...(data.other || [])
            ];
        }

        const junior = rawList.filter(s => {
            const lvl = String(typeof s === 'object' ? (s.gradeLevel || s.grade_level || '') : '').toLowerCase();
            return lvl.includes('junior') || lvl.includes('7') || lvl.includes('8') || lvl.includes('9') || lvl.includes('10') || (!lvl.includes('11') && !lvl.includes('12'));
        });

        const g11 = rawList.filter(s => {
            const lvl = String(typeof s === 'object' ? (s.gradeLevel || s.grade_level || '') : '').toLowerCase();
            return lvl.includes('11');
        });

        const g12 = rawList.filter(s => {
            const lvl = String(typeof s === 'object' ? (s.gradeLevel || s.grade_level || '') : '').toLowerCase();
            return lvl.includes('12');
        });

        renderPartition(listJunior, junior);
        renderPartition(listGrade11, g11);
        renderPartition(listGrade12, g12);

    } catch (err) {
        console.error("Fetch Error:", err);
        if (listJunior) listJunior.innerHTML = '<div style="color: #ff5f5f; font-size: 0.8rem;">Failed to load subjects.</div>';
    }
}

/**
 * Render items with individual checkboxes and delete buttons
 */
function renderPartition(container, items) {
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = '<div style="color: #64748b; font-size: 0.8rem; font-style: italic; padding: 4px 0;">No subjects registered.</div>';
        return;
    }

    container.innerHTML = items.map(sub => {
        const subName = typeof sub === 'object' ? (sub.name || sub.subjectName || sub.title || 'Unknown Subject') : sub;
        const gradeLevel = typeof sub === 'object' ? (sub.gradeLevel || sub.grade_level || '') : '';
        const gradeTag = gradeLevel ? `<span style="font-size: 0.7rem; background: rgba(0,210,255,0.15); color: #00d2ff; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">${gradeLevel}</span>` : '';
        
        const key = `${subName}::${gradeLevel}`;
        const isChecked = selectedSubjects.has(key);

        return `
            <div class="subject-row" style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 8px 12px; margin-bottom: 6px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" class="subject-checkbox" ${isChecked ? 'checked' : ''} onchange="handleCheckboxChange(event, '${encodeURIComponent(subName)}', '${encodeURIComponent(gradeLevel)}')" style="width: 16px; height: 16px; cursor: pointer; accent-color: #ff5f5f;">
                    <span style="font-weight: 500; color: #fff; font-size: 0.85rem;">📚 ${subName} ${gradeTag}</span>
                </div>
                <button onclick="deleteSingleSubject('${encodeURIComponent(subName)}', '${encodeURIComponent(gradeLevel)}')" title="Delete Subject" style="background: transparent; border: none; cursor: pointer; font-size: 0.9rem;">🗑️</button>
            </div>
        `;
    }).join('');
}

/**
 * Handle individual Checkbox clicks
 */
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

/**
 * Toggle Select All / Unselect All
 */
function toggleSelectAll(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.subject-checkbox');
    checkboxes.forEach(cb => {
        if (cb.checked !== masterCheckbox.checked) {
            cb.checked = masterCheckbox.checked;
            cb.dispatchEvent(new Event('change'));
        }
    });
}

/**
 * Update Selected Counter
 */
function updateCount() {
    const countSpan = document.getElementById('selected-count');
    if (countSpan) countSpan.innerText = selectedSubjects.size;
}

/**
 * Execute Batch Delete on Checked Items
 */
async function executeBatchDelete() {
    if (selectedSubjects.size === 0) {
        alert("Please select at least one subject to delete.");
        return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedSubjects.size} selected subject(s)?`)) {
        return;
    }

    const itemsToDelete = Array.from(selectedSubjects.values());
    const token = localStorage.getItem('token') || localStorage.getItem('jwt') || '';

    try {
        const response = await fetch('/api/admin/subjects/batch-delete', {
            method: 'DELETE',
            headers: {
                'Authorization': token ? `Bearer ${token}` : '',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ items: itemsToDelete, subjectNames: itemsToDelete.map(i => i.name) })
        });

        if (response.ok) {
            showToastMessage(`Successfully deleted ${selectedSubjects.size} subject(s)!`, 'success');
            resetSelection();
            fetchActiveSubjects();
        } else {
            await fallbackDeleteItems(itemsToDelete);
        }
    } catch (err) {
        console.error("Batch delete error, running fallback:", err);
        await fallbackDeleteItems(itemsToDelete);
    }
}

/**
 * Fallback: Delete item-by-item if batch endpoint isn't supported by backend
 */
async function fallbackDeleteItems(items) {
    const token = localStorage.getItem('token') || localStorage.getItem('jwt') || '';
    let deletedCount = 0;

    for (const item of items) {
        try {
            const res = await fetch(`/api/admin/subjects/${encodeURIComponent(item.name)}`, {
                method: 'DELETE',
                headers: { 'Authorization': token ? `Bearer ${token}` : '' }
            });
            if (res.ok) deletedCount++;
        } catch (e) {
            console.error("Item delete failed:", e);
        }
    }

    resetSelection();
    showToastMessage(`Deleted ${deletedCount} subject(s).`, 'success');
    fetchActiveSubjects();
}

/**
 * Clear selection state and uncheck select-all
 */
function resetSelection() {
    selectedSubjects.clear();
    const selectAllCb = document.getElementById('select-all-checkbox');
    if (selectAllCb) selectAllCb.checked = false;
    updateCount();
}

/**
 * Delete Single Subject
 */
async function deleteSingleSubject(encodedName, encodedGrade) {
    const subName = decodeURIComponent(encodedName);
    if (!confirm(`Delete "${subName}" from catalog?`)) return;

    const token = localStorage.getItem('token') || localStorage.getItem('jwt') || '';

    try {
        const response = await fetch(`/api/admin/subjects/${encodeURIComponent(subName)}`, {
            method: 'DELETE',
            headers: { 'Authorization': token ? `Bearer ${token}` : '' }
        });

        if (response.ok) {
            showToastMessage(`Deleted "${subName}"`, 'success');
            fetchActiveSubjects();
        } else {
            alert("Failed to delete subject.");
        }
    } catch (err) {
        console.error("Single delete error:", err);
    }
}

/**
 * Add New Subject Action
 */
async function addNewSubject(event) {
    if (event) event.preventDefault();

    const titleInput = document.getElementById("subjectTitle") || document.querySelector("textarea");
    const gradeSelect = document.getElementById("gradeLevel") || document.querySelector("select");

    const rawTitle = titleInput ? titleInput.value.trim() : "";
    const gradeLevel = gradeSelect ? gradeSelect.value : "Junior High School - Grade 7";

    if (!rawTitle) {
        alert("Please enter at least one subject title.");
        return;
    }

    const token = localStorage.getItem("token") || localStorage.getItem("jwt") || "";

    try {
        const response = await fetch("/api/admin/subjects", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": token ? `Bearer ${token}` : ""
            },
            body: JSON.stringify({ subjectName: rawTitle, gradeLevel: gradeLevel })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) throw new Error(data.error || "Failed to add subject.");

        if (titleInput) titleInput.value = "";
        showToastMessage(`Subject(s) added successfully!`, "success");
        fetchActiveSubjects();

    } catch (error) {
        console.error("Add error:", error);
        showToastMessage(error.message, "error");
    }
}

/**
 * Floating status notification
 */
function showToastMessage(message, type = 'success') {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.style.position = 'fixed';
        toast.style.top = '20px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.padding = '10px 20px';
        toast.style.borderRadius = '6px';
        toast.style.zIndex = '9999';
        toast.style.fontSize = '0.85rem';
        toast.style.fontWeight = 'bold';
        document.body.appendChild(toast);
    }
    toast.style.background = type === 'success' ? '#00d2ff' : '#ff5f5f';
    toast.style.color = '#000';
    toast.textContent = message;
    toast.style.display = 'block';

    setTimeout(() => { toast.style.display = 'none'; }, 3000);
}
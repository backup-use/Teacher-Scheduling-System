let selectedSubjects = new Map();

document.addEventListener('DOMContentLoaded', () => {
    fetchActiveSubjects();

    const addBtn = document.getElementById('add-subject-btn') || document.querySelector('.btn-add-subject') || document.querySelector('.btn-submit');
    if (addBtn) {
        addBtn.addEventListener('click', addNewSubject);
    }
});

/**
 * Fetch active subjects and group them by individual Grade Levels (7 to 12)
 */
async function fetchActiveSubjects() {
    const mainContainer = document.getElementById('subjects-list-container') || 
                          document.getElementById('list-junior')?.parentElement || 
                          document.querySelector('.subjects-display-area');

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

        renderGradeFolders(mainContainer, rawList);

    } catch (err) {
        console.error("Fetch Error:", err);
        if (mainContainer) {
            mainContainer.innerHTML = '<div style="color: #ff5f5f; font-size: 0.85rem; padding: 10px;">Failed to load subjects.</div>';
        }
    }
}

/**
 * Render Clickable Accordion Folders for Grades 7 to 12
 */
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

    // Group subjects into their specific grade categories
    const groupedData = {};
    gradeLevels.forEach(gl => groupedData[gl] = []);

    rawList.forEach(sub => {
        const subGrade = String(typeof sub === 'object' ? (sub.gradeLevel || sub.grade_level || '') : '').toLowerCase();
        
        if (subGrade.includes('7')) groupedData["Junior High School - Grade 7"].push(sub);
        else if (subGrade.includes('8')) groupedData["Junior High School - Grade 8"].push(sub);
        else if (subGrade.includes('9')) groupedData["Junior High School - Grade 9"].push(sub);
        else if (subGrade.includes('10')) groupedData["Junior High School - Grade 10"].push(sub);
        else if (subGrade.includes('11')) groupedData["Senior High School - Grade 11"].push(sub);
        else if (subGrade.includes('12')) groupedData["Senior High School - Grade 12"].push(sub);
        else groupedData["Junior High School - Grade 7"].push(sub); // Default fallback
    });

    container.innerHTML = gradeLevels.map((gradeTitle, idx) => {
        const items = groupedData[gradeTitle] || [];
        const folderId = `folder-grade-${idx + 7}`;

        const itemsHTML = items.length === 0 
            ? `<div style="color: #64748b; font-size: 0.8rem; font-style: italic; padding: 8px 12px;">No subjects registered.</div>`
            : items.map(sub => {
                const subName = typeof sub === 'object' ? (sub.name || sub.subjectName || sub.title || 'Unknown Subject') : sub;
                const gradeLevel = typeof sub === 'object' ? (sub.gradeLevel || sub.grade_level || gradeTitle) : gradeTitle;
                
                const key = `${subName}::${gradeLevel}`;
                const isChecked = selectedSubjects.has(key);

                return `
                    <div class="subject-row" style="display: flex; justify-content: space-between; align-items: center; background: rgba(30, 41, 59, 0.5); padding: 8px 12px; margin-bottom: 6px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.03);">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <input type="checkbox" class="subject-checkbox" ${isChecked ? 'checked' : ''} onchange="handleCheckboxChange(event, '${encodeURIComponent(subName)}', '${encodeURIComponent(gradeLevel)}')" style="width: 16px; height: 16px; cursor: pointer; accent-color: #00d2ff;">
                            <span style="font-weight: 500; color: #e2e8f0; font-size: 0.85rem;">📚 ${subName}</span>
                        </div>
                        <button onclick="deleteSingleSubject('${encodeURIComponent(subName)}', '${encodeURIComponent(gradeLevel)}')" title="Delete Subject" style="background: transparent; border: none; cursor: pointer; font-size: 0.9rem; opacity: 0.7; transition: opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">🗑️</button>
                    </div>
                `;
            }).join('');

        return `
            <div class="grade-folder-card" style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(0, 210, 255, 0.2); border-radius: 8px; margin-bottom: 10px; overflow: hidden;">
                <div class="folder-header" onclick="toggleGradeFolder('${folderId}')" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(30, 41, 59, 0.8); cursor: pointer; user-select: none;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span id="${folderId}-icon" style="color: #00d2ff; font-size: 1rem;">📁</span>
                        <h4 style="color: #ffffff; margin: 0; font-size: 0.9rem; font-weight: bold;">${gradeTitle}</h4>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="background: rgba(0, 210, 255, 0.15); color: #00d2ff; font-size: 0.72rem; font-weight: bold; padding: 2px 8px; border-radius: 10px; border: 1px solid rgba(0, 210, 255, 0.3);">
                            ${items.length} Subject${items.length !== 1 ? 's' : ''}
                        </span>
                        <span id="${folderId}-arrow" style="color: #94a3b8; font-size: 0.75rem; transition: transform 0.2s;">▼</span>
                    </div>
                </div>
                <div id="${folderId}" class="folder-body" style="display: none; padding: 8px 12px; background: rgba(15, 23, 42, 0.4); border-top: 1px solid rgba(255, 255, 255, 0.05);">
                    ${itemsHTML}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Dynamic Expand / Collapse Toggle Event
 */
function toggleGradeFolder(folderId) {
    const body = document.getElementById(folderId);
    const arrow = document.getElementById(`${folderId}-arrow`);
    const icon = document.getElementById(`${folderId}-icon`);

    if (!body) return;

    if (body.style.display === "none") {
        body.style.display = "block";
        if (arrow) arrow.style.transform = "rotate(180deg)";
        if (icon) icon.innerText = "📂";
    } else {
        body.style.display = "none";
        if (arrow) arrow.style.transform = "rotate(0deg)";
        if (icon) icon.innerText = "📁";
    }
}

/**
 * Checkbox change dynamic state
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

    if (countSpan) countSpan.innerText = selectedSubjects.size;

    if (deleteBtn) {
        if (selectedSubjects.size > 0) {
            deleteBtn.disabled = false;
            deleteBtn.style.background = '#ef4444';
            deleteBtn.style.color = '#ffffff';
            deleteBtn.style.borderColor = '#ef4444';
            deleteBtn.style.cursor = 'pointer';
            deleteBtn.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.4)';
        } else {
            deleteBtn.disabled = true;
            deleteBtn.style.background = 'rgba(239, 68, 68, 0.2)';
            deleteBtn.style.color = '#64748b';
            deleteBtn.style.borderColor = 'transparent';
            deleteBtn.style.cursor = 'not-allowed';
            deleteBtn.style.boxShadow = 'none';
        }
    }
}

/**
 * Delete Checked Batch Action
 */
async function executeBatchDelete() {
    if (selectedSubjects.size === 0) return;

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

function resetSelection() {
    selectedSubjects.clear();
    const selectAllCb = document.getElementById('select-all-checkbox');
    if (selectAllCb) selectAllCb.checked = false;
    updateCount();
}

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
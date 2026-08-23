let isSelectionMode = false;
let selectedSubjectNames = new Set();

document.addEventListener('DOMContentLoaded', () => {
    ensureDOMContainersExist();
    fetchActiveSubjects();

    const addBtn = document.getElementById('add-subject-btn') || document.querySelector('.btn-add-subject') || document.querySelector('.btn-submit');
    if (addBtn) {
        addBtn.addEventListener('click', addNewSubject);
    }
});

/**
 * Autonomously inject list containers into the right panel if missing in HTML
 */
function ensureDOMContainersExist() {
    let listJunior = document.getElementById('list-junior');
    if (listJunior) return; // Containers exist, no action needed

    // Hanapin ang Right Panel Box under "Active Institution Offerings"
    const headings = Array.from(document.querySelectorAll('*'));
    const offeringLabel = headings.find(el => el.textContent && el.textContent.includes('Active Institution Offerings'));
    
    let targetBox = null;
    if (offeringLabel) {
        let parent = offeringLabel.parentElement;
        while (parent && !targetBox) {
            targetBox = parent.querySelector('.subject-display-box') || parent.querySelector('div[style*="background"]');
            if (!targetBox) parent = parent.parentElement;
        }
    }

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
 * Fetch and render subjects
 */
async function fetchActiveSubjects() {
    ensureDOMContainersExist();

    const listJunior = document.getElementById('list-junior');
    const listGrade11 = document.getElementById('list-grade11');
    const listGrade12 = document.getElementById('list-grade12');

    if (listJunior) listJunior.innerHTML = '<div style="color: #00d2ff; font-size: 0.8rem;">Syncing subjects...</div>';

    try {
        const token = localStorage.getItem('token') || localStorage.getItem('jwt') || '';
        const response = await fetch('/api/admin/subjects', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error(`Server status ${response.status}`);

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

        // Categorize by Grade Level
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
        if (listJunior) listJunior.innerHTML = '<div style="color: #ff5f5f; font-size: 0.8rem;">Failed to render subject list.</div>';
    }
}

/**
 * Render items inside target partition
 */
function renderPartition(container, items) {
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = '<div style="color: #64748b; font-size: 0.8rem; font-style: italic; padding: 3px 0;">No subjects registered.</div>';
        return;
    }

    container.innerHTML = items.map(sub => {
        const subName = typeof sub === 'string' ? sub : (sub.name || sub.subjectName || sub.title || 'Unknown Subject');
        const gradeTag = (typeof sub === 'object' && (sub.gradeLevel || sub.grade_level)) ? `<span style="font-size: 0.7rem; background: rgba(0,210,255,0.15); color: #00d2ff; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">${sub.gradeLevel || sub.grade_level}</span>` : '';
        const isChecked = selectedSubjectNames.has(subName);

        return `
            <div class="subject-row" style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 6px 10px; margin-bottom: 6px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
                <div style="display: flex; align-items: center; gap: 8px;">
                    ${isSelectionMode ? `
                        <input type="checkbox" value="${encodeURIComponent(subName)}" ${isChecked ? 'checked' : ''} onchange="handleCheckboxChange(event, '${encodeURIComponent(subName)}')" style="width: 15px; height: 15px; cursor: pointer;">
                    ` : ''}
                    <span style="font-weight: 500; color: #fff; font-size: 0.85rem;">📚 ${subName} ${gradeTag}</span>
                </div>
                ${!isSelectionMode ? `
                    <button onclick="deleteSubject('${encodeURIComponent(subName)}')" title="Delete" style="background: transparent; border: none; cursor: pointer; font-size: 0.85rem;">🗑️</button>
                ` : ''}
            </div>
        `;
    }).join('');
}

/**
 * Batch Add Action
 */
async function addNewSubject(event) {
    if (event) event.preventDefault();

    const titleInput = document.getElementById("subjectTitle") || document.querySelector("textarea") || document.querySelector("input[type='text']");
    const gradeSelect = document.getElementById("gradeLevel") || document.querySelector("select");

    const rawTitle = titleInput ? titleInput.value.trim() : "";
    const gradeLevel = gradeSelect ? gradeSelect.value : "Junior High School - Grade 7";

    if (!rawTitle) {
        alert("Please enter a subject title.");
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

        if (!response.ok) {
            throw new Error(data.error || `Server Error ${response.status}`);
        }

        if (titleInput) titleInput.value = "";
        
        showToastMessage(data.message || `Successfully added subject(s) to ${gradeLevel}!`, "success");
        fetchActiveSubjects();

    } catch (error) {
        console.error("Post error:", error);
        showToastMessage(error.message, "error");
    }
}

/**
 * Selection and Toast Utilities
 */
function toggleSelectionMode() {
    isSelectionMode = !isSelectionMode;
    selectedSubjectNames.clear();
    fetchActiveSubjects();
}

function handleCheckboxChange(e, encodedName) {
    const subName = decodeURIComponent(encodedName);
    if (e.target.checked) selectedSubjectNames.add(subName);
    else selectedSubjectNames.delete(subName);
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

async function deleteSubject(encodedName) {
    const name = decodeURIComponent(encodedName);
    if (!confirm(`Delete "${name}"?`)) return;

    try {
        const token = localStorage.getItem('token') || localStorage.getItem('jwt') || '';
        const response = await fetch(`/api/admin/subjects/${encodeURIComponent(name)}`, {
            method: 'DELETE',
            headers: { 'Authorization': token ? `Bearer ${token}` : '' }
        });

        if (response.ok) {
            showToastMessage(`Deleted ${name}`, 'success');
            fetchActiveSubjects();
        } else {
            alert("Could not delete subject.");
        }
    } catch (err) {
        console.error("Delete error:", err);
    }
}
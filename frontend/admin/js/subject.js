let isSelectionMode = false;
let selectedSubjectNames = new Set();

document.addEventListener('DOMContentLoaded', () => {
    fetchActiveSubjects();

    const addBtn = document.getElementById('add-subject-btn') || document.querySelector('.btn-add-subject') || document.querySelector('.btn-submit');
    if (addBtn) {
        addBtn.addEventListener('click', addNewSubject);
    }
});

/**
 * Fetch and populate subjects partitioned into Junior High, Grade 11, and Grade 12
 */
async function fetchActiveSubjects() {
    const listJunior = document.getElementById('list-junior');
    const listGrade11 = document.getElementById('list-grade11');
    const listGrade12 = document.getElementById('list-grade12');

    if (listJunior) listJunior.innerHTML = '<div style="color: #00d2ff; padding: 5px; font-size: 0.85rem;">Syncing...</div>';
    if (listGrade11) listGrade11.innerHTML = '<div style="color: #00d2ff; padding: 5px; font-size: 0.85rem;">Syncing...</div>';
    if (listGrade12) listGrade12.innerHTML = '<div style="color: #00d2ff; padding: 5px; font-size: 0.85rem;">Syncing...</div>';

    try {
        const response = await fetch('/api/admin/subjects', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const partitions = await response.json();

        renderPartition(listJunior, partitions.junior || []);
        renderPartition(listGrade11, partitions.grade11 || []);
        renderPartition(listGrade12, partitions.grade12 || []);

    } catch (err) {
        console.error("Catalog load error:", err);
        const errHtml = '<div style="color: #ff5f5f; padding: 5px; font-size: 0.85rem;">Connection failed.</div>';
        if (listJunior) listJunior.innerHTML = errHtml;
        if (listGrade11) listGrade11.innerHTML = errHtml;
        if (listGrade12) listGrade12.innerHTML = errHtml;
    }
}

/**
 * Toggle selection mode for checkbox-based batch deletion
 */
function toggleSelectionMode() {
    isSelectionMode = !isSelectionMode;
    selectedSubjectNames.clear();

    const toggleBtn = document.getElementById('btn-toggle-selection');
    if (toggleBtn) {
        toggleBtn.style.background = isSelectionMode ? '#00d2ff' : 'rgba(0, 210, 255, 0.1)';
        toggleBtn.style.color = isSelectionMode ? '#000' : '#00d2ff';
        toggleBtn.innerText = isSelectionMode ? '❌ Cancel Selection' : '☑️ Select / Batch Delete';
    }

    updateBatchDeleteBar();
    fetchActiveSubjects(); // Re-render lists with/without checkboxes
}

/**
 * Render HTML list items for a specific partition container
 */
function renderPartition(container, items) {
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = '<div style="color: #a0a0c0; font-size: 0.85rem; font-style: italic; padding: 4px 0;">No subjects listed.</div>';
        return;
    }

    container.innerHTML = items.map(sub => {
        const subName = typeof sub === 'string' ? sub : sub.name;
        const isChecked = selectedSubjectNames.has(subName);

        return `
            <div class="subject-row" style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 8px 12px; margin-bottom: 6px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
                <div style="display: flex; align-items: center; gap: 10px;">
                    ${isSelectionMode ? `
                        <input type="checkbox" class="subject-checkbox" value="${encodeURIComponent(subName)}" ${isChecked ? 'checked' : ''} onchange="handleCheckboxChange(event, '${encodeURIComponent(subName)}')" style="width: 16px; height: 16px; cursor: pointer; accent-color: #ff5f5f;">
                    ` : ''}
                    <span style="font-weight: 500; color: #fff; font-size: 0.9rem;">📚 ${subName}</span>
                </div>
                ${!isSelectionMode ? `
                    <button class="btn-delete-sub" onclick="deleteSubject('${encodeURIComponent(subName)}')" title="Delete Subject" style="background: transparent; border: none; cursor: pointer; font-size: 0.9rem;">🗑️</button>
                ` : ''}
            </div>
        `;
    }).join('');
}

/**
 * Track checked/unchecked items in selection mode
 */
function handleCheckboxChange(e, encodedName) {
    const subName = decodeURIComponent(encodedName);
    if (e.target.checked) {
        selectedSubjectNames.add(subName);
    } else {
        selectedSubjectNames.delete(subName);
    }
    updateBatchDeleteBar();
}

/**
 * Show/Hide batch delete bar and update count
 */
function updateBatchDeleteBar() {
    const bar = document.getElementById('batch-delete-bar');
    const countSpan = document.getElementById('selected-count');

    if (bar && countSpan) {
        countSpan.innerText = selectedSubjectNames.size;
        bar.style.display = (isSelectionMode && selectedSubjectNames.size > 0) ? 'flex' : 'none';
    }
}

/**
 * Execute Batch Add (Splits comma-separated subjects)
 */
async function addNewSubject(event) {
  if (event) event.preventDefault();

  const titleInput = document.getElementById("subjectTitle") || document.querySelector("textarea") || document.querySelector("input[type='text']");
  const gradeSelect = document.getElementById("gradeLevel") || document.querySelector("select");

  const rawTitle = titleInput ? titleInput.value.trim() : "";
  const gradeLevel = gradeSelect ? gradeSelect.value : "Junior High School";

  if (!rawTitle) {
    alert("Please enter at least one subject title.");
    return;
  }

  try {
    const response = await fetch("/api/admin/subjects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        subjectName: rawTitle,
        gradeLevel: gradeLevel
      })
    });

    // Basahin muna bilang text para maiwasan ang SyntaxError sa JSON parse
    const responseText = await response.text();
    let data = {};
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error("Server raw response:", responseText);
      throw new Error(`Server returned status ${response.status}. Please check Render server logs.`);
    }

    if (!response.ok) {
      throw new Error(data.error || `Server Error (${response.status})`);
    }

    // Clear input on success
    if (titleInput) titleInput.value = "";
    
    alert(data.message || "Subject(s) added successfully!");
    
    // Refresh list if function exists
    if (typeof loadSubjects === "function") {
      loadSubjects();
    } else {
      window.location.reload();
    }

  } catch (error) {
    console.error("Post error:", error);
    alert("Failed to add subject: " + error.message);
  }
}

/**
 * Execute Batch Delete on checked items
 */
async function executeBatchDelete() {
    const targets = Array.from(selectedSubjectNames);
    if (targets.length === 0) return;

    if (!confirm(`Are you sure you want to delete ${targets.length} selected subject(s)?`)) {
        return;
    }

    try {
        const response = await fetch('/api/admin/subjects/batch-delete', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ subjectNames: targets })
        });

        const data = await response.json();

        if (response.ok) {
            selectedSubjectNames.clear();
            toggleSelectionMode(); // Reset selection mode

            const partitions = data.partitions || data.data || data;
            renderPartition(document.getElementById('list-junior'), partitions.junior || []);
            renderPartition(document.getElementById('list-grade11'), partitions.grade11 || []);
            renderPartition(document.getElementById('list-grade12'), partitions.grade12 || []);

            showToastMessage(`Successfully deleted ${targets.length} subjects.`, 'success');
        } else {
            showToastMessage(data.error || "Failed to delete selected subjects.", 'error');
        }
    } catch (err) {
        console.error("Batch delete network error:", err);
        showToastMessage("System error during batch delete.", 'error');
    }
}

/**
 * Non-blocking floating status notification positioned at TOP CENTER
 */
function showToastMessage(message, type = 'success') {
    let toast = document.getElementById('toast-notification');
    
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.style.position = 'fixed';
        toast.style.top = '20px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%) translateY(-20px)';
        toast.style.padding = '12px 24px';
        toast.style.borderRadius = '8px';
        toast.style.color = '#fff';
        toast.style.fontWeight = '600';
        toast.style.fontSize = '0.9rem';
        toast.style.zIndex = '9999';
        toast.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
        toast.style.transition = 'all 0.3s cubic-bezier(0.68, -0.55, 0.27, 1.55)';
        toast.style.textAlign = 'center';
        toast.style.pointerEvents = 'none';
        document.body.appendChild(toast);
    }

    toast.style.background = type === 'success' ? '#00d2ff' : '#ff5f5f';
    toast.style.color = type === 'success' ? '#000' : '#fff';
    toast.style.border = type === 'success' ? '1px solid #00d2ff' : '1px solid #ff5f5f';
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-20px)';
    }, 3000);
}

/**
 * Permanently delete a single subject entry from backend
 */
async function deleteSubject(encodedName) {
    const name = decodeURIComponent(encodedName);
    
    if (!confirm(`Are you sure you want to remove "${name}" from the school master subjects catalog?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/subjects/${encodeURIComponent(name)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();

        if (response.ok) {
            renderPartition(document.getElementById('list-junior'), data.junior || []);
            renderPartition(document.getElementById('list-grade11'), data.grade11 || []);
            renderPartition(document.getElementById('list-grade12'), data.grade12 || []);
            showToastMessage(`Deleted "${name}"`, 'success');
        } else {
            alert(data.error || "Failed to drop entry from system database.");
        }
    } catch (err) {
        console.error("Deletion request network error:", err);
        alert("System error: Could not reach backend server.");
    }
}
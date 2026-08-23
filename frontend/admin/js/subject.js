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
 * Fetch and automatically organize ALL grade levels dynamically
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

    // 1. Kunan ang buong listahan ng subjects mula sa server response
    let rawList = [];
    if (Array.isArray(data)) {
      rawList = data;
    } else if (data.subjects && Array.isArray(data.subjects)) {
      rawList = data.subjects;
    } else {
      // Kung ipinasa na naka-partition
      rawList = [
        ...(data.junior || []),
        ...(data.grade11 || []),
        ...(data.grade12 || []),
        ...(data.other || [])
      ];
    }

    // 2. I-filter nang tama bawat Grade Level papunta sa kani-kanilang HTML list container:
    
    // Junior High (Grade 7, Grade 8, Grade 9, Grade 10)
    const juniorSubjects = rawList.filter(item => {
      const g = (typeof item === 'object' ? item.gradeLevel || item.grade_level || '' : '').toLowerCase();
      return g.includes('junior') || g.includes('grade 7') || g.includes('grade 8') || g.includes('grade 9') || g.includes('grade 10') || (!g.includes('11') && !g.includes('12'));
    });

    // Grade 11
    const g11Subjects = rawList.filter(item => {
      const g = (typeof item === 'object' ? item.gradeLevel || item.grade_level || '' : '').toLowerCase();
      return g.includes('11');
    });

    // Grade 12
    const g12Subjects = rawList.filter(item => {
      const g = (typeof item === 'object' ? item.gradeLevel || item.grade_level || '' : '').toLowerCase();
      return g.includes('12');
    });

    // 3. I-render sa HTML boxes
    renderPartition(listJunior, juniorSubjects);
    renderPartition(listGrade11, g11Subjects);
    renderPartition(listGrade12, g12Subjects);

  } catch (err) {
    console.error("Catalog load error:", err);
    const errHtml = '<div style="color: #ff5f5f; padding: 5px; font-size: 0.85rem;">Failed to fetch subjects.</div>';
    if (listJunior) listJunior.innerHTML = errHtml;
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
    fetchActiveSubjects(); 
}

/**
 * Render HTML list items for a specific partition container
 */
function renderPartition(container, items) {
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = '<div style="color: #a0a0c0; font-size: 0.8rem; font-style: italic; padding: 4px 0;">No subjects added yet.</div>';
    return;
  }

  container.innerHTML = items.map(sub => {
    const subName = typeof sub === 'string' ? sub : (sub.name || sub.subjectName || sub.title);
    const gradeTag = typeof sub === 'object' && (sub.gradeLevel || sub.grade_level) ? `<span style="font-size: 0.7rem; background: rgba(0,210,255,0.15); color: #00d2ff; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">${sub.gradeLevel || sub.grade_level}</span>` : '';
    const isChecked = selectedSubjectNames.has(subName);

    return `
      <div class="subject-row" style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 8px 12px; margin-bottom: 6px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
        <div style="display: flex; align-items: center; gap: 8px;">
          ${isSelectionMode ? `
            <input type="checkbox" class="subject-checkbox" value="${encodeURIComponent(subName)}" ${isChecked ? 'checked' : ''} onchange="handleCheckboxChange(event, '${encodeURIComponent(subName)}')" style="width: 16px; height: 16px; cursor: pointer; accent-color: #ff5f5f;">
          ` : ''}
          <span style="font-weight: 500; color: #fff; font-size: 0.85rem;">📚 ${subName} ${gradeTag}</span>
        </div>
        ${!isSelectionMode ? `
          <button class="btn-delete-sub" onclick="deleteSubject('${encodeURIComponent(subName)}')" title="Delete Subject" style="background: transparent; border: none; cursor: pointer; font-size: 0.85rem;">🗑️</button>
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
 * Execute Batch Add (Splits comma-separated subjects) - FIXED AUTH & ERROR PARSING
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

  const token = localStorage.getItem("token") || localStorage.getItem("jwt") || "";

  try {
    const response = await fetch("/api/admin/subjects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": token ? `Bearer ${token}` : ""
      },
      credentials: "include",
      body: JSON.stringify({
        subjectName: rawTitle,
        gradeLevel: gradeLevel
      })
    });

    const responseText = await response.text();
    let data = {};
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error("Server raw response:", responseText);
      throw new Error(`Server returned status ${response.status}. Please check backend logs.`);
    }

    if (!response.ok) {
      throw new Error(data.error || `Error ${response.status}: Action prohibited.`);
    }

    // Clear textarea/input
    if (titleInput) titleInput.value = "";
    
    showToastMessage(data.message || "Subject(s) added successfully!", "success");
    
    // Update partitioning in DOM live
    if (data.partitions) {
      renderPartition(document.getElementById('list-junior'), data.partitions.junior || []);
      renderPartition(document.getElementById('list-grade11'), data.partitions.grade11 || []);
      renderPartition(document.getElementById('list-grade12'), data.partitions.grade12 || []);
    } else {
      fetchActiveSubjects();
    }

  } catch (error) {
    console.error("Post error:", error);
    showToastMessage("Failed to add subject: " + error.message, "error");
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
        const token = localStorage.getItem('token') || localStorage.getItem('jwt') || '';
        const response = await fetch('/api/admin/subjects/batch-delete', {
            method: 'DELETE',
            headers: {
                'Authorization': token ? `Bearer ${token}` : '',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ subjectNames: targets })
        });

        const data = await response.json();

        if (response.ok) {
            selectedSubjectNames.clear();
            toggleSelectionMode();

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
 * Non-blocking floating status notification
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
        const token = localStorage.getItem('token') || localStorage.getItem('jwt') || '';
        const response = await fetch(`/api/admin/subjects/${encodeURIComponent(name)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': token ? `Bearer ${token}` : ''
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
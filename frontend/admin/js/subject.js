document.addEventListener('DOMContentLoaded', () => {
    fetchActiveSubjects();

    // Attach click handler to the add button if present
    const addBtn = document.getElementById('add-subject-btn') || document.querySelector('.btn-add-subject');
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
 * Render HTML list items for a specific partition container
 */
function renderPartition(container, items) {
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = '<div style="color: #a0a0c0; font-size: 0.85rem; font-style: italic; padding: 4px 0;">No subjects listed.</div>';
        return;
    }

    container.innerHTML = items.map(sub => `
        <div class="subject-row" style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 8px 12px; margin-bottom: 6px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
            <span style="font-weight: 500; color: #fff; font-size: 0.9rem;">📚 ${sub.name}</span>
            <button class="btn-delete-sub" onclick="deleteSubject('${encodeURIComponent(sub.name)}')" title="Delete Subject" style="background: transparent; border: none; cursor: pointer; font-size: 0.9rem;">🗑️</button>
        </div>
    `).join('');
}

/**
 * Send a POST request with subject title and selected grade level (No confirmation popups)
 */
async function addNewSubject() {
    const input = document.getElementById('new-subject-name') 
               || document.getElementById('subjectName') 
               || document.querySelector('input[type="text"]');

    const gradeSelect = document.getElementById('grade-level-select') 
                     || document.getElementById('gradeLevel') 
                     || document.querySelector('select');

    if (!input) return;

    const subjectName = input.value.trim();
    const gradeLevel = gradeSelect ? gradeSelect.value : 'Junior High School';

    if (!subjectName) return;

    try {
        const response = await fetch('/api/admin/subjects', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ subjectName, gradeLevel })
        });

        const data = await response.json();

        if (response.ok) {
            // 1. Immediately clear input field
            input.value = ""; 

            // 2. Extract and update UI lists instantly
            const partitions = data.partitions || data.data || data;
            renderPartition(document.getElementById('list-junior'), partitions.junior || []);
            renderPartition(document.getElementById('list-grade11'), partitions.grade11 || []);
            renderPartition(document.getElementById('list-grade12'), partitions.grade12 || []);

            // 3. Show non-blocking floating success message (No OK button)
            showToastMessage(data.message || `Subject "${subjectName}" added successfully!`, 'success');
        } else {
            showToastMessage(data.error || "Failed to insert course entry.", 'error');
        }
    } catch (err) {
        console.error("Post error:", err);
        showToastMessage("Network error while adding subject.", 'error');
    }
}

/**
 * Non-blocking floating status notification positioned at TOP CENTER
 */
function showToastMessage(message, type = 'success') {
    let toast = document.getElementById('toast-notification');
    
    // Create element if it doesn't exist
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.style.position = 'fixed';
        toast.style.top = '20px'; // Position at top
        toast.style.left = '50%'; // Center horizontally
        toast.style.transform = 'translateX(-50%) translateY(-20px)'; // Perfect horizontal centering offset
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
    toast.style.color = type === 'success' ? '#000' : '#fff'; // Dark text on cyan for crisp contrast
    toast.style.border = type === 'success' ? '1px solid #00d2ff' : '1px solid #ff5f5f';
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';

    // Automatically slide up and fade out after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-20px)';
    }, 3000);
}

/**
 * Permanently delete a subject entry from the backend database
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
        } else {
            alert(data.error || "Failed to drop entry from system database.");
        }
    } catch (err) {
        console.error("Deletion request network error:", err);
        alert("System error: Could not reach backend server.");
    }
}
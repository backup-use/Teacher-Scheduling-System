document.addEventListener('DOMContentLoaded', fetchActiveSubjects);

/**
 * Fetch and list all school subjects from db.json
 */
async function fetchActiveSubjects() {
    const container = document.getElementById('catalog-list');
    container.innerHTML = '<div style="color: #00d2ff; padding: 10px; text-align: center;">Syncing data catalog...</div>';

    try {
        const response = await fetch('/api/admin/subjects', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const subjects = await response.json();

        if (!subjects || subjects.length === 0) {
            container.innerHTML = '<div style="color: #a0a0c0; padding: 15px; text-align: center; font-size: 0.9rem;">No subjects added yet.</div>';
            return;
        }

        container.innerHTML = subjects.map(sub => `
            <div class="subject-row">
                <span style="font-weight: 600; color: #fff;">📚 ${sub}</span>
                <button class="btn-delete-sub" onclick="deleteSubject('${sub}')" title="Delete Subject">🗑️</button>
            </div>
        `).join('');

    } catch (err) {
        console.error("Catalog load error:", err);
        container.innerHTML = '<div style="color: #ff5f5f; padding: 10px; text-align: center;">Connection to database failed.</div>';
    }
}

/**
 * Send a POST request to save a new subject
 */
async function addNewSubject() {
    const input = document.getElementById('new-subject-name');
    const subjectName = input.value.trim();

    if (!subjectName) {
        alert("Please type a valid subject name!");
        return;
    }

    try {
        const response = await fetch('/api/admin/subjects', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ subjectName })
        });

        if (response.ok) {
            input.value = ""; // Reset input field
            fetchActiveSubjects(); // Reload list directly
        } else {
            alert("Failed to insert. This course entry might already exist.");
        }
    } catch (err) {
        alert("Network communication issue. Could not reach server.");
    }
}

/**
 * Permanently delete a subject entry from the backend database
 * @param {string} name - The text label of the subject to be removed
 */
async function deleteSubject(name) {
    // Show a clean confirmation dialog before altering core catalog records
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

        const result = await response.json();

        if (response.ok) {
            // Re-render the user interface listings dynamically on success
            fetchActiveSubjects(); 
        } else {
            alert(result.error || "Failed to drop entry from system database.");
        }
    } catch (err) {
        console.error("Deletion request network error:", err);
        alert("System error: Could not reach backend server.");
    }
}
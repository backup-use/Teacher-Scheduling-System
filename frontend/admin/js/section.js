// Helper function para makuha ang Authorization token
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token && token !== 'null' && token !== 'undefined') {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

// Renders the section row cards down the list column panel from Backend API
async function renderSectionsUIList() {
    const listContainer = document.getElementById('sections-list');
    if (!listContainer) return;

    try {
        const response = await fetch('/api/admin/sections', {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error("Failed to fetch sections.");
        
        const savedSections = await response.json();
        
        if (savedSections.length === 0) {
            listContainer.innerHTML = `<div style="color: #64748b; padding: 15px; text-align: center;">No academic sections configured yet.</div>`;
            return;
        }
        
        listContainer.innerHTML = "";
        
        savedSections.forEach((section) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = "section-card-item";
            
            itemDiv.innerHTML = `
                <div class="section-details-meta">
                    <span class="section-title-text">📅 ${section.name}</span>
                    <span class="section-count-badge">👥 Size: ${section.students} students</span>
                </div>
                <button onclick="deleteSectionItem('${section.id}')" class="btn-delete-row-action" title="Remove Academic Section">🗑️</button>
            `;
            listContainer.appendChild(itemDiv);
        });
    } catch (error) {
        console.error("Error rendering sections:", error);
        listContainer.innerHTML = `<div style="color: #ff5f5f; padding: 15px; text-align: center;">⚠️ Failed to load sections from database.</div>`;
    }
}

// Triggers when clicking the "CREATE COHORT SECTION" Action Button
async function addNewSection() {
    const nameField = document.getElementById('section-name');
    const studentsField = document.getElementById('section-students');

    if (!nameField || !studentsField) {
        console.error("Layout Error: HTML inputs are missing their correct configuration IDs.");
        return;
    }

    const nameValue = nameField.value.trim();
    const studentsValue = parseInt(studentsField.value, 10);

    if (!nameValue || isNaN(studentsValue) || studentsValue <= 0) {
        alert("⚠️ Input Validation Error: Please provide a valid Section Name and an enrollment size greater than 0.");
        return;
    }

    const dynamicSectionData = {
        id: "sec-id-" + Date.now(),
        name: nameValue,
        students: studentsValue
    };

    try {
        const response = await fetch('/api/admin/sections', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(dynamicSectionData)
        });

        if (!response.ok) throw new Error("Failed to save section.");

        nameField.value = "";
        studentsField.value = "";
        
        renderSectionsUIList();
    } catch (error) {
        console.error("Error adding section:", error);
        alert("⚠️ Database Error: Could not save the academic section permanently.");
    }
}

// Deletes a specific section using its unique backend ID
async function deleteSectionItem(id) {
    if (!confirm("Are you sure you want to delete this section?")) return;

    try {
        const response = await fetch(`/api/admin/sections/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error("Failed to delete section.");

        renderSectionsUIList();
    } catch (error) {
        console.error("Error deleting section:", error);
        alert("⚠️ Database Error: Failed to remove the section entry.");
    }
}

window.addEventListener('DOMContentLoaded', renderSectionsUIList);
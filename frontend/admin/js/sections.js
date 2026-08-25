// Helper function to extract Authorization headers
function getAuthHeaders() {
    const token = localStorage.getItem('token') || localStorage.getItem('jwt');
    const headers = { 'Content-Type': 'application/json' };
    if (token && token !== 'null' && token !== 'undefined') {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

// Trigger auto-fading toast notification
function showToastMessage(msg) {
    let toast = document.getElementById('toast-notification');
    
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.className = 'toast-popup';
        toast.style.position = 'fixed';
        toast.style.top = '20px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.padding = '10px 20px';
        toast.style.borderRadius = '6px';
        toast.style.background = '#00d2ff';
        toast.style.color = '#000';
        toast.style.fontWeight = 'bold';
        toast.style.zIndex = '9999';
        document.body.appendChild(toast);
    }
    
    toast.innerText = msg;
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.display = 'none';
    }, 2000);
}

// Fetch available rooms from the DB and populate the select element
async function fetchAndPopulateRooms() {
    const roomSelect = document.getElementById('assignedRoom') || document.getElementById('section-room');
    if (!roomSelect) return;

    try {
        const response = await fetch('/api/admin/rooms', {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error("Failed to fetch rooms.");

        const roomsData = await response.json();
        const rooms = Array.isArray(roomsData) ? roomsData : (roomsData.rooms || []);

        roomSelect.innerHTML = '<option value="">Select Room...</option>';

        if (rooms.length === 0) {
            roomSelect.innerHTML += '<option value="" disabled>No rooms found. Please add rooms first.</option>';
            return;
        }

        rooms.forEach(room => {
            const roomName = room.roomName || room.name || room.roomNumber || 'Unnamed Room';
            const roomId = room._id || room.id || roomName;
            
            const option = document.createElement('option');
            option.value = roomId;
            option.textContent = roomName;
            roomSelect.appendChild(option);
        });

    } catch (error) {
        console.error("Error fetching rooms:", error);
        roomSelect.innerHTML = '<option value="">Failed to load rooms</option>';
    }
}

// Render section cards into the container list panel
async function renderSectionsUIList() {
    const listContainer = document.getElementById('sections-list-container') || document.getElementById('sections-list');
    if (!listContainer) return;

    try {
        const response = await fetch('/api/admin/sections', {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error("Failed to fetch sections.");
        
        const savedSections = await response.json();
        const sectionsList = Array.isArray(savedSections) ? savedSections : (savedSections.sections || []);
        
        if (sectionsList.length === 0) {
            listContainer.innerHTML = `<div style="color: #64748b; padding: 15px; text-align: center;">No academic sections configured yet.</div>`;
            return;
        } 
        
        listContainer.innerHTML = "";
        
        sectionsList.forEach((section) => {
            const itemDiv = document.createElement('div');
            itemDiv.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: rgba(30, 41, 59, 0.5); padding: 10px 14px; margin-bottom: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);";
            
            const name = section.sectionName || section.name || "Unnamed Section";
            const grade = section.gradeLevel || section.grade || "No Grade";
            const room = section.assignedRoom?.roomName || section.assignedRoom || section.roomName || "No Room Assigned";
            const secId = section._id || section.id || name;

            itemDiv.innerHTML = `
                <div>
                    <div style="font-weight: bold; color: #ffffff; font-size: 0.9rem;">📅 ${name}</div>
                    <div style="font-size: 0.78rem; color: #94a3b8; margin-top: 2px;">
                        <span>🏷️ ${grade}</span> • <span style="color: #00d2ff;">🏠 ${room}</span>
                    </div>
                </div>
                <button onclick="deleteSectionItem('${encodeURIComponent(secId)}')" style="background: transparent; border: none; cursor: pointer; opacity: 0.8; font-size: 0.9rem;" title="Remove Academic Section">🗑️</button>
            `;
            listContainer.appendChild(itemDiv);
        });
    } catch (error) {
        console.error("Error rendering sections:", error);
        listContainer.innerHTML = `<div style="color: #ff5f5f; padding: 15px; text-align: center;">⚠️ Failed to load sections from database.</div>`;
    }
}

// Action trigger for adding a section
async function addNewSection(event) {
    if (event) event.preventDefault();

    const nameField = document.getElementById('sectionName') || document.getElementById('section-name');
    const gradeField = document.getElementById('sectionGrade') || document.getElementById('gradeLevel');
    const roomField = document.getElementById('assignedRoom') || document.getElementById('section-room');

    const nameValue = nameField ? nameField.value.trim() : "";
    const gradeValue = gradeField ? gradeField.value : "";
    const roomValue = roomField ? roomField.value : "";

    if (!nameValue) {
        alert("⚠️ Please provide a valid Section Name.");
        return;
    }

    const payload = {
        sectionName: nameValue,
        gradeLevel: gradeValue,
        assignedRoom: roomValue
    };

    try {
        const response = await fetch('/api/admin/sections', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("Failed to save section.");

        if (nameField) nameField.value = "";
        
        showToastMessage("✅ Section registered successfully!");
        renderSectionsUIList();
    } catch (error) {
        console.error("Error adding section:", error);
        alert("⚠️ Database Error: Could not save the academic section permanently.");
    }
}

// Delete section entry
async function deleteSectionItem(encodedId) {
    const id = decodeURIComponent(encodedId);
    if (!confirm("Are you sure you want to delete this section?")) return;

    try {
        const response = await fetch(`/api/admin/sections/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error("Failed to delete section.");

        showToastMessage("Deleted section.");
        renderSectionsUIList();
    } catch (error) {
        console.error("Error deleting section:", error);
        alert("⚠️ Database Error: Failed to remove the section entry.");
    }
}

// Bind events on load
window.addEventListener('DOMContentLoaded', () => {
    fetchAndPopulateRooms();
    renderSectionsUIList();

    const addBtn = document.getElementById('add-section-btn') || document.querySelector('.btn-add-section');
    if (addBtn) {
        addBtn.addEventListener('click', addNewSection);
    }
});

window.addNewSection = addNewSection;
window.deleteSectionItem = deleteSectionItem;
window.renderSectionsUIList = renderSectionsUIList
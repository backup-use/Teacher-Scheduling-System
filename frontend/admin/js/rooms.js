// Helper function to extract Authorization headers with JWT fallback
function getAuthHeaders() {
    const token = localStorage.getItem('token') || localStorage.getItem('jwt') || '';
    const headers = { 'Content-Type': 'application/json' };
    if (token && token !== 'null' && token !== 'undefined' && token !== '') {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

// Dynamic auto-fading toast notification
function showToastMessage(msg) {
    let toast = document.getElementById('toast-notification');
    
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); padding: 10px 20px; border-radius: 6px; background: #00d2ff; color: #000; font-weight: bold; z-index: 9999; font-size: 0.85rem;';
        document.body.appendChild(toast);
    }
    
    toast.innerText = msg;
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.display = 'none';
    }, 2000);
}

/**
 * Fetches rooms and paints them into the container list
 */
async function renderRoomsUIList() {
    const listContainer = document.getElementById('rooms-list-container') || 
                          document.getElementById('rooms-list') || 
                          document.querySelector('.rooms-display-area');

    if (!listContainer) return;

    try {
        const response = await fetch('/api/admin/rooms', {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to fetch rooms.`);

        const responseData = await response.json();
        const savedRooms = Array.isArray(responseData) ? responseData : (responseData.rooms || []);
        
        if (savedRooms.length === 0) {
            listContainer.innerHTML = `<div style="color: #64748b; padding: 15px; text-align: center; font-size: 0.85rem;">No rooms configured yet.</div>`;
            return;
        }
        
        listContainer.innerHTML = "";
        
        savedRooms.forEach((room) => {
            const itemDiv = document.createElement('div');
            itemDiv.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: rgba(30, 41, 59, 0.5); padding: 10px 14px; margin-bottom: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);";
            
            const roomName = room.roomName || room.name || room.roomNumber || room.designation || 'Unnamed Room';
            const capacity = room.capacity || room.maxCapacity || room.seatingCapacity || 0;
            const roomId = room._id || room.id || roomName;
            
            itemDiv.innerHTML = `
                <div>
                    <div style="font-weight: bold; color: #ffffff; font-size: 0.9rem;">🏠 ${roomName}</div>
                    <div style="font-size: 0.78rem; color: #94a3b8; margin-top: 2px;">
                        <span>👥 Max Capacity: <strong style="color: #00d2ff;">${capacity} pax</strong></span>
                    </div>
                </div>
                <button onclick="deleteRoomItem('${encodeURIComponent(roomId)}')" style="background: transparent; border: none; cursor: pointer; opacity: 0.8; font-size: 0.9rem;" title="Remove Facility">🗑️</button>
            `;
            listContainer.appendChild(itemDiv);
        });
    } catch (error) {
        console.error("Error rendering rooms:", error);
        listContainer.innerHTML = `<div style="color: #ff5f5f; padding: 15px; text-align: center; font-size: 0.85rem;">⚠️ Failed to load rooms from server.</div>`;
    }
}

/**
 * Handles adding a room when clicking the REGISTER ROOM button
 */
async function addNewRoom(event) {
    if (event) event.preventDefault();

    const roomNameField = document.getElementById('roomName') || document.getElementById('room-name');
    const roomCapacityField = document.getElementById('roomCapacity') || document.getElementById('room-capacity');

    if (!roomNameField) {
        console.error("Layout Error: HTML input for room name is missing.");
        return;
    }

    const nameValue = roomNameField.value.trim();
    const capacityValue = roomCapacityField ? parseInt(roomCapacityField.value, 10) : 40;

    if (!nameValue) {
        alert("⚠️ Validation Error: Please provide a valid Room Name.");
        return;
    }

    const newlyConfiguredRoom = {
        name: nameValue,
        roomName: nameValue,
        roomNumber: nameValue,
        capacity: isNaN(capacityValue) || capacityValue <= 0 ? 40 : capacityValue,
        maxCapacity: isNaN(capacityValue) || capacityValue <= 0 ? 40 : capacityValue
    };

    try {
        const response = await fetch('/api/admin/rooms', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(newlyConfiguredRoom)
        });

        if (!response.ok) throw new Error("Failed to save room.");

        roomNameField.value = "";
        if (roomCapacityField) roomCapacityField.value = "";

        showToastMessage("✅ Room registered successfully!");
        renderRoomsUIList();
    } catch (error) {
        console.error("Error adding room:", error);
        alert("⚠️ Database Error: Could not save the room facility.");
    }
}

/**
 * Deletes a room by ID
 */
async function deleteRoomItem(encodedId) {
    const id = decodeURIComponent(encodedId);
    if (!confirm("Are you sure you want to delete this room?")) return;

    try {
        const response = await fetch(`/api/admin/rooms/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Failed to delete room: ${response.status} ${errorData}`);
        }

        showToastMessage("Deleted room.");
        renderRoomsUIList();
    } catch (error) {
        console.error("Error deleting room:", error);
        alert(`⚠️ Database Error: Failed to remove room.`);
    }
}

// Global export for HTML inline triggers
window.addNewRoom = addNewRoom;
window.deleteRoomItem = deleteRoomItem;
window.renderRoomsUIList = renderRoomsUIList;

// Event listeners setup
document.addEventListener('DOMContentLoaded', function() {
    renderRoomsUIList();
    
    const roomForm = document.getElementById('room-form');
    if (roomForm) {
        roomForm.addEventListener('submit', addNewRoom);
    }

    const addBtn = document.getElementById('add-room-btn') || document.querySelector('.btn-add-room');
    if (addBtn) {
        addBtn.addEventListener('click', addNewRoom);
    }
});
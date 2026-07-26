// Helper function para makuha ang Authorization token
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

/**
 * Reads data states from internal engines and renders updated rows on screens.
 */
async function renderRoomsUIList() {
    const listContainer = document.getElementById('rooms-list');
    if (!listContainer) return; // Fail-silent framework guard loop

    try {
        const response = await fetch('/api/admin/rooms', {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error("Failed to fetch rooms.");

        const savedRooms = await response.json();
        
        // Check if any items are available to draw inside our browser DOM viewport tree
        if (savedRooms.length === 0) {
            listContainer.innerHTML = `<div class="empty-notice-state">No rooms configured yet.</div>`;
            return;
        }
        
        listContainer.innerHTML = ""; // Wipe container targets to avoid messy duplicated prints
        
        savedRooms.forEach((room) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = "room-card-item";
            
            // Ipasa ang room.id sa delete function para sa permanenteng tracking
            itemDiv.innerHTML = `
                <div class="room-details-meta">
                    <strong class="room-title-text">🏠 ${room.name}</strong>
                    <span class="room-capacity-badge">👥 Max: ${room.capacity} pax</span>
                </div>
                <button onclick="deleteRoomItem('${room.id}')" class="btn-delete-row-action" title="Remove Facility Spatial Box">🗑️</button>
            `;
            listContainer.appendChild(itemDiv);
        });
    } catch (error) {
        console.error("Error rendering rooms:", error);
        listContainer.innerHTML = `<div class="empty-notice-state" style="color: #ff5f5f;">⚠️ Failed to load rooms from server.</div>`;
    }
}

/**
 * Handles form field extraction data submissions and commits elements safely.
 */
async function addNewRoom() {
    const roomNameField = document.getElementById('room-name');
    const roomCapacityField = document.getElementById('room-capacity');

    const nameValue = roomNameField.value.trim();
    const capacityValue = parseInt(roomCapacityField.value, 10);

    // Form Validation Check
    if (!nameValue || isNaN(capacityValue) || capacityValue <= 0) {
        alert("⚠️ Validation Error: Please provide a valid Room Designation Name and a positive Seating Capacity count.");
        return;
    }

    // Map object blueprint specifications precisely matching scheduler-engine parameters
    const newlyConfiguredRoom = {
        id: "rm-id-" + Date.now(), 
        name: nameValue,
        capacity: capacityValue
    };

    try {
        const response = await fetch('/api/admin/rooms', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(newlyConfiguredRoom)
        });

        if (!response.ok) throw new Error("Failed to save room.");

        // Clear user input areas automatically to provide responsive tactile interactions
        roomNameField.value = "";
        roomCapacityField.value = "";

        console.log("💾 Room facility committed to server layers successfully:", newlyConfiguredRoom);
        
        // Repaint UI immediately after record additions 
        renderRoomsUIList();
    } catch (error) {
        console.error("Error adding room:", error);
        alert("⚠️ Database Error: Could not save the room facility to the backend server.");
    }
}

/**
 * Removes target facility configurations from the database collection
 * @param {String} id - The unique backend ID of the room resource
 */
async function deleteRoomItem(id) {
    if (!confirm("Are you sure you want to delete this room?")) return;

    try {
        const response = await fetch(`/api/admin/rooms/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error("Failed to delete room.");
        
        // Repaint interface structures dynamically 
        renderRoomsUIList();
    } catch (error) {
        console.error("Error deleting room:", error);
        alert("⚠️ Database Error: Failed to drop the room deployment from backend registry.");
    }
}

// Hook life-cycle operations to populate active logs immediately upon safe initialization loops
window.addEventListener('DOMContentLoaded', renderRoomsUIList);
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

/**
 * Fetches rooms and paints them into #rooms-list
 */
async function renderRoomsUIList() {
    const listContainer = document.getElementById('rooms-list');
    if (!listContainer) return;

    try {
        const response = await fetch('/api/admin/rooms', {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error("Failed to fetch rooms.");

        const savedRooms = await response.json();
        console.log("Rooms returned from server:", savedRooms);
        
        if (!Array.isArray(savedRooms) || savedRooms.length === 0) {
            listContainer.innerHTML = `<div class="empty-notice-state" style="color: #a0a0c0; padding: 15px;">No rooms configured yet.</div>`;
            return;
        }
        
        listContainer.innerHTML = "";
        
        savedRooms.forEach((room) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = "room-card-item";
            
            const roomName = room.name || room.roomName || room.roomNumber || room.designation || room.room_name || 'Unnamed Room';
            const capacity = room.capacity || room.maxCapacity || room.seatingCapacity || 0;
            const roomId = room._id || room.id;
            
            itemDiv.innerHTML = `
                <div class="room-details-meta">
                    <strong class="room-title-text">🏠 ${roomName}</strong>
                    <span class="room-capacity-badge">👥 Max: ${capacity} pax</span>
                </div>
                <button onclick="deleteRoomItem('${roomId}')" class="btn-delete-row-action" title="Remove Facility">🗑️</button>
            `;
            listContainer.appendChild(itemDiv);
        });
    } catch (error) {
        console.error("Error rendering rooms:", error);
        listContainer.innerHTML = `<div class="empty-notice-state" style="color: #ff5f5f; padding: 15px;">⚠️ Failed to load rooms from server.</div>`;
    }
}

/**
 * Handles adding a room when clicking the REGISTER ROOM button
 */
function showToastMessage(msg) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;
    
    toast.innerText = msg;
    toast.classList.add('show');

    // Automatically remove after 2 seconds
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

async function addNewRoom() {
    const roomNameField = document.getElementById('room-name');
    const roomCapacityField = document.getElementById('room-capacity');

    if (!roomNameField || !roomCapacityField) return;

    const nameValue = roomNameField.value.trim();
    const capacityValue = parseInt(roomCapacityField.value, 10);

    if (!nameValue || isNaN(capacityValue) || capacityValue <= 0) {
        alert("⚠️ Validation Error: Please provide a valid Room Designation Name and Seating Capacity.");
        return;
    }

    const newlyConfiguredRoom = {
        name: nameValue,
        roomName: nameValue,
        roomNumber: nameValue,
        capacity: capacityValue,
        maxCapacity: capacityValue
    };

    try {
        const response = await fetch('/api/admin/rooms', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(newlyConfiguredRoom)
        });

        if (!response.ok) throw new Error("Failed to save room.");

        roomNameField.value = "";
        roomCapacityField.value = "";

        // Trigger auto-vanishing toast
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
async function deleteRoomItem(id) {
    if (!confirm("Are you sure you want to delete this room?")) return;

    try {
        const response = await fetch(`/api/admin/rooms/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Failed to delete room: ${response.status} ${errorData}`);
        }
        
        await renderRoomsUIList();
        console.log("Room deleted successfully!");
    } catch (error) {
        console.error("Error deleting room:", error);
        alert(`⚠️ Database Error: Failed to remove room. ${error.message}`);
    }
}

// ─── Attach functions globally to window so HTML onsubmit can trigger them ───
window.addNewRoom = addNewRoom;
window.deleteRoomItem = deleteRoomItem;
window.renderRoomsUIList = renderRoomsUIList;

// ─── Setup form submission handler ───
document.addEventListener('DOMContentLoaded', function() {
    // Initial rendering on page load
    renderRoomsUIList();
    
    // Attach the submit event to the form
    const roomForm = document.getElementById('room-form');
    if (roomForm) {
        roomForm.addEventListener('submit', function(event) {
            event.preventDefault();
            addNewRoom();
        });
        console.log("Room form submit handler attached");
    } else {
        console.warn("Room form not found");
    }
});
// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
let roomsCache = [];
let pendingDeleteRoomId = null;
let pendingDeleteRoomName = '';

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showToastMessage(message, type = 'success') {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.className = 'toast-popup';
        document.body.appendChild(toast);
    }

    const icon = type === 'success'
        ? '<i class="fa-solid fa-circle-check"></i>'
        : '<i class="fa-solid fa-circle-exclamation"></i>';

    toast.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
    toast.classList.toggle('error', type === 'error');
    toast.classList.add('show');

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

// ═══════════════════════════════════════════════════════════════
// RENDER ROOMS
// ═══════════════════════════════════════════════════════════════
async function renderRoomsUIList() {
    const listContainer = document.getElementById('rooms-list');
    if (!listContainer) return;

    listContainer.innerHTML = `
        <div class="rooms-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading facilities...
        </div>
    `;

    try {
        const response = await fetch('/api/admin/rooms', {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store'
        });

        if (response.status === 401 || response.status === 403) {
            window.location.href = '/auth/login.html';
            return;
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const responseData = await response.json();
        const savedRooms = Array.isArray(responseData)
            ? responseData
            : (responseData.rooms || []);

        roomsCache = savedRooms;

        if (savedRooms.length === 0) {
            listContainer.innerHTML = `
                <div class="rooms-empty">
                    <i class="fa-solid fa-door-closed"></i>
                    <p>No rooms configured yet.</p>
                    <small>Register your first facility on the left.</small>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = savedRooms.map((room) => {
            const roomName = room.roomName || room.name || room.roomNumber || 'Unnamed Room';
            const capacity = room.capacity || room.maxCapacity || 0;
            const roomId = room.id || room._id || roomName;

            return `
                <div class="room-card-item">
                    <div class="room-details-meta">
                        <div class="room-title-text">
                            <i class="fa-solid fa-door-open"></i>
                            ${escapeHtml(roomName)}
                        </div>
                        <span class="room-capacity-badge">
                            <i class="fa-solid fa-users"></i>
                            ${escapeHtml(capacity)} pax
                        </span>
                    </div>
                    <button type="button"
                            class="btn-delete-row-action"
                            title="Remove facility"
                            onclick="openDeleteRoomModal('${encodeURIComponent(roomId)}', '${encodeURIComponent(roomName)}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error("Error rendering rooms:", error);
        listContainer.innerHTML = `
            <div class="rooms-error">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>Failed to load rooms from server.</p>
                <small>${escapeHtml(error.message)}</small>
            </div>
        `;
    }
}

// ═══════════════════════════════════════════════════════════════
// ADD ROOM
// ═══════════════════════════════════════════════════════════════
async function addNewRoom(event) {
    if (event) event.preventDefault();

    const nameField = document.getElementById('room-name');
    const capacityField = document.getElementById('room-capacity');

    if (!nameField) return;

    const nameValue = nameField.value.trim();
    const capacityValue = capacityField ? parseInt(capacityField.value, 10) : 0;

    if (!nameValue) {
        showToastMessage('Please provide a room name.', 'error');
        nameField.focus();
        return;
    }

    if (isNaN(capacityValue) || capacityValue <= 0) {
        showToastMessage('Capacity must be a positive number.', 'error');
        capacityField?.focus();
        return;
    }

    const submitBtn = document.getElementById('btn-register-room');
    if (submitBtn) submitBtn.disabled = true;

    try {
        const response = await fetch('/api/admin/rooms', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: nameValue,
                roomName: nameValue,
                capacity: capacityValue
            })
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(result.error || 'Failed to save room.');
        }

        nameField.value = '';
        if (capacityField) capacityField.value = '';
        nameField.focus();

        showToastMessage('Room registered successfully.', 'success');
        await renderRoomsUIList();

    } catch (error) {
        console.error("Error adding room:", error);
        showToastMessage(error.message || 'Could not save the room.', 'error');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

// ═══════════════════════════════════════════════════════════════
// DELETE MODAL
// ═══════════════════════════════════════════════════════════════
function injectDeleteRoomModal() {
    if (document.getElementById('delete-room-modal')) return;

    const modalHTML = `
        <div id="delete-room-modal" class="room-modal-overlay">
            <div class="room-modal-box">
                <div class="room-modal-icon">
                    <i class="fa-solid fa-trash"></i>
                </div>
                <h2 class="room-modal-title">Remove this facility?</h2>
                <p class="room-modal-text">
                    <strong id="delete-room-name"></strong> will be permanently removed from the facilities catalog.
                </p>
                <ul class="room-modal-notes">
                    <li><i class="fa-solid fa-triangle-exclamation"></i> Sections assigned to this room will become unassigned.</li>
                    <li><i class="fa-solid fa-triangle-exclamation"></i> This action cannot be undone.</li>
                </ul>
                <div class="room-modal-actions">
                    <button type="button" class="room-modal-cancel" onclick="closeDeleteRoomModal()">Cancel</button>
                    <button type="button" class="room-modal-confirm" onclick="confirmDeleteRoom()">Yes, Remove Facility</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function openDeleteRoomModal(encodedId, encodedName) {
    pendingDeleteRoomId = decodeURIComponent(encodedId);
    pendingDeleteRoomName = decodeURIComponent(encodedName);

    const nameEl = document.getElementById('delete-room-name');
    if (nameEl) nameEl.textContent = pendingDeleteRoomName;

    document.getElementById('delete-room-modal')?.classList.add('active');
}

function closeDeleteRoomModal() {
    pendingDeleteRoomId = null;
    pendingDeleteRoomName = '';
    document.getElementById('delete-room-modal')?.classList.remove('active');
}

async function confirmDeleteRoom() {
    if (!pendingDeleteRoomId) return;
    const roomId = pendingDeleteRoomId;
    const roomName = pendingDeleteRoomName;
    closeDeleteRoomModal();

    try {
        const response = await fetch(`/api/admin/rooms/${encodeURIComponent(roomId)}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(result.error || 'Failed to delete room.');
        }

        showToastMessage(`"${roomName}" removed.`, 'success');
        await renderRoomsUIList();

    } catch (error) {
        console.error("Error deleting room:", error);
        showToastMessage(error.message || 'Could not remove the room.', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    injectDeleteRoomModal();
    renderRoomsUIList();

    const roomForm = document.getElementById('room-form');
    if (roomForm) {
        roomForm.addEventListener('submit', addNewRoom);
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDeleteRoomModal();
});
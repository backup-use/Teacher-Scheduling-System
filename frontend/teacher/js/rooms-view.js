document.addEventListener('DOMContentLoaded', () => {
    // 1. Session Protection Check
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('userRole');

    if (!token || role !== 'teacher') {
        alert('Unauthorized access! Redirecting to login.');
        window.location.href = '/index.html';
        return;
    }

    let allRooms = []; // Cache variable to hold data for quick local searching

    // 2. Fetch Rooms Data from your existing Backend API
    async function fetchRoomsDirectory() {
        try {
            // GRAB THE TOKEN: To authenticate against protected backend routes
            const sessionToken = localStorage.getItem('token');

            const response = await fetch('/api/admin/rooms', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${sessionToken}`,
                    'Content-Type': 'application/json'
                }
            }); 
            
            if (!response.ok) throw new Error('Failed to load rooms list.');

            allRooms = await response.json();
            renderRoomsTable(allRooms);

        } catch (error) {
            console.error('Error fetching rooms:', error);
            document.getElementById('rooms-rows').innerHTML = 
                `<tr><td colspan="3" style="text-align: center; color: #ff5252; padding: 2rem;">⚠️ Failed to load campus rooms directory.</td></tr>`;
        }
    }

    // 3. Render Table HTML Rows Function
    function renderRoomsTable(roomsArray) {
        const tbody = document.getElementById('rooms-rows');
        tbody.innerHTML = ''; // Clear out the loading placeholder

        if (roomsArray.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #aaa; padding: 2rem;">No matching rooms found.</td></tr>`;
            return;
        }

        roomsArray.forEach(room => {
            const tr = document.createElement('tr');

            // Handle property fallback names based on your database schema strings (e.g., roomName vs name)
            const roomName = room.roomName || room.name || 'Unnamed Room';
            const roomType = room.roomType || room.type || 'General Classroom';
            const capacity = room.capacity || room.maxStudents || '--';

            tr.innerHTML = `
                <td><strong>🏫 ${roomName}</strong></td>
                <td style="color: #ccc;">${roomType}</td>
                <td><span class="capacity-badge">${capacity} Seats</span></td>
            `;
            tbody.appendChild(tr);
        });
    }

    // 4. Live Search Filtering Logic
    const searchInput = document.getElementById('room-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            
            const filteredRooms = allRooms.filter(room => {
                const name = (room.roomName || room.name || '').toLowerCase();
                const type = (room.roomType || room.type || '').toLowerCase();
                return name.includes(query) || type.includes(query);
            });

            renderRoomsTable(filteredRooms);
        });
    }

    // 5. Handle Logout Request
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.clear();
            window.location.href = '/index.html?logout=success';
        });
    }

    // Fire the data engine fetch loop
    fetchRoomsDirectory();
});
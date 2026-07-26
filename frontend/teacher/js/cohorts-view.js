document.addEventListener('DOMContentLoaded', () => {
    // 1. Session Protection Check
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('userRole');
    const userName = localStorage.getItem('userName');

    if (!token || role !== 'teacher') {
        alert('Unauthorized access! Redirecting to login.');
        window.location.href = '/index.html';
        return;
    }

    // 2. Fetch active schedule allocations to parse unique cohorts
    async function loadTeacherCohorts() {
        try {
            // GRAB THE TOKEN: To pass through the backend authorization gate
            const sessionToken = localStorage.getItem('token');

            const response = await fetch('/api/timetable', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${sessionToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) throw new Error('Failed to retrieve timetable stream.');

            const fullSchedule = await response.json();

            // Filter out assignments matching this teacher's name (safeguarded with trim)
            const myClasses = fullSchedule.filter(slot => 
                slot.instructor && slot.instructor.toLowerCase().trim() === userName.toLowerCase().trim()
            );

            const container = document.getElementById('cohorts-container');
            container.innerHTML = ''; // Wipe loading feedback string

            if (myClasses.length === 0) {
                container.innerHTML = `<p style="color: #aaa; grid-column: 1/-1;">No student sections have been assigned to your profile in the current master timetable schedule.</p>`;
                return;
            }

            // Group the schedules by Section name so we don't display duplicate cards
            const uniqueCohortsMap = {};
            
            myClasses.forEach(item => {
                const sectionName = item.section || 'Unassigned Section';
                if (!uniqueCohortsMap[sectionName]) {
                    uniqueCohortsMap[sectionName] = {
                        name: sectionName,
                        subjects: new Set(),
                        rooms: new Set()
                    };
                }
                if (item.subject) uniqueCohortsMap[sectionName].subjects.add(item.subject);
                if (item.room) uniqueCohortsMap[sectionName].rooms.add(item.room);
            });

            // 3. Loop through grouped structures and print UI component cards
            Object.values(uniqueCohortsMap).forEach(cohort => {
                const card = document.createElement('div');
                card.className = 'cohort-card';

                const subjectList = Array.from(cohort.subjects).join(', ');
                const roomList = Array.from(cohort.rooms).join(', ');

                card.innerHTML = `
                    <div class="cohort-title">👥 ${cohort.name}</div>
                    <div class="cohort-meta">📍 <strong>Primary Locations:</strong> ${roomList || 'N/A'}</div>
                    <div><span class="badge-subject">📚 ${subjectList}</span></div>
                `;
                container.appendChild(card);
            });

        } catch (error) {
            console.error('Error computing cohort profile targets:', error);
            document.getElementById('cohorts-container').innerHTML = 
                `<p style="color: #ff5252;">⚠️ Failed to calculate student section data from the server.</p>`;
        }
    }

    // 4. Handle Logout Cleanup Requests
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.clear();
            window.location.href = '/index.html?logout=success';
        });
    }

    // Run processing matrix
    loadTeacherCohorts();
});
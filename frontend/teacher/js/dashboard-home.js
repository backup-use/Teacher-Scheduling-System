document.addEventListener('DOMContentLoaded', () => {
    // 1. Session Protection check
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('userRole');
    const userName = localStorage.getItem('userName');

    // Security Gate: Kick back to root login if they aren't authorized or a teacher
    if (!token || role !== 'teacher') {
        alert('Unauthorized access! Please login to your teacher account.');
        window.location.href = '/index.html'; // Adjust path back to your root login page if needed
        return;
    }

    // 2. Set Personal Welcome Text
    const welcomeText = document.getElementById('welcome-text');
    if (welcomeText && userName) {
        welcomeText.textContent = `Welcome back, Instructor ${userName}!`;
    }

    // 3. Handle Logout Request
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.clear(); // Wipe out auth credentials cleanly
            window.location.href = '/index.html?logout=success'; // Redirect back with toast triggers
        });
    }

// 4. Fetch Teacher Statistics Summary from Backend Timetable Data
    async function loadDashboardStats() {
        try {
            const sessionToken = localStorage.getItem('token');

            // Added the missing headers object here
            const response = await fetch('/api/timetable', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${sessionToken}`,
                    'Content-Type': 'application/json'
                }
            }); 
            
            if (!response.ok) throw new Error('Database fetch mismatch.');
            
            const timetableData = await response.json();
            
            // Filter schedule entries where the instructor matches our logged-in user
            const teacherClasses = timetableData.filter(item => 
                item.instructor && item.instructor.toLowerCase() === userName.toLowerCase()
            );

            // Extract unique subjects assigned to this teacher
            const uniqueSubjects = new Set(teacherClasses.map(item => item.subject));

            // Inject the stats counts into UI cards
            document.getElementById('stat-slots').textContent = `${teacherClasses.length} Slots`;
            document.getElementById('stat-subjects').textContent = `${uniqueSubjects.size} Active`;

            // Render summary box
            const summaryBox = document.getElementById('quick-summary-box');
            if (teacherClasses.length > 0) {
                summaryBox.innerHTML = `
                    <p style="color: #4caf50; font-weight: bold; margin-bottom: 0.5rem;">✅ Operational Status: Active Schedule Assigned</p>
                    <p>You have <strong>${teacherClasses.length} active periods</strong> running across 
                    <strong>${uniqueSubjects.size} subjects</strong> this week.</p>
                    <p style="margin-top: 1rem; font-size: 0.9rem; color: #00bcd4;">👉 Click "My Timetable" in the sidebar menu to view your complete week schedule grid or download the PDF copy.</p>
                `;
            } else {
                summaryBox.innerHTML = `
                    <p style="color: #ff9800; font-weight: bold;">⚠️ Operational Notice: No schedule allocated yet</p>
                    <p>The scheduler engine hasn't processed periods for your account yet, or your database targets are still being configured by the system admin.</p>
                `;
            }

        } catch (error) {
            console.error('Error rendering homepage details:', error);
            document.getElementById('quick-summary-box').innerHTML = 
                `<p style="color: #ff5252;">⚠️ Error connecting to server database endpoints.</p>`;
        }
    }

    // Fire the calculation loop
    loadDashboardStats();
});